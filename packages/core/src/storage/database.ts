import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../models/schema.js';
import { KANBAN_DIRECTORY_NAME, DATABASE_FILENAME } from './constants.js';

const CREATE_TASKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    display_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    acceptance_criteria TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog', 'in-progress', 'done')),
    agent_running INTEGER NOT NULL DEFAULT 0,
    agent_log TEXT,
    agent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    execution_time REAL,
    position REAL NOT NULL DEFAULT 0
  )
`;

const CREATE_CONFIG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

const CREATE_SUBTASKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  )
`;

const CREATE_TASK_DEPENDENCIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS task_dependencies (
    blocking_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    blocked_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (blocking_task_id, blocked_task_id)
  )
`;

const CREATE_AGENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    command_template TEXT NOT NULL,
    working_directory TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )
`;

export type DatabaseInstance = BetterSQLite3Database<typeof schema>;

/**
 * Applica le migrazioni incrementali al database esistente.
 * Ogni migrazione verifica prima se la colonna/tabella esiste gia, per essere idempotente.
 */
function applyMigrations(connection: Database.Database): void {
  // Leggi le colonne attuali della tabella tasks
  const existingColumns = connection
    .prepare("PRAGMA table_info('tasks')")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(existingColumns.map((column) => column.name));

  // Migrazione US-016: aggiunge colonna 'agent' per supporto agent multipli (legacy)
  if (!columnNames.has('agent')) {
    connection.exec('ALTER TABLE tasks ADD COLUMN agent TEXT');
  }

  // Migrazione: crea tabella agents e aggiunge colonna agent_id a tasks
  connection.exec(CREATE_AGENTS_TABLE_SQL);

  if (!columnNames.has('agent_id')) {
    connection.exec('ALTER TABLE tasks ADD COLUMN agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL');
  }

  // Migrazione dati: sposta gli agenti dal blob JSON in config alla tabella agents
  migrateAgentsFromConfigToTable(connection);

  // Cleanup: rimuove la vecchia colonna 'agent' dalla tabella tasks (SQLite >= 3.35)
  // Rileggiamo le colonne perche agent_id potrebbe essere stato appena aggiunto
  const updatedColumns = connection
    .prepare("PRAGMA table_info('tasks')")
    .all() as Array<{ name: string }>;
  const updatedColumnNames = new Set(updatedColumns.map((column) => column.name));
  if (updatedColumnNames.has('agent') && updatedColumnNames.has('agent_id')) {
    connection.exec('ALTER TABLE tasks DROP COLUMN agent');
  }
}

/**
 * Migra gli agenti dalla chiave "agents" nella tabella config alla tabella agents dedicata.
 * Aggiorna anche il campo agent_id nelle task esistenti.
 * Operazione idempotente: se la chiave "agents" non esiste in config, non fa nulla.
 */
function migrateAgentsFromConfigToTable(connection: Database.Database): void {
  // Controlla se la chiave "agents" esiste nella tabella config
  const agentsConfigRow = connection
    .prepare("SELECT value FROM config WHERE key = 'agents'")
    .get() as { value: string } | undefined;

  if (!agentsConfigRow) {
    return; // Migrazione gia eseguita o nessun dato da migrare
  }

  let agentsMap: Record<string, unknown>;
  try {
    agentsMap = JSON.parse(agentsConfigRow.value) as Record<string, unknown>;
  } catch {
    // JSON invalido, rimuovi la chiave e basta
    connection.prepare("DELETE FROM config WHERE key = 'agents'").run();
    return;
  }

  // Mappa nome agente -> ID generato (per aggiornare le task)
  const agentNameToIdMap = new Map<string, string>();
  const currentTimestamp = new Date().toISOString();

  const insertAgentStatement = connection.prepare(
    'INSERT OR IGNORE INTO agents (id, name, command_template, working_directory, created_at) VALUES (?, ?, ?, ?, ?)',
  );

  const updateTaskAgentIdStatement = connection.prepare(
    'UPDATE tasks SET agent_id = ? WHERE agent = ?',
  );

  const transaction = connection.transaction(() => {
    for (const [agentName, agentValue] of Object.entries(agentsMap)) {
      const agentId = crypto.randomUUID();
      let commandTemplate: string;
      let workingDirectory: string | null = null;

      if (typeof agentValue === 'string') {
        commandTemplate = agentValue;
      } else if (typeof agentValue === 'object' && agentValue !== null) {
        const detailedConfig = agentValue as Record<string, unknown>;
        commandTemplate = typeof detailedConfig['command'] === 'string'
          ? detailedConfig['command']
          : '';
        workingDirectory = typeof detailedConfig['workingDirectory'] === 'string'
          ? detailedConfig['workingDirectory']
          : null;
      } else {
        continue; // Valore non valido, skip
      }

      if (!commandTemplate) continue;

      insertAgentStatement.run(agentId, agentName, commandTemplate, workingDirectory, currentTimestamp);
      agentNameToIdMap.set(agentName, agentId);
    }

    // Aggiorna le task: collega agent_id in base al nome agent
    for (const [agentName, agentId] of agentNameToIdMap) {
      updateTaskAgentIdStatement.run(agentId, agentName);
    }

    // Rimuovi la chiave "agents" dalla tabella config
    connection.prepare("DELETE FROM config WHERE key = 'agents'").run();
  });

  transaction();
}

/**
 * Risultato dell'inizializzazione del database.
 * Contiene l'istanza Drizzle ORM e una funzione per chiudere la connessione.
 */
export interface DatabaseInitializationResult {
  database: DatabaseInstance;
  closeConnection: () => void;
}

/**
 * Inizializza il database SQLite nella directory `.kanban-reloaded/` del progetto.
 *
 * Se la directory o il file non esistono, vengono creati automaticamente.
 * Se il database esiste già, viene riutilizzato senza sovrascritture o perdita di dati.
 *
 * @param projectDirectoryPath - Percorso assoluto della directory radice del progetto
 * @returns L'istanza Drizzle ORM configurata e una funzione per chiudere la connessione
 * @throws Error con messaggio chiaro se la directory non può essere creata (permessi)
 */
export function initializeDatabase(projectDirectoryPath: string): DatabaseInitializationResult {
  const kanbanDirectoryPath = path.join(projectDirectoryPath, KANBAN_DIRECTORY_NAME);
  const databaseFilePath = path.join(kanbanDirectoryPath, DATABASE_FILENAME);

  // Crea la directory .kanban-reloaded/ se non esiste
  try {
    fs.mkdirSync(kanbanDirectoryPath, { recursive: true });
  } catch (directoryCreationError: unknown) {
    const errorMessage = directoryCreationError instanceof Error
      ? directoryCreationError.message
      : String(directoryCreationError);
    throw new Error(
      `Impossibile creare la directory ${KANBAN_DIRECTORY_NAME}/ in ${projectDirectoryPath}. ` +
      `Verificare i permessi di scrittura nella directory del progetto. ` +
      `Dettaglio: ${errorMessage}`
    );
  }

  // Apri o crea il database SQLite
  let sqliteConnection: Database.Database;
  try {
    sqliteConnection = new Database(databaseFilePath);
  } catch (databaseOpenError: unknown) {
    const errorMessage = databaseOpenError instanceof Error
      ? databaseOpenError.message
      : String(databaseOpenError);
    throw new Error(
      `Impossibile aprire il database in ${databaseFilePath}. ` +
      `Verificare i permessi di scrittura e che il file non sia corrotto. ` +
      `Dettaglio: ${errorMessage}`
    );
  }

  // Configura pragmas per prestazioni e integrità
  sqliteConnection.pragma('journal_mode = WAL');
  sqliteConnection.pragma('foreign_keys = ON');

  // Crea le tabelle se non esistono (non sovrascrive dati esistenti)
  sqliteConnection.exec(CREATE_TASKS_TABLE_SQL);
  sqliteConnection.exec(CREATE_CONFIG_TABLE_SQL);
  sqliteConnection.exec(CREATE_AGENTS_TABLE_SQL);
  sqliteConnection.exec(CREATE_TASK_DEPENDENCIES_TABLE_SQL);
  sqliteConnection.exec(CREATE_SUBTASKS_TABLE_SQL);

  // Migrazione: aggiunge la colonna 'agent' se non esiste (US-016: supporto agent multipli)
  applyMigrations(sqliteConnection);

  // Crea l'istanza Drizzle ORM
  const database = drizzle(sqliteConnection, { schema });

  return {
    database,
    closeConnection: () => sqliteConnection.close(),
  };
}

/**
 * Cerca la directory radice del progetto risalendo l'albero delle directory
 * a partire dal percorso indicato (o dalla directory corrente).
 *
 * @param startingPath - Percorso da cui iniziare la ricerca (default: process.cwd())
 * @returns Il percorso della directory contenente `.kanban-reloaded/`, oppure null se non trovata
 */
export function discoverProjectDirectory(startingPath?: string): string | null {
  let currentPath = path.resolve(startingPath ?? process.cwd());

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidateKanbanPath = path.join(currentPath, KANBAN_DIRECTORY_NAME);

    try {
      const stats = fs.statSync(candidateKanbanPath);
      if (stats.isDirectory()) {
        return currentPath;
      }
    } catch {
      // La directory non esiste in questo livello, continuiamo a salire
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      // Raggiunta la radice del filesystem senza trovare .kanban-reloaded/
      return null;
    }
    currentPath = parentPath;
  }
}
