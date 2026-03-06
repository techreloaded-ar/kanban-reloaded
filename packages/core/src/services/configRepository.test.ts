import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as schema from '../models/schema.js';
import type { DatabaseInstance } from '../storage/database.js';
import { ConfigRepository } from './configRepository.js';

const CREATE_CONFIG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

let testDatabase: DatabaseInstance;
let closeDatabase: () => void;
let configRepository: ConfigRepository;

/**
 * Crea un database in-memory con la tabella config gia creata.
 */
function createInMemoryDatabase(): { database: DatabaseInstance; close: () => void } {
  const sqliteConnection = new Database(':memory:');
  sqliteConnection.exec(CREATE_CONFIG_TABLE_SQL);
  const database = drizzle(sqliteConnection, { schema });
  return { database, close: () => sqliteConnection.close() };
}

beforeEach(() => {
  const db = createInMemoryDatabase();
  testDatabase = db.database;
  closeDatabase = db.close;
  configRepository = new ConfigRepository(testDatabase);
});

afterEach(() => {
  closeDatabase();
});

describe('ConfigRepository', () => {
  describe('getValueByKey', () => {
    it('restituisce il valore per una chiave esistente', () => {
      configRepository.setValueByKey('serverPort', JSON.stringify(3000));

      const value = configRepository.getValueByKey('serverPort');

      expect(value).toBe(JSON.stringify(3000));
    });

    it('restituisce null per una chiave inesistente', () => {
      const value = configRepository.getValueByKey('chiave-che-non-esiste');

      expect(value).toBeNull();
    });
  });

  describe('setValueByKey', () => {
    it('inserisce una nuova coppia chiave-valore', () => {
      configRepository.setValueByKey('newKey', 'newValue');

      const value = configRepository.getValueByKey('newKey');
      expect(value).toBe('newValue');
    });

    it('sovrascrive il valore di una chiave esistente (upsert)', () => {
      configRepository.setValueByKey('testKey', 'valorePrimo');
      configRepository.setValueByKey('testKey', 'valoreSecondo');

      const value = configRepository.getValueByKey('testKey');
      expect(value).toBe('valoreSecondo');
    });

    it('gestisce valori JSON complessi', () => {
      const complexValue = JSON.stringify({
        nested: { key: 'value' },
        array: [1, 2, 3],
      });
      configRepository.setValueByKey('complexKey', complexValue);

      const retrieved = configRepository.getValueByKey('complexKey');
      expect(retrieved).toBe(complexValue);
      expect(JSON.parse(retrieved!)).toEqual({
        nested: { key: 'value' },
        array: [1, 2, 3],
      });
    });
  });

  describe('getAllEntries', () => {
    it('restituisce una Map vuota quando la tabella e vuota', () => {
      const entries = configRepository.getAllEntries();

      expect(entries).toBeInstanceOf(Map);
      expect(entries.size).toBe(0);
    });

    it('restituisce tutte le coppie chiave-valore presenti', () => {
      configRepository.setValueByKey('key1', 'value1');
      configRepository.setValueByKey('key2', 'value2');
      configRepository.setValueByKey('key3', 'value3');

      const entries = configRepository.getAllEntries();

      expect(entries.size).toBe(3);
      expect(entries.get('key1')).toBe('value1');
      expect(entries.get('key2')).toBe('value2');
      expect(entries.get('key3')).toBe('value3');
    });

    it('riflette le modifiche dopo un upsert', () => {
      configRepository.setValueByKey('key1', 'originale');
      configRepository.setValueByKey('key1', 'aggiornato');

      const entries = configRepository.getAllEntries();

      expect(entries.size).toBe(1);
      expect(entries.get('key1')).toBe('aggiornato');
    });
  });

  describe('deleteByKey', () => {
    it('rimuove una chiave esistente dal database', () => {
      configRepository.setValueByKey('keyToDelete', 'valore');

      configRepository.deleteByKey('keyToDelete');

      expect(configRepository.getValueByKey('keyToDelete')).toBeNull();
    });

    it('non genera errori se la chiave non esiste (silent no-op)', () => {
      expect(() => configRepository.deleteByKey('chiave-fantasma')).not.toThrow();
    });

    it('rimuove solo la chiave specificata senza influenzare le altre', () => {
      configRepository.setValueByKey('keyA', 'valueA');
      configRepository.setValueByKey('keyB', 'valueB');
      configRepository.setValueByKey('keyC', 'valueC');

      configRepository.deleteByKey('keyB');

      expect(configRepository.getValueByKey('keyA')).toBe('valueA');
      expect(configRepository.getValueByKey('keyB')).toBeNull();
      expect(configRepository.getValueByKey('keyC')).toBe('valueC');
    });
  });

  describe('hasKey', () => {
    it('restituisce true per una chiave esistente', () => {
      configRepository.setValueByKey('existingKey', 'valore');

      expect(configRepository.hasKey('existingKey')).toBe(true);
    });

    it('restituisce false per una chiave inesistente', () => {
      expect(configRepository.hasKey('missingKey')).toBe(false);
    });

    it('restituisce false dopo che una chiave e stata eliminata', () => {
      configRepository.setValueByKey('tempKey', 'temporaneo');
      configRepository.deleteByKey('tempKey');

      expect(configRepository.hasKey('tempKey')).toBe(false);
    });
  });
});
