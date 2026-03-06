import fs from 'node:fs';
import path from 'node:path';
import { KANBAN_DIRECTORY_NAME, CONFIG_FILENAME } from '../storage/constants.js';
import type { ProjectConfiguration, ColumnConfiguration, AgentConfiguration, ConfigurationFileError } from '../models/types.js';

const DEFAULT_COLUMNS: ColumnConfiguration[] = [
  { id: 'backlog', name: 'Backlog', color: '#3498DB' },
  { id: 'in-progress', name: 'In Progress', color: '#E67E22' },
  { id: 'done', name: 'Done', color: '#2ECC71' },
];

const DEFAULT_CONFIGURATION: ProjectConfiguration = {
  agentCommand: null,
  agents: {},
  serverPort: 3000,
  columns: DEFAULT_COLUMNS,
  workingDirectory: null,
  agentEnvironmentVariables: {},
};

/**
 * Contenuto aggiuntivo scritto nel file config.json per mostrare all'utente
 * esempi di template per il campo agentCommand.
 * Questo campo e' solo informativo e non fa parte del tipo ProjectConfiguration.
 */
const AGENT_COMMAND_EXAMPLES = {
  _description: 'Esempi di template per agentCommand. Copia uno di questi nel campo agentCommand per usarlo.',
  claudeCode: "claude --prompt '{{title}}: {{description}}'",
  genericShell: "echo 'Task: {{title}} - {{description}} - Criteri: {{acceptanceCriteria}}'",
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

      // Scrivi il file config.json con i valori predefiniti e gli esempi informativi
      const defaultConfigurationWithExamples = {
        ...DEFAULT_CONFIGURATION,
        agentCommandExamples: AGENT_COMMAND_EXAMPLES,
      };
      const defaultConfigurationJson = JSON.stringify(defaultConfigurationWithExamples, null, 2) + '\n';
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

    // Valida agents (accetta sia stringhe che oggetti con campo command)
    if ('agents' in configObject) {
      if (typeof configObject['agents'] !== 'object' || configObject['agents'] === null || Array.isArray(configObject['agents'])) {
        throw new Error(
          `Errore di validazione in ${configFilePath}: il campo 'agents' deve essere un oggetto (mappa nome agent -> template comando o configurazione dettagliata)`,
        );
      }
      const agentsMap = configObject['agents'] as Record<string, unknown>;
      for (const [agentName, agentValue] of Object.entries(agentsMap)) {
        if (typeof agentValue === 'string') {
          continue; // stringa semplice (template comando) — valida
        }
        if (typeof agentValue === 'object' && agentValue !== null && !Array.isArray(agentValue)) {
          const detailedConfig = agentValue as Record<string, unknown>;
          if (typeof detailedConfig['command'] !== 'string') {
            throw new Error(
              `Errore di validazione in ${configFilePath}: l'agent '${agentName}' come oggetto deve avere un campo 'command' di tipo stringa`,
            );
          }
          if ('workingDirectory' in detailedConfig && typeof detailedConfig['workingDirectory'] !== 'string') {
            throw new Error(
              `Errore di validazione in ${configFilePath}: il campo 'workingDirectory' dell'agent '${agentName}' deve essere una stringa`,
            );
          }
          continue;
        }
        throw new Error(
          `Errore di validazione in ${configFilePath}: il valore dell'agent '${agentName}' deve essere una stringa (template comando) o un oggetto con campo 'command', ricevuto ${typeof agentValue}`,
        );
      }
    }

    // Valida workingDirectory
    if ('workingDirectory' in configObject && configObject['workingDirectory'] !== null && typeof configObject['workingDirectory'] !== 'string') {
      throw new Error(
        `Errore di validazione in ${configFilePath}: il campo 'workingDirectory' deve essere una stringa o null, ricevuto ${typeof configObject['workingDirectory']}`,
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

    // Valida agentEnvironmentVariables
    if ('agentEnvironmentVariables' in configObject) {
      if (typeof configObject['agentEnvironmentVariables'] !== 'object' || configObject['agentEnvironmentVariables'] === null || Array.isArray(configObject['agentEnvironmentVariables'])) {
        throw new Error(
          `Errore di validazione in ${configFilePath}: il campo 'agentEnvironmentVariables' deve essere un oggetto (mappa chiave -> valore stringa)`,
        );
      }
      const envVarsMap = configObject['agentEnvironmentVariables'] as Record<string, unknown>;
      for (const [envKey, envValue] of Object.entries(envVarsMap)) {
        if (typeof envValue !== 'string') {
          throw new Error(
            `Errore di validazione in ${configFilePath}: il valore della variabile d'ambiente '${envKey}' deve essere una stringa, ricevuto ${typeof envValue}`,
          );
        }
      }
    }

    // Costruisci la configurazione validata con fallback ai valori predefiniti
    const validatedConfiguration: ProjectConfiguration = {
      agentCommand: 'agentCommand' in configObject
        ? (configObject['agentCommand'] as string | null)
        : DEFAULT_CONFIGURATION.agentCommand,
      agents: 'agents' in configObject
        ? (configObject['agents'] as AgentConfiguration)
        : { ...DEFAULT_CONFIGURATION.agents },
      serverPort: 'serverPort' in configObject
        ? (configObject['serverPort'] as number)
        : DEFAULT_CONFIGURATION.serverPort,
      columns: 'columns' in configObject
        ? (configObject['columns'] as ColumnConfiguration[])
        : [...DEFAULT_CONFIGURATION.columns],
      workingDirectory: 'workingDirectory' in configObject
        ? (configObject['workingDirectory'] as string | null)
        : DEFAULT_CONFIGURATION.workingDirectory,
      agentEnvironmentVariables: 'agentEnvironmentVariables' in configObject
        ? (configObject['agentEnvironmentVariables'] as Record<string, string>)
        : { ...DEFAULT_CONFIGURATION.agentEnvironmentVariables },
    };

    return validatedConfiguration;
  }

  /**
   * Salva una configurazione parziale nel file config.json.
   * Carica la configurazione corrente, applica i campi aggiornati,
   * e scrive il risultato su disco preservando il campo informativo agentCommandExamples.
   *
   * @param updatedFields - I campi della configurazione da aggiornare
   * @returns La configurazione completa dopo il merge
   */
  saveConfiguration(updatedFields: Partial<ProjectConfiguration>): ProjectConfiguration {
    // 1. Carica la configurazione corrente (crea il file se non esiste)
    const currentConfiguration = this.loadConfiguration();

    // 2. Merge dei campi aggiornati nella configurazione corrente
    const mergedConfiguration: ProjectConfiguration = {
      ...currentConfiguration,
      ...updatedFields,
    };

    // 3. Scrivi la configurazione aggiornata su disco, preservando gli esempi informativi
    const configFilePath = this.getConfigFilePath();
    const configurationWithExamples = {
      ...mergedConfiguration,
      agentCommandExamples: AGENT_COMMAND_EXAMPLES,
    };
    const configurationJson = JSON.stringify(configurationWithExamples, null, 2) + '\n';
    fs.writeFileSync(configFilePath, configurationJson, 'utf-8');

    // 4. Restituisci la configurazione completa (senza il campo informativo)
    return mergedConfiguration;
  }
}
