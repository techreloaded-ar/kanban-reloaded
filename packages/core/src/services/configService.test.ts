import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { ConfigService } from './configService.js';

/**
 * Raccoglie le directory temporanee create durante i test per la pulizia finale.
 */
const temporaryDirectories: string[] = [];

function createAndTrackTemporaryDirectory(): string {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-config-test-'));
  temporaryDirectories.push(temporaryDirectory);
  return temporaryDirectory;
}

/**
 * Scrive manualmente un file config.json nella directory del progetto,
 * creando la sottodirectory .kanban-reloaded/ se necessario.
 */
function writeConfigFileManually(projectDirectory: string, content: string): void {
  const kanbanDirectory = path.join(projectDirectory, '.kanban-reloaded');
  fs.mkdirSync(kanbanDirectory, { recursive: true });
  fs.writeFileSync(path.join(kanbanDirectory, 'config.json'), content, 'utf-8');
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

const DEFAULT_COLUMNS = [
  { id: 'backlog', name: 'Backlog', color: '#3498DB' },
  { id: 'in-progress', name: 'In Progress', color: '#E67E22' },
  { id: 'done', name: 'Done', color: '#2ECC71' },
];

describe('ConfigService', () => {
  it('crea config.json con valori di default quando il file non esiste', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const configService = new ConfigService(projectDirectory);

    const configuration = configService.loadConfiguration();

    // Il file deve esistere dopo la chiamata
    const configFilePath = path.join(projectDirectory, '.kanban-reloaded', 'config.json');
    expect(fs.existsSync(configFilePath)).toBe(true);

    // I valori restituiti devono essere quelli predefiniti
    expect(configuration.agentCommand).toBeNull();
    expect(configuration.serverPort).toBe(3000);
    expect(configuration.columns).toEqual(DEFAULT_COLUMNS);

    // Il contenuto del file deve corrispondere ai valori predefiniti
    const fileContent = fs.readFileSync(configFilePath, 'utf-8');
    const parsedFileContent = JSON.parse(fileContent) as Record<string, unknown>;
    expect(parsedFileContent['agentCommand']).toBeNull();
    expect(parsedFileContent['serverPort']).toBe(3000);
    expect(parsedFileContent['columns']).toEqual(DEFAULT_COLUMNS);
  });

  it('legge i valori personalizzati da un config.json esistente', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const customConfiguration = {
      agentCommand: 'my-agent --run',
      serverPort: 4000,
      columns: [
        { id: 'todo', name: 'Da Fare', color: '#FF0000' },
        { id: 'done', name: 'Completato', color: '#00FF00' },
      ],
    };
    writeConfigFileManually(projectDirectory, JSON.stringify(customConfiguration, null, 2));

    const configService = new ConfigService(projectDirectory);
    const configuration = configService.loadConfiguration();

    expect(configuration.agentCommand).toBe('my-agent --run');
    expect(configuration.serverPort).toBe(4000);
    expect(configuration.columns).toEqual(customConfiguration.columns);
  });

  it('lancia un errore con numero di riga per JSON invalido', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    // JSON malformato: virgola mancante dopo la seconda riga di contenuto
    const malformedJson = `{
  "agentCommand": null
  "serverPort": 3000
}`;
    writeConfigFileManually(projectDirectory, malformedJson);

    const configService = new ConfigService(projectDirectory);

    expect(() => configService.loadConfiguration()).toThrowError(/riga/);
  });

  it('lancia un errore di validazione per tipi di campo errati', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const invalidConfiguration = {
      agentCommand: null,
      serverPort: 'abc',
      columns: DEFAULT_COLUMNS,
    };
    writeConfigFileManually(projectDirectory, JSON.stringify(invalidConfiguration, null, 2));

    const configService = new ConfigService(projectDirectory);

    expect(() => configService.loadConfiguration()).toThrowError(/serverPort/);
    expect(() => configService.loadConfiguration()).toThrowError(/Errore di validazione/);
  });

  it('non sovrascrive un config.json esistente', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const configService = new ConfigService(projectDirectory);

    // Prima chiamata: crea il file con i valori predefiniti
    configService.loadConfiguration();

    // Modifica manualmente il file
    const configFilePath = path.join(projectDirectory, '.kanban-reloaded', 'config.json');
    const fileContent = fs.readFileSync(configFilePath, 'utf-8');
    const parsedContent = JSON.parse(fileContent) as Record<string, unknown>;
    parsedContent['serverPort'] = 5000;
    fs.writeFileSync(configFilePath, JSON.stringify(parsedContent, null, 2), 'utf-8');

    // Seconda chiamata: deve leggere il valore modificato, non sovrascriverlo
    const configuration = configService.loadConfiguration();

    expect(configuration.serverPort).toBe(5000);
  });

  it('applica i valori predefiniti quando il file contiene un oggetto vuoto', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    writeConfigFileManually(projectDirectory, '{}');

    const configService = new ConfigService(projectDirectory);
    const configuration = configService.loadConfiguration();

    expect(configuration.agentCommand).toBeNull();
    expect(configuration.serverPort).toBe(3000);
    expect(configuration.columns).toEqual(DEFAULT_COLUMNS);
  });

  it('include gli esempi di agentCommand nel file config.json creato di default', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const configService = new ConfigService(projectDirectory);

    configService.loadConfiguration();

    const configFilePath = path.join(projectDirectory, '.kanban-reloaded', 'config.json');
    const fileContent = fs.readFileSync(configFilePath, 'utf-8');
    const parsedFileContent = JSON.parse(fileContent) as Record<string, unknown>;

    // Il campo agentCommandExamples deve essere presente nel file su disco
    expect(parsedFileContent['agentCommandExamples']).toBeDefined();

    const examples = parsedFileContent['agentCommandExamples'] as Record<string, string>;
    expect(examples['_description']).toContain('Esempi di template');
    expect(examples['claudeCode']).toContain('{{title}}');
    expect(examples['claudeCode']).toContain('{{description}}');
    expect(examples['genericShell']).toContain('{{acceptanceCriteria}}');
  });

  it('ignora il campo agentCommandExamples quando legge un config.json esistente', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const configWithExamples = {
      agentCommand: null,
      serverPort: 3000,
      columns: DEFAULT_COLUMNS,
      agentCommandExamples: {
        _description: 'Esempi di template',
        claudeCode: "claude --prompt '{{title}}'",
      },
    };
    writeConfigFileManually(projectDirectory, JSON.stringify(configWithExamples, null, 2));

    const configService = new ConfigService(projectDirectory);
    const configuration = configService.loadConfiguration();

    // La configurazione restituita non deve contenere il campo agentCommandExamples
    expect(configuration).not.toHaveProperty('agentCommandExamples');
    expect(configuration.agentCommand).toBeNull();
    expect(configuration.serverPort).toBe(3000);
  });

  it('gestisce campi aggiuntivi sconosciuti senza errori', () => {
    const projectDirectory = createAndTrackTemporaryDirectory();
    const configurationWithExtraFields = {
      agentCommand: null,
      serverPort: 3000,
      columns: DEFAULT_COLUMNS,
      futureFeature: true,
      experimentalSetting: 'beta',
    };
    writeConfigFileManually(
      projectDirectory,
      JSON.stringify(configurationWithExtraFields, null, 2),
    );

    const configService = new ConfigService(projectDirectory);

    // Non deve lanciare errori
    const configuration = configService.loadConfiguration();

    // I campi standard devono essere presenti e corretti
    expect(configuration.agentCommand).toBeNull();
    expect(configuration.serverPort).toBe(3000);
    expect(configuration.columns).toEqual(DEFAULT_COLUMNS);
  });
});
