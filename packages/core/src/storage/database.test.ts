import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, it, expect, afterEach } from 'vitest';
import { initializeDatabase, discoverProjectDirectory } from './database.js';

const KANBAN_DIRECTORY_NAME = '.kanban-reloaded';
const DATABASE_FILENAME = 'database.sqlite';

/**
 * Raccoglie le directory temporanee create durante i test per la pulizia finale.
 */
const temporaryDirectories: string[] = [];

function createAndTrackTemporaryDirectory(): string {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-test-'));
  temporaryDirectories.push(temporaryDirectory);
  return temporaryDirectory;
}

afterEach(() => {
  for (const directoryPath of temporaryDirectories) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    } catch {
      // Ignora errori di pulizia (file lock su Windows)
    }
  }
  temporaryDirectories.length = 0;
});

describe('initializeDatabase', () => {
  it('crea la directory .kanban-reloaded e il file database.sqlite al primo avvio', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();

    const { database, closeConnection } = initializeDatabase(projectDirectory);

    try {
      const kanbanDirectoryPath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME);
      const databaseFilePath = path.join(kanbanDirectoryPath, DATABASE_FILENAME);

      expect(fs.existsSync(kanbanDirectoryPath)).toBe(true);
      expect(fs.statSync(kanbanDirectoryPath).isDirectory()).toBe(true);
      expect(fs.existsSync(databaseFilePath)).toBe(true);
      expect(database).toBeDefined();
    } finally {
      closeConnection();
    }
  });

  it('crea le tabelle tasks e config con lo schema corretto', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();

    const { closeConnection } = initializeDatabase(projectDirectory);
    closeConnection();

    const databaseFilePath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME, DATABASE_FILENAME);
    const rawConnection = new Database(databaseFilePath);

    try {
      const tableRows = rawConnection
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = tableRows.map((row) => row.name);
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('config');

      // Verifica le colonne della tabella tasks
      const taskColumns = rawConnection
        .prepare("PRAGMA table_info('tasks')")
        .all() as Array<{ name: string }>;

      const taskColumnNames = taskColumns.map((column) => column.name);
      const expectedTaskColumns = [
        'id',
        'display_id',
        'title',
        'description',
        'acceptance_criteria',
        'priority',
        'status',
        'agent_running',
        'agent_log',
        'created_at',
        'execution_time',
        'position',
      ];
      for (const expectedColumn of expectedTaskColumns) {
        expect(taskColumnNames).toContain(expectedColumn);
      }

      // Verifica le colonne della tabella config
      const configColumns = rawConnection
        .prepare("PRAGMA table_info('config')")
        .all() as Array<{ name: string }>;

      const configColumnNames = configColumns.map((column) => column.name);
      expect(configColumnNames).toContain('key');
      expect(configColumnNames).toContain('value');
    } finally {
      rawConnection.close();
    }
  });

  it('riutilizza un database esistente senza perdere dati', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();

    // Prima inizializzazione: crea il database e inserisce un task
    const { closeConnection: closeFirstConnection } = initializeDatabase(projectDirectory);
    closeFirstConnection();

    const databaseFilePath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME, DATABASE_FILENAME);
    const rawConnectionForInsert = new Database(databaseFilePath);

    rawConnectionForInsert
      .prepare(
        `INSERT INTO tasks (id, display_id, title, created_at, position)
         VALUES ('test-id-001', 'TASK-001', 'Task di verifica persistenza', '2026-03-05T10:00:00Z', 1)`
      )
      .run();
    rawConnectionForInsert.close();

    // Seconda inizializzazione: il database deve essere riutilizzato
    const { closeConnection: closeSecondConnection } = initializeDatabase(projectDirectory);
    closeSecondConnection();

    const rawConnectionForVerify = new Database(databaseFilePath);

    try {
      const taskRow = rawConnectionForVerify
        .prepare("SELECT * FROM tasks WHERE id = 'test-id-001'")
        .get() as { id: string; title: string } | undefined;

      expect(taskRow).toBeDefined();
      expect(taskRow!.id).toBe('test-id-001');
      expect(taskRow!.title).toBe('Task di verifica persistenza');
    } finally {
      rawConnectionForVerify.close();
    }
  });

  it.skipIf(process.platform === 'win32')(
    'lancia un errore chiaro quando la directory non ha permessi di scrittura',
    () => {
      // Su Windows, fs.chmodSync non restringe effettivamente i permessi,
      // quindi questo test viene eseguito solo su Linux/macOS.
      const projectDirectory = createAndTrackTemporaryDirectory();

      fs.chmodSync(projectDirectory, 0o444);

      try {
        expect(() => initializeDatabase(projectDirectory)).toThrow(/Impossibile/);
      } finally {
        // Ripristina i permessi per la pulizia
        fs.chmodSync(projectDirectory, 0o755);
      }
    },
  );

  it('configura WAL come journal mode del database', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();

    const { closeConnection } = initializeDatabase(projectDirectory);
    closeConnection();

    const databaseFilePath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME, DATABASE_FILENAME);
    const rawConnection = new Database(databaseFilePath);

    try {
      const journalModeResult = rawConnection.pragma('journal_mode') as Array<{
        journal_mode: string;
      }>;
      expect(journalModeResult[0]?.journal_mode).toBe('wal');
    } finally {
      rawConnection.close();
    }
  });
});

describe('discoverProjectDirectory', () => {
  it('trova la directory .kanban-reloaded nella directory corrente', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const kanbanDirectoryPath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME);
    fs.mkdirSync(kanbanDirectoryPath);

    const discoveredPath = discoverProjectDirectory(projectDirectory);

    expect(discoveredPath).toBe(projectDirectory);
  });

  it('trova la directory .kanban-reloaded risalendo la gerarchia delle directory', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const kanbanDirectoryPath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME);
    fs.mkdirSync(kanbanDirectoryPath);

    // Crea una sottodirectory profonda
    const deepSubdirectory = path.join(projectDirectory, 'sub', 'deep');
    fs.mkdirSync(deepSubdirectory, { recursive: true });

    const discoveredPath = discoverProjectDirectory(deepSubdirectory);

    expect(discoveredPath).toBe(projectDirectory);
  });

  it('restituisce null quando nessuna directory .kanban-reloaded viene trovata', () => {
    const emptyDirectory = createAndTrackTemporaryDirectory();

    const discoveredPath = discoverProjectDirectory(emptyDirectory);

    // In un ambiente di test pulito, la directory temporanea non dovrebbe avere
    // antenati con .kanban-reloaded/, quindi ci aspettiamo null.
    expect(discoveredPath).toBeNull();
  });
});
