import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseInstance } from '../storage/database.js';
import { ConfigRepository } from './configRepository.js';
import { KANBAN_DIRECTORY_NAME, CONFIG_FILENAME } from '../storage/constants.js';
import type {
  ProjectConfiguration,
  ColumnConfiguration,
} from '../models/types.js';

/**
 * Chiavi usate nella tabella config per salvare i singoli campi della configurazione.
 */
const CONFIG_KEYS = {
  AGENT_COMMAND: 'agentCommand',
  SERVER_PORT: 'serverPort',
  COLUMNS: 'columns',
  WORKING_DIRECTORY: 'workingDirectory',
  AGENT_ENVIRONMENT_VARIABLES: 'agentEnvironmentVariables',
  CONFIG_IMPORTED_FROM_FILE: '_configImportedFromFile',
} as const;

const DEFAULT_COLUMNS: ColumnConfiguration[] = [
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
 * Mappa eventi emessi dal ConfigService.
 * Usa il supporto nativo per typed EventEmitter di Node.js 22.
 */
interface ConfigServiceEventMap {
  configurationChanged: [updatedConfiguration: ProjectConfiguration];
}

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
 * Servizio per la gestione della configurazione del progetto tramite database SQLite.
 *
 * I settings sono salvati nella tabella `config` come coppie chiave-valore JSON.
 * Al primo avvio, se esiste un file `config.json` legacy, i suoi valori vengono
 * importati nel database (seed) e il file viene rinominato in `config.json.imported`.
 *
 * Pattern di lettura: read-through (ogni chiamata a `loadConfiguration()` legge dal DB).
 * Reattivita: emette l'evento `configurationChanged` dopo ogni salvataggio.
 */
export class ConfigService extends EventEmitter<ConfigServiceEventMap> {
  private readonly configRepository: ConfigRepository;
  private readonly projectDirectoryPath: string;

  constructor(database: DatabaseInstance, projectDirectoryPath: string) {
    super();
    this.configRepository = new ConfigRepository(database);
    this.projectDirectoryPath = projectDirectoryPath;
  }

  /**
   * Carica la configurazione corrente dal database.
   * Se il database non contiene ancora settings, scrive i valori predefiniti.
   * Ogni campo mancante viene riempito con il valore di default (forward compatibility).
   *
   * @returns La configurazione completa e validata
   */
  loadConfiguration(): ProjectConfiguration {
    const allEntries = this.configRepository.getAllEntries();

    // Se il DB e vuoto (nessuna chiave di configurazione), scrivi i default
    if (!this.hasDatabaseConfiguration(allEntries)) {
      this.writeConfigurationToDatabase(DEFAULT_CONFIGURATION);
      return { ...DEFAULT_CONFIGURATION, columns: [...DEFAULT_COLUMNS] };
    }

    return this.parseConfigurationFromEntries(allEntries);
  }

  /**
   * Salva una configurazione parziale nel database.
   * Carica la configurazione corrente, applica i campi aggiornati,
   * scrive nel DB e emette l'evento `configurationChanged`.
   *
   * @param updatedFields - I campi della configurazione da aggiornare
   * @returns La configurazione completa dopo il merge
   */
  saveConfiguration(updatedFields: Partial<ProjectConfiguration>): ProjectConfiguration {
    const currentConfiguration = this.loadConfiguration();

    const mergedConfiguration: ProjectConfiguration = {
      ...currentConfiguration,
      ...updatedFields,
    };

    this.writeConfigurationToDatabase(mergedConfiguration);
    this.emit('configurationChanged', mergedConfiguration);

    return mergedConfiguration;
  }

  /**
   * Importa i settings dal file `config.json` legacy nel database.
   * Operazione idempotente: se il seed e gia avvenuto, non fa nulla.
   *
   * Se il file esiste e il seed non e ancora avvenuto:
   * 1. Legge e valida il contenuto del file
   * 2. Scrive ogni campo nel database
   * 3. Imposta il flag `_configImportedFromFile`
   * 4. Rinomina il file in `config.json.imported`
   *
   * Se il file non esiste, scrive i default nel DB (se non ci sono gia).
   */
  seedFromConfigFile(): void {
    // Controlla se il seed e gia avvenuto
    if (this.configRepository.hasKey(CONFIG_KEYS.CONFIG_IMPORTED_FROM_FILE)) {
      return;
    }

    const configFilePath = this.getLegacyConfigFilePath();

    if (fs.existsSync(configFilePath)) {
      const configuration = this.readAndValidateLegacyConfigFile(configFilePath);
      this.writeConfigurationToDatabase(configuration);
      this.configRepository.setValueByKey(
        CONFIG_KEYS.CONFIG_IMPORTED_FROM_FILE,
        JSON.stringify(true),
      );

      // Rinomina il file legacy per sicurezza (non lo eliminiamo)
      const importedFilePath = configFilePath + '.imported';
      try {
        fs.renameSync(configFilePath, importedFilePath);
      } catch {
        // Se il rename fallisce (permessi, lock), non e critico: il flag nel DB
        // impedira comunque un secondo import
      }
    } else {
      // Nessun file legacy: scrivi i default nel DB se non ci sono gia
      const allEntries = this.configRepository.getAllEntries();
      if (!this.hasDatabaseConfiguration(allEntries)) {
        this.writeConfigurationToDatabase(DEFAULT_CONFIGURATION);
      }
      this.configRepository.setValueByKey(
        CONFIG_KEYS.CONFIG_IMPORTED_FROM_FILE,
        JSON.stringify(true),
      );
    }
  }

  /**
   * Restituisce il percorso del file config.json legacy.
   * Usato solo per il seed iniziale.
   */
  private getLegacyConfigFilePath(): string {
    return path.join(
      this.projectDirectoryPath,
      KANBAN_DIRECTORY_NAME,
      CONFIG_FILENAME,
    );
  }

  /**
   * Verifica se nel database ci sono gia chiavi di configurazione (escluso il flag di import).
   */
  private hasDatabaseConfiguration(entries: Map<string, string>): boolean {
    for (const key of entries.keys()) {
      if (key !== CONFIG_KEYS.CONFIG_IMPORTED_FROM_FILE) {
        return true;
      }
    }
    return false;
  }

  /**
   * Scrive tutti i campi della configurazione nel database come coppie chiave-valore JSON.
   */
  private writeConfigurationToDatabase(configuration: ProjectConfiguration): void {
    this.configRepository.setValueByKey(
      CONFIG_KEYS.AGENT_COMMAND,
      JSON.stringify(configuration.agentCommand),
    );
    this.configRepository.setValueByKey(
      CONFIG_KEYS.SERVER_PORT,
      JSON.stringify(configuration.serverPort),
    );
    this.configRepository.setValueByKey(
      CONFIG_KEYS.COLUMNS,
      JSON.stringify(configuration.columns),
    );
    this.configRepository.setValueByKey(
      CONFIG_KEYS.WORKING_DIRECTORY,
      JSON.stringify(configuration.workingDirectory),
    );
    this.configRepository.setValueByKey(
      CONFIG_KEYS.AGENT_ENVIRONMENT_VARIABLES,
      JSON.stringify(configuration.agentEnvironmentVariables),
    );
  }

  /**
   * Costruisce un oggetto ProjectConfiguration dai valori letti dal database.
   * Ogni campo mancante viene riempito con il valore predefinito.
   */
  private parseConfigurationFromEntries(entries: Map<string, string>): ProjectConfiguration {
    return {
      agentCommand: this.parseJsonValueOrDefault(
        entries.get(CONFIG_KEYS.AGENT_COMMAND),
        DEFAULT_CONFIGURATION.agentCommand,
        this.isValidAgentCommand,
      ),
      serverPort: this.parseJsonValueOrDefault(
        entries.get(CONFIG_KEYS.SERVER_PORT),
        DEFAULT_CONFIGURATION.serverPort,
        this.isValidServerPort,
      ),
      columns: this.parseJsonValueOrDefault(
        entries.get(CONFIG_KEYS.COLUMNS),
        [...DEFAULT_CONFIGURATION.columns],
        this.isValidColumnsArray,
      ),
      workingDirectory: this.parseJsonValueOrDefault(
        entries.get(CONFIG_KEYS.WORKING_DIRECTORY),
        DEFAULT_CONFIGURATION.workingDirectory,
        this.isValidWorkingDirectory,
      ),
      agentEnvironmentVariables: this.parseJsonValueOrDefault(
        entries.get(CONFIG_KEYS.AGENT_ENVIRONMENT_VARIABLES),
        { ...DEFAULT_CONFIGURATION.agentEnvironmentVariables },
        this.isValidEnvironmentVariablesMap,
      ),
    };
  }

  /**
   * Parsa un valore JSON dalla stringa del database.
   * Se il valore e null/undefined, non parsabile, o non supera la validazione,
   * restituisce il valore di default.
   */
  private parseJsonValueOrDefault<T>(
    jsonString: string | undefined,
    defaultValue: T,
    validator: (value: unknown) => value is T,
  ): T {
    if (jsonString === undefined) {
      return defaultValue;
    }
    try {
      const parsed: unknown = JSON.parse(jsonString);
      return validator(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  // --- Validatori per i singoli campi della configurazione ---

  private isValidAgentCommand(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
  }

  private isValidServerPort(value: unknown): value is number {
    return typeof value === 'number' && value > 0 && value <= 65535;
  }

  private isValidColumnsArray(value: unknown): value is ColumnConfiguration[] {
    if (!Array.isArray(value)) return false;
    return value.every(isValidColumnConfiguration);
  }

  private isValidWorkingDirectory(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
  }

  private isValidEnvironmentVariablesMap(value: unknown): value is Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const map = value as Record<string, unknown>;
    return Object.values(map).every((v) => typeof v === 'string');
  }

  // --- Lettura e validazione del file config.json legacy (solo per il seed) ---

  /**
   * Legge il file config.json legacy, lo parsa e restituisce una ProjectConfiguration validata.
   * I campi mancanti vengono riempiti con i default.
   * Se il JSON e malformato o i campi non sono validi, restituisce i default completi.
   */
  private readAndValidateLegacyConfigFile(configFilePath: string): ProjectConfiguration {
    try {
      const fileContent = fs.readFileSync(configFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(fileContent);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ...DEFAULT_CONFIGURATION };
      }

      const configObject = parsed as Record<string, unknown>;

      return {
        agentCommand: this.isValidAgentCommand(configObject['agentCommand'])
          ? configObject['agentCommand']
          : DEFAULT_CONFIGURATION.agentCommand,
        serverPort: this.isValidServerPort(configObject['serverPort'])
          ? configObject['serverPort']
          : DEFAULT_CONFIGURATION.serverPort,
        columns: this.isValidColumnsArray(configObject['columns'])
          ? configObject['columns']
          : [...DEFAULT_CONFIGURATION.columns],
        workingDirectory: this.isValidWorkingDirectory(configObject['workingDirectory'])
          ? configObject['workingDirectory']
          : DEFAULT_CONFIGURATION.workingDirectory,
        agentEnvironmentVariables: this.isValidEnvironmentVariablesMap(configObject['agentEnvironmentVariables'])
          ? configObject['agentEnvironmentVariables']
          : { ...DEFAULT_CONFIGURATION.agentEnvironmentVariables },
      };
    } catch {
      // Se il file non e leggibile o il JSON e invalido, usa i default
      return { ...DEFAULT_CONFIGURATION };
    }
  }
}
