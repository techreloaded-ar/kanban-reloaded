import { eq } from 'drizzle-orm';
import { configTable } from '../models/schema.js';
import type { ProjectConfiguration, ColumnConfiguration } from '../models/types.js';
import type { DatabaseInstance } from '../storage/database.js';

const DEFAULT_COLUMNS: ColumnConfiguration[] = [
  { id: 'backlog', name: 'Backlog', color: '#3498DB' },
  { id: 'in-progress', name: 'In Progress', color: '#E67E22' },
  { id: 'done', name: 'Done', color: '#2ECC71' },
];

const DEFAULT_CONFIGURATION: ProjectConfiguration = {
  agentPreset: 'claude-code',
  commandTemplate: 'claude-code --task "{{task_description}}"',
  serverPort: 3000,
  autoStart: true,
  columns: DEFAULT_COLUMNS,
};

/**
 * Servizio per la gestione della configurazione del progetto.
 * I valori vengono salvati nella tabella `config` come coppie chiave-valore JSON.
 */
export class ConfigService {
  constructor(private readonly database: DatabaseInstance) {}

  /**
   * Inserisce i valori di configurazione predefiniti se non esistono già nel database.
   * Non sovrascrive valori esistenti.
   */
  seedDefaultConfiguration(): void {
    for (const [configKey, configValue] of Object.entries(DEFAULT_CONFIGURATION)) {
      const existingEntry = this.database
        .select()
        .from(configTable)
        .where(eq(configTable.key, configKey))
        .get();

      if (existingEntry === undefined) {
        this.database.insert(configTable).values({
          key: configKey,
          value: JSON.stringify(configValue),
        }).run();
      }
    }
  }
}
