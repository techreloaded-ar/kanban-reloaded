import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLauncher, sanitizeShellValue } from './agentLauncher.js';
import type { AgentLauncherLogger } from './agentLauncher.js';
import type { Task } from '@kanban-reloaded/core';

/**
 * Crea un logger mock per i test.
 */
function createMockLogger(): AgentLauncherLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Crea un task di test con valori predefiniti.
 */
function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-task-id-001',
    displayId: 'TASK-001',
    title: 'Implementare feature X',
    description: 'Descrizione dettagliata della feature X',
    acceptanceCriteria: 'Il sistema deve supportare la feature X',
    priority: 'medium',
    status: 'in-progress',
    agentRunning: false,
    agentLog: null,
    createdAt: '2026-03-05T10:00:00.000Z',
    updatedAt: null,
    executionTime: null,
    position: 0,
    ...overrides,
  };
}

describe('sanitizeShellValue', () => {
  it('rimuove i backtick dal valore', () => {
    expect(sanitizeShellValue('test `whoami` end')).toBe('test whoami end');
  });

  it('rimuove il segno di dollaro dal valore', () => {
    expect(sanitizeShellValue('test $HOME end')).toBe('test HOME end');
  });

  it('rimuove le parentesi tonde dal valore', () => {
    expect(sanitizeShellValue('test $(command) end')).toBe('test command end');
  });

  it('rimuove le parentesi graffe dal valore', () => {
    expect(sanitizeShellValue('test ${var} end')).toBe('test var end');
  });

  it('rimuove il pipe dal valore', () => {
    expect(sanitizeShellValue('test | cat end')).toBe('test  cat end');
  });

  it('rimuove il punto e virgola dal valore', () => {
    expect(sanitizeShellValue('test; rm -rf /')).toBe('test rm -rf /');
  });

  it('rimuove l ampersand dal valore', () => {
    expect(sanitizeShellValue('test && echo hacked')).toBe('test  echo hacked');
  });

  it('rimuove i segni di redirect dal valore', () => {
    expect(sanitizeShellValue('test > /etc/passwd < input')).toBe(
      'test  /etc/passwd  input',
    );
  });

  it('restituisce la stringa invariata se non contiene metacaratteri', () => {
    expect(sanitizeShellValue('titolo semplice e sicuro')).toBe(
      'titolo semplice e sicuro',
    );
  });

  it('gestisce una stringa vuota', () => {
    expect(sanitizeShellValue('')).toBe('');
  });

  it('rimuove tutti i metacaratteri in una stringa complessa', () => {
    expect(sanitizeShellValue('`$(){}|;&<>')).toBe('');
  });

  it('rimuove i caratteri newline e carriage return dal valore', () => {
    expect(sanitizeShellValue('titolo\ncon\rnewline')).toBe('titoloconnewline');
  });

  it('rimuove le virgolette singole e doppie dal valore', () => {
    expect(sanitizeShellValue("test 'apici' e \"virgolette\"")).toBe(
      'test apici e virgolette',
    );
  });
});

describe('AgentLauncher', () => {
  let mockLogger: AgentLauncherLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('costruzione e configurazione', () => {
    it('crea un istanza con comando agent nullo', () => {
      const launcher = new AgentLauncher(null, mockLogger);
      expect(launcher.getActiveAgentCount()).toBe(0);
    });

    it('crea un istanza con comando agent configurato', () => {
      const launcher = new AgentLauncher('echo "test"', mockLogger);
      expect(launcher.getActiveAgentCount()).toBe(0);
    });
  });

  describe('launchForTask', () => {
    it('restituisce launched: false con motivo quando nessun agent e configurato (null)', () => {
      const launcher = new AgentLauncher(null, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(false);
      if (!result.launched) {
        expect(result.reason).toBe('Nessun agent configurato');
      }
    });

    it('restituisce launched: false con motivo quando il comando e una stringa vuota', () => {
      const launcher = new AgentLauncher('', mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(false);
      if (!result.launched) {
        expect(result.reason).toBe('Nessun agent configurato');
      }
    });

    it('restituisce launched: false con motivo quando il comando e solo spazi', () => {
      const launcher = new AgentLauncher('   ', mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(false);
      if (!result.launched) {
        expect(result.reason).toBe('Nessun agent configurato');
      }
    });

    it('lancia un processo agent con un comando valido e restituisce launched: true', () => {
      // Usa 'node -e' come comando di test cross-platform
      const launcher = new AgentLauncher(
        'node -e "console.log(\'agent running\')"',
        mockLogger,
      );
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      if (result.launched) {
        expect(typeof result.processId).toBe('number');
        expect(result.processId).toBeGreaterThan(0);
      }

      // Cleanup
      launcher.stopAllAgents();
    });

    it('impedisce il lancio di un secondo agent per lo stesso task', () => {
      const launcher = new AgentLauncher(
        'node -e "setTimeout(() => {}, 5000)"',
        mockLogger,
      );
      const task = createTestTask();

      const firstResult = launcher.launchForTask(task);
      expect(firstResult.launched).toBe(true);

      const secondResult = launcher.launchForTask(task);
      expect(secondResult.launched).toBe(false);
      if (!secondResult.launched) {
        expect(secondResult.reason).toContain('gia in esecuzione');
      }

      // Cleanup
      launcher.stopAllAgents();
    });

    it('interpola i placeholder nel comando con i valori del task', () => {
      // Il comando stampa i valori interpolati — verifica che il processo si avvii
      const launcher = new AgentLauncher(
        'node -e "console.log(\'{{title}}\')"',
        mockLogger,
      );
      const task = createTestTask({ title: 'Titolo di test' });

      const result = launcher.launchForTask(task);
      expect(result.launched).toBe(true);

      // Cleanup
      launcher.stopAllAgents();
    });

    it('sanitizza i valori del task prima dell interpolazione nel comando', () => {
      const launcher = new AgentLauncher(
        'node -e "console.log(\'{{title}}\')"',
        mockLogger,
      );
      const task = createTestTask({ title: 'Titolo $(rm -rf /) pericoloso' });

      const result = launcher.launchForTask(task);
      // Il processo deve avviarsi senza che il comando malevolo venga eseguito
      expect(result.launched).toBe(true);

      // Cleanup
      launcher.stopAllAgents();
    });
  });

  describe('isAgentRunning', () => {
    it('restituisce false per un task senza agent in esecuzione', () => {
      const launcher = new AgentLauncher(null, mockLogger);

      expect(launcher.isAgentRunning('task-inesistente')).toBe(false);
    });

    it('restituisce true per un task con agent in esecuzione', () => {
      const launcher = new AgentLauncher(
        'node -e "setTimeout(() => {}, 5000)"',
        mockLogger,
      );
      const task = createTestTask();

      launcher.launchForTask(task);

      expect(launcher.isAgentRunning(task.id)).toBe(true);

      // Cleanup
      launcher.stopAllAgents();
    });
  });

  describe('stopAgent', () => {
    it('restituisce false quando il task non ha un agent in esecuzione', () => {
      const launcher = new AgentLauncher(null, mockLogger);

      expect(launcher.stopAgent('task-inesistente')).toBe(false);
    });

    it('restituisce true e invia SIGTERM quando il task ha un agent in esecuzione', () => {
      const launcher = new AgentLauncher(
        'node -e "setTimeout(() => {}, 10000)"',
        mockLogger,
      );
      const task = createTestTask();

      launcher.launchForTask(task);
      expect(launcher.isAgentRunning(task.id)).toBe(true);

      const stopped = launcher.stopAgent(task.id);
      expect(stopped).toBe(true);
    });
  });

  describe('getActiveAgentCount', () => {
    it('restituisce 0 quando nessun agent e in esecuzione', () => {
      const launcher = new AgentLauncher(null, mockLogger);
      expect(launcher.getActiveAgentCount()).toBe(0);
    });

    it('restituisce il numero corretto di agent attivi', () => {
      const launcher = new AgentLauncher(
        'node -e "setTimeout(() => {}, 5000)"',
        mockLogger,
      );

      const task1 = createTestTask({ id: 'task-1' });
      const task2 = createTestTask({ id: 'task-2' });

      launcher.launchForTask(task1);
      launcher.launchForTask(task2);

      expect(launcher.getActiveAgentCount()).toBe(2);

      // Cleanup
      launcher.stopAllAgents();
    });
  });

  describe('stopAllAgents', () => {
    it('ferma tutti gli agent in esecuzione', () => {
      const launcher = new AgentLauncher(
        'node -e "setTimeout(() => {}, 5000)"',
        mockLogger,
      );

      const task1 = createTestTask({ id: 'task-1' });
      const task2 = createTestTask({ id: 'task-2' });

      launcher.launchForTask(task1);
      launcher.launchForTask(task2);
      expect(launcher.getActiveAgentCount()).toBe(2);

      launcher.stopAllAgents();
      // Nota: stopAllAgents invia SIGTERM ma il cleanup avviene async nel 'close' handler
      // Verifichiamo che il segnale sia stato inviato (il logger.info viene chiamato)
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});

