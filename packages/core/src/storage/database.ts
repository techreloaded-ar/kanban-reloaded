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

export type DatabaseInstance = BetterSQLite3Database<typeof schema>;

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
