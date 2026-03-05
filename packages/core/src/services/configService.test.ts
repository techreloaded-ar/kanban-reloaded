import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, it, expect, afterEach } from 'vitest';
import { initializeDatabase } from '../storage/database.js';
import { ConfigService } from './configService.js';

const KANBAN_DIRECTORY_NAME = '.kanban-reloaded';
const DATABASE_FILENAME = 'database.sqlite';

/**
 * Raccoglie le directory temporanee create durante i test per la pulizia finale.
 */
const temporaryDirectories: string[] = [];

function createAndTrackTemporaryDirectory(): string {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-config-test-'));
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

describe('ConfigService.seedDefaultConfiguration', () => {
  it('inserisce i valori di configurazione predefiniti su un database vuoto', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const { database, closeConnection } = initializeDatabase(projectDirectory);
    const configService = new ConfigService(database);

    configService.seedDefaultConfiguration();
    closeConnection();

    const databaseFilePath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME, DATABASE_FILENAME);
    const rawConnection = new Database(databaseFilePath);

    try {
      const configRows = rawConnection
        .prepare('SELECT key, value FROM config ORDER BY key')
        .all() as Array<{ key: string; value: string }>;

      const configMap = new Map(configRows.map((row) => [row.key, JSON.parse(row.value) as unknown]));

      expect(configMap.get('serverPort')).toBe(3000);
      expect(configMap.get('agentPreset')).toBe('claude-code');
      expect(configMap.get('autoStart')).toBe(true);
      expect(configMap.get('commandTemplate')).toBe('claude-code --task "{{task_description}}"');
      expect(configMap.get('columns')).toEqual([
        { id: 'backlog', name: 'Backlog', color: '#3498DB' },
        { id: 'in-progress', name: 'In Progress', color: '#E67E22' },
        { id: 'done', name: 'Done', color: '#2ECC71' },
      ]);
    } finally {
      rawConnection.close();
    }
  });

  it('non sovrascrive i valori di configurazione esistenti', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const { database, closeConnection } = initializeDatabase(projectDirectory);
    const configService = new ConfigService(database);

    // Prima chiamata: inserisce i valori predefiniti
    configService.seedDefaultConfiguration();
    closeConnection();

    // Modifica manualmente il valore della porta del server
    const databaseFilePath = path.join(projectDirectory, KANBAN_DIRECTORY_NAME, DATABASE_FILENAME);
    const rawConnection = new Database(databaseFilePath);

    rawConnection
      .prepare("UPDATE config SET value = ? WHERE key = 'serverPort'")
      .run(JSON.stringify(4000));
    rawConnection.close();

    // Seconda chiamata con nuova connessione: non deve sovrascrivere il valore modificato
    const { database: databaseForSecondSeed, closeConnection: closeSecondConnection } = initializeDatabase(projectDirectory);
    const configServiceForSecondSeed = new ConfigService(databaseForSecondSeed);
    configServiceForSecondSeed.seedDefaultConfiguration();
    closeSecondConnection();

    const rawConnectionForVerify = new Database(databaseFilePath);

    try {
      const portRow = rawConnectionForVerify
        .prepare("SELECT value FROM config WHERE key = 'serverPort'")
        .get() as { value: string } | undefined;

      expect(portRow).toBeDefined();
      expect(JSON.parse(portRow!.value)).toBe(4000);
    } finally {
      rawConnectionForVerify.close();
    }
  });
});
