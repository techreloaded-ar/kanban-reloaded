import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../storage/database.js';
import { configTable } from '../models/schema.js';

/**
 * Data-access layer per la tabella `config` (key-value store).
 * Ogni valore e salvato come stringa JSON nella colonna `value`.
 *
 * Questa classe non contiene logica di business ne validazione:
 * si limita a leggere e scrivere coppie chiave-valore nel database.
 */
export class ConfigRepository {
  constructor(private readonly database: DatabaseInstance) {}

  /**
   * Legge il valore associato a una chiave dalla tabella config.
   * Restituisce null se la chiave non esiste.
   */
  getValueByKey(key: string): string | null {
    const row = this.database
      .select({ value: configTable.value })
      .from(configTable)
      .where(eq(configTable.key, key))
      .get();

    return row?.value ?? null;
  }

  /**
   * Scrive (o sovrascrive) il valore associato a una chiave.
   * Usa INSERT OR REPLACE per l'upsert atomico.
   */
  setValueByKey(key: string, value: string): void {
    this.database
      .insert(configTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: configTable.key,
        set: { value },
      })
      .run();
  }

  /**
   * Legge tutte le coppie chiave-valore dalla tabella config.
   * Restituisce una Map<chiave, valore>.
   */
  getAllEntries(): Map<string, string> {
    const rows = this.database
      .select()
      .from(configTable)
      .all();

    const entries = new Map<string, string>();
    for (const row of rows) {
      entries.set(row.key, row.value);
    }
    return entries;
  }

  /**
   * Rimuove una chiave dalla tabella config.
   */
  deleteByKey(key: string): void {
    this.database
      .delete(configTable)
      .where(eq(configTable.key, key))
      .run();
  }

  /**
   * Verifica se una chiave esiste nella tabella config.
   */
  hasKey(key: string): boolean {
    return this.getValueByKey(key) !== null;
  }
}
