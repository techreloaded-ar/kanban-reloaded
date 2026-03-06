import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '../models/schema.js';
import type { DatabaseInstance } from '../storage/database.js';
import type { ProjectConfiguration } from '../models/types.js';
import { ConfigService } from './configService.js';
import { ConfigRepository } from './configRepository.js';

const CREATE_CONFIG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

const DEFAULT_COLUMNS = [
  { id: 'backlog', name: 'Backlog', color: '#3498DB' },
  { id: 'in-progress', name: 'In Progress', color: '#E67E22' },
  { id: 'done', name: 'Done', color: '#2ECC71' },
];

const DEFAULT_CONFIGURATION: ProjectConfiguration = {
  agentCommand: null,
  serverPort: 3000,
  columns: DEFAULT_COLUMNS,
  workingDirectory: null,
  agentEnvironmentVariables: {},
};

/**
 * Crea un database in-memory con la tabella config gia creata.
 */
function createInMemoryDatabase(): { database: DatabaseInstance; close: () => void } {
  const sqliteConnection = new Database(':memory:');
  sqliteConnection.exec(CREATE_CONFIG_TABLE_SQL);
  const database = drizzle(sqliteConnection, { schema });
  return { database, close: () => sqliteConnection.close() };
}

/**
 * Raccoglie le directory temporanee create durante i test per la pulizia finale.
 */
const temporaryDirectories: string[] = [];

function createTemporaryProjectDirectory(): string {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-config-test-'));
  temporaryDirectories.push(temporaryDirectory);
  return temporaryDirectory;
}

/**
 * Scrive manualmente un file config.json nella directory del progetto per i test di seed.
 */
function writeLegacyConfigFile(projectDirectory: string, content: string): void {
  const kanbanDirectory = path.join(projectDirectory, '.kanban-reloaded');
  fs.mkdirSync(kanbanDirectory, { recursive: true });
  fs.writeFileSync(path.join(kanbanDirectory, 'config.json'), content, 'utf-8');
}

let testDatabase: DatabaseInstance;
let closeDatabase: () => void;

beforeEach(() => {
  const db = createInMemoryDatabase();
  testDatabase = db.database;
  closeDatabase = db.close;
});

afterEach(() => {
  closeDatabase();
  for (const directoryPath of temporaryDirectories) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    } catch {
      // Ignora errori di pulizia (file lock su Windows)
    }
  }
  temporaryDirectories.length = 0;
});

describe('ConfigService', () => {
  describe('loadConfiguration', () => {
    it('restituisce i valori di default quando il database e vuoto', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configService = new ConfigService(testDatabase, projectDirectory);

      const configuration = configService.loadConfiguration();

      expect(configuration.agentCommand).toBeNull();
      expect(configuration.serverPort).toBe(3000);
      expect(configuration.columns).toEqual(DEFAULT_COLUMNS);
      expect(configuration.workingDirectory).toBeNull();
      expect(configuration.agentEnvironmentVariables).toEqual({});
    });

    it('scrive i valori di default nel database quando e vuoto', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configService = new ConfigService(testDatabase, projectDirectory);

      configService.loadConfiguration();

      // Verifica che le chiavi siano state scritte nel DB
      const configRepository = new ConfigRepository(testDatabase);
      expect(configRepository.hasKey('serverPort')).toBe(true);
      expect(configRepository.hasKey('agentCommand')).toBe(true);
      expect(configRepository.hasKey('columns')).toBe(true);
    });

    it('legge i valori personalizzati dal database', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configRepository = new ConfigRepository(testDatabase);

      // Scrive valori personalizzati direttamente nel DB
      configRepository.setValueByKey('agentCommand', JSON.stringify('my-agent --run'));
      configRepository.setValueByKey('serverPort', JSON.stringify(4000));
      configRepository.setValueByKey('columns', JSON.stringify([
        { id: 'todo', name: 'Da Fare', color: '#FF0000' },
      ]));
      const configService = new ConfigService(testDatabase, projectDirectory);
      const configuration = configService.loadConfiguration();

      expect(configuration.agentCommand).toBe('my-agent --run');
      expect(configuration.serverPort).toBe(4000);
      expect(configuration.columns).toEqual([
        { id: 'todo', name: 'Da Fare', color: '#FF0000' },
      ]);
    });

    it('usa i valori di default per chiavi mancanti nel database (forward compatibility)', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configRepository = new ConfigRepository(testDatabase);

      // Scrive solo alcune chiavi
      configRepository.setValueByKey('serverPort', JSON.stringify(5000));

      const configService = new ConfigService(testDatabase, projectDirectory);
      const configuration = configService.loadConfiguration();

      expect(configuration.serverPort).toBe(5000);
      expect(configuration.agentCommand).toBeNull(); // default
      expect(configuration.columns).toEqual(DEFAULT_COLUMNS); // default
    });

    it('usa il valore di default per valori JSON malformati nel database', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configRepository = new ConfigRepository(testDatabase);

      configRepository.setValueByKey('serverPort', 'non-json-valido');
      configRepository.setValueByKey('agentCommand', JSON.stringify('valid-command'));

      const configService = new ConfigService(testDatabase, projectDirectory);
      const configuration = configService.loadConfiguration();

      expect(configuration.serverPort).toBe(3000); // fallback al default
      expect(configuration.agentCommand).toBe('valid-command'); // questo e valido
    });

    it('usa il valore di default per tipi di campo errati nel database', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configRepository = new ConfigRepository(testDatabase);

      // serverPort deve essere un numero, non una stringa
      configRepository.setValueByKey('serverPort', JSON.stringify('abc'));
      configRepository.setValueByKey('agentCommand', JSON.stringify(null));

      const configService = new ConfigService(testDatabase, projectDirectory);
      const configuration = configService.loadConfiguration();

      expect(configuration.serverPort).toBe(3000); // fallback al default
      expect(configuration.agentCommand).toBeNull();
    });
  });

  describe('saveConfiguration', () => {
    it('salva campi parziali e restituisce la configurazione completa', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configService = new ConfigService(testDatabase, projectDirectory);

      const result = configService.saveConfiguration({
        serverPort: 8080,
        agentCommand: 'custom-agent',
      });

      expect(result.serverPort).toBe(8080);
      expect(result.agentCommand).toBe('custom-agent');
      expect(result.columns).toEqual(DEFAULT_COLUMNS); // non modificato
    });

    it('persiste i campi nel database', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configService = new ConfigService(testDatabase, projectDirectory);

      configService.saveConfiguration({ serverPort: 9090 });

      // Verifica leggendo con una nuova istanza di ConfigService (stessa DB)
      const configService2 = new ConfigService(testDatabase, projectDirectory);
      const reloaded = configService2.loadConfiguration();

      expect(reloaded.serverPort).toBe(9090);
    });

    it('emette l evento configurationChanged dopo il salvataggio', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configService = new ConfigService(testDatabase, projectDirectory);

      const eventHandler = vi.fn();
      configService.on('configurationChanged', eventHandler);

      configService.saveConfiguration({ serverPort: 7070 });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      const emittedConfiguration = eventHandler.mock.calls[0][0] as ProjectConfiguration;
      expect(emittedConfiguration.serverPort).toBe(7070);
    });

    it('sovrascrive i valori precedenti con il merge', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configService = new ConfigService(testDatabase, projectDirectory);

      configService.saveConfiguration({ serverPort: 4000 });
      configService.saveConfiguration({ agentCommand: 'new-agent' });

      const configuration = configService.loadConfiguration();
      expect(configuration.serverPort).toBe(4000); // preservato dal primo save
      expect(configuration.agentCommand).toBe('new-agent'); // dal secondo save
    });
  });

  describe('seedFromConfigFile', () => {
    it('importa i valori dal file config.json legacy nel database', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const customConfig = {
        agentCommand: 'claude --prompt "{{title}}"',
        serverPort: 4500,
        columns: DEFAULT_COLUMNS,
        workingDirectory: null,
        agentEnvironmentVariables: { API_KEY: 'secret123' },
      };
      writeLegacyConfigFile(projectDirectory, JSON.stringify(customConfig, null, 2));

      const configService = new ConfigService(testDatabase, projectDirectory);
      configService.seedFromConfigFile();

      const configuration = configService.loadConfiguration();
      expect(configuration.agentCommand).toBe('claude --prompt "{{title}}"');
      expect(configuration.serverPort).toBe(4500);
      expect(configuration.agentEnvironmentVariables).toEqual({ API_KEY: 'secret123' });
    });

    it('rinomina il file config.json in config.json.imported dopo il seed', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      writeLegacyConfigFile(projectDirectory, JSON.stringify({ serverPort: 3000 }));

      const configService = new ConfigService(testDatabase, projectDirectory);
      configService.seedFromConfigFile();

      const originalPath = path.join(projectDirectory, '.kanban-reloaded', 'config.json');
      const importedPath = originalPath + '.imported';

      expect(fs.existsSync(originalPath)).toBe(false);
      expect(fs.existsSync(importedPath)).toBe(true);
    });

    it('e idempotente: non importa di nuovo se il seed e gia avvenuto', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      writeLegacyConfigFile(projectDirectory, JSON.stringify({ serverPort: 5000 }));

      const configService = new ConfigService(testDatabase, projectDirectory);
      configService.seedFromConfigFile();

      // Modifica il DB dopo il seed
      configService.saveConfiguration({ serverPort: 9999 });

      // Ricrea il file config.json con un valore diverso
      const kanbanDir = path.join(projectDirectory, '.kanban-reloaded');
      fs.writeFileSync(path.join(kanbanDir, 'config.json'), JSON.stringify({ serverPort: 1111 }), 'utf-8');

      // Un secondo seed non deve sovrascrivere il DB
      configService.seedFromConfigFile();

      const configuration = configService.loadConfiguration();
      expect(configuration.serverPort).toBe(9999); // non 1111
    });

    it('scrive i default nel database quando non esiste un file config.json', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      // Non creiamo nessun file config.json

      const configService = new ConfigService(testDatabase, projectDirectory);
      configService.seedFromConfigFile();

      const configuration = configService.loadConfiguration();
      expect(configuration).toEqual(DEFAULT_CONFIGURATION);
    });

    it('gestisce un file config.json con JSON malformato usando i default', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      writeLegacyConfigFile(projectDirectory, '{ invalid json }');

      const configService = new ConfigService(testDatabase, projectDirectory);
      configService.seedFromConfigFile();

      const configuration = configService.loadConfiguration();
      expect(configuration.serverPort).toBe(3000); // default
    });

    it('ignora il campo agentCommandExamples dal file legacy', () => {
      const projectDirectory = createTemporaryProjectDirectory();
      const configWithExamples = {
        agentCommand: 'my-agent',
        serverPort: 3000,
        agentCommandExamples: {
          _description: 'Esempi di template',
          claudeCode: "claude --prompt '{{title}}'",
        },
      };
      writeLegacyConfigFile(projectDirectory, JSON.stringify(configWithExamples, null, 2));

      const configService = new ConfigService(testDatabase, projectDirectory);
      configService.seedFromConfigFile();

      const configuration = configService.loadConfiguration();
      expect(configuration).not.toHaveProperty('agentCommandExamples');
      expect(configuration.agentCommand).toBe('my-agent');
    });
  });

});
