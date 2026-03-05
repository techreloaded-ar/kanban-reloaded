import fs from 'node:fs';
import path from 'node:path';
import { KANBAN_DIRECTORY_NAME, CONFIG_FILENAME } from '../storage/constants.js';
import type { ProjectConfiguration, ColumnConfiguration, ConfigurationFileError } from '../models/types.js';

const DEFAULT_COLUMNS: ColumnConfiguration[] = [
  { id: 'backlog', name: 'Backlog', color: '#3498DB' },
  { id: 'in-progress', name: 'In Progress', color: '#E67E22' },
  { id: 'done', name: 'Done', color: '#2ECC71' },
];

const DEFAULT_CONFIGURATION: ProjectConfiguration = {
  agentCommand: null,
  serverPort: 3000,
  columns: DEFAULT_COLUMNS,
};

/**
 * Verifica che un valore sia un oggetto ColumnConfiguration valido.
 */
function isValidColumnConfiguration(value: unknown): value is ColumnConfiguration {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['name'] === 'string' &&
    typeof candidate['color'] === 'string'
  );
}

/**
 * Converte un offset di carattere in numero di riga e colonna.
 */
function convertOffsetToLineAndColumn(
  fileContent: string,
  characterOffset: number,
): { lineNumber: number; columnNumber: number } {
  const textBeforeError = fileContent.slice(0, characterOffset);
  const lines = textBeforeError.split('\n');
  const lineNumber = lines.length;
  const columnNumber = (lines[lines.length - 1]?.length ?? 0) + 1;
  return { lineNumber, columnNumber };
}

/**
 * Servizio per la gestione della configurazione del progetto tramite file config.json.
 * Il file viene creato automaticamente in `.kanban-reloaded/config.json` con i valori predefiniti
 * se non esiste ancora.
 */
export class ConfigService {
  private readonly projectDirectoryPath: string;

  constructor(projectDirectoryPath: string) {
    this.projectDirectoryPath = projectDirectoryPath;
  }

  /**
   * Restituisce il percorso assoluto del file config.json.
   */
  getConfigFilePath(): string {
    return path.join(
      this.projectDirectoryPath,
      KANBAN_DIRECTORY_NAME,
      CONFIG_FILENAME,
    );
  }

  /**
   * Carica la configurazione dal file config.json.
   * Se il file non esiste, lo crea con i valori predefiniti.
   * Se il file esiste, lo legge, lo analizza e lo valida.
   *
   * @returns La configurazione del progetto validata
   * @throws Error se il JSON e' malformato o i campi non sono validi
   */
  loadConfiguration(): ProjectConfiguration {
    const configFilePath = this.getConfigFilePath();
    const kanbanDirectoryPath = path.dirname(configFilePath);

    if (!fs.existsSync(configFilePath)) {
      // Crea la directory .kanban-reloaded/ se non esiste
      fs.mkdirSync(kanbanDirectoryPath, { recursive: true });

      // Scrivi il file config.json con i valori predefiniti
      const defaultConfigurationJson = JSON.stringify(DEFAULT_CONFIGURATION, null, 2) + '\n';
      fs.writeFileSync(configFilePath, defaultConfigurationJson, 'utf-8');

      return { ...DEFAULT_CONFIGURATION, columns: [...DEFAULT_COLUMNS] };
    }

    // Leggi e analizza il file JSON esistente
    const fileContent = fs.readFileSync(configFilePath, 'utf-8');

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(fileContent);
    } catch (parseError: unknown) {
      const errorDetails = this.buildJsonParseErrorDetails(
        fileContent,
        parseError,
        configFilePath,
      );
      throw new Error(errorDetails.message);
    }

    // Valida la struttura del contenuto analizzato
    return this.validateConfiguration(parsedContent, configFilePath);
  }

  /**
   * Costruisce un messaggio di errore dettagliato per errori di parsing JSON,
   * includendo riga e colonna se disponibili.
   */
  private buildJsonParseErrorDetails(
    fileContent: string,
    parseError: unknown,
    configFilePath: string,
  ): ConfigurationFileError {
    let message = `Errore di parsing in ${configFilePath}: il file non contiene JSON valido`;
    let lineNumber: number | undefined;
    let columnNumber: number | undefined;

    if (parseError instanceof SyntaxError) {
      const positionMatch = parseError.message.match(/position\s+(\d+)/i);
      if (positionMatch) {
        const characterOffset = parseInt(positionMatch[1], 10);
        const position = convertOffsetToLineAndColumn(fileContent, characterOffset);
        lineNumber = position.lineNumber;
        columnNumber = position.columnNumber;
        message += ` (riga ${lineNumber}, colonna ${columnNumber})`;
      }
      message += `. Dettaglio: ${parseError.message}`;
    }

    return { filePath: configFilePath, message, lineNumber, columnNumber };
  }

  /**
   * Valida che il contenuto analizzato dal JSON abbia la struttura corretta
   * per ProjectConfiguration.
   */
  private validateConfiguration(
    parsedContent: unknown,
    configFilePath: string,
  ): ProjectConfiguration {
    if (typeof parsedContent !== 'object' || parsedContent === null || Array.isArray(parsedContent)) {
      throw new Error(
        `Errore di validazione in ${configFilePath}: il contenuto deve essere un oggetto JSON`,
      );
    }

    const configObject = parsedContent as Record<string, unknown>;

    // Valida serverPort
    if ('serverPort' in configObject && typeof configObject['serverPort'] !== 'number') {
      throw new Error(
        `Errore di validazione in ${configFilePath}: il campo 'serverPort' deve essere un numero, ricevuto ${typeof configObject['serverPort']}`,
      );
    }

    // Valida agentCommand
    if (
      'agentCommand' in configObject &&
      configObject['agentCommand'] !== null &&
      typeof configObject['agentCommand'] !== 'string'
    ) {
      throw new Error(
        `Errore di validazione in ${configFilePath}: il campo 'agentCommand' deve essere una stringa o null, ricevuto ${typeof configObject['agentCommand']}`,
      );
    }

    // Valida columns
    if ('columns' in configObject) {
      if (!Array.isArray(configObject['columns'])) {
        throw new Error(
          `Errore di validazione in ${configFilePath}: il campo 'columns' deve essere un array, ricevuto ${typeof configObject['columns']}`,
        );
      }

      for (let columnIndex = 0; columnIndex < configObject['columns'].length; columnIndex++) {
        const columnEntry = configObject['columns'][columnIndex] as unknown;
        if (!isValidColumnConfiguration(columnEntry)) {
          throw new Error(
            `Errore di validazione in ${configFilePath}: l'elemento ${columnIndex} di 'columns' deve avere le proprieta 'id', 'name' e 'color' di tipo stringa`,
          );
        }
      }
    }

    // Costruisci la configurazione validata con fallback ai valori predefiniti
    const validatedConfiguration: ProjectConfiguration = {
      agentCommand: 'agentCommand' in configObject
        ? (configObject['agentCommand'] as string | null)
        : DEFAULT_CONFIGURATION.agentCommand,
      serverPort: 'serverPort' in configObject
        ? (configObject['serverPort'] as number)
        : DEFAULT_CONFIGURATION.serverPort,
      columns: 'columns' in configObject
        ? (configObject['columns'] as ColumnConfiguration[])
        : [...DEFAULT_CONFIGURATION.columns],
    };

    return validatedConfiguration;
  }
}
