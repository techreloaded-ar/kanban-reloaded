import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLauncher, sanitizeShellValue } from './agentLauncher.js';
import type { AgentLauncherLogger } from './agentLauncher.js';
import type { Task, ProjectConfiguration, ConfigService, AgentService, Agent } from '@kanban-reloaded/core';

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
    agentId: null,
    agentName: null,
    createdAt: '2026-03-05T10:00:00.000Z',
    updatedAt: null,
    executionTime: null,
    position: 0,
    ...overrides,
  };
}

/**
 * Crea un ConfigService mock che restituisce la configurazione specificata.
 */
function createMockConfigService(
  overrides?: Partial<ProjectConfiguration>,
): ConfigService {
  const configuration: ProjectConfiguration = {
    agentCommand: null,
    serverPort: 3000,
    columns: [],
    workingDirectory: null,
    agentEnvironmentVariables: {},
    ...overrides,
  };

  return {
    loadConfiguration: vi.fn(() => configuration),
    saveConfiguration: vi.fn(() => configuration),
    seedFromConfigFile: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
  } as unknown as ConfigService;
}

/**
 * Crea un AgentService mock con agenti opzionali.
 */
function createMockAgentService(agents: Agent[] = []): AgentService {
  const agentMap = new Map(agents.map(agent => [agent.id, agent]));
  return {
    getAllAgents: vi.fn(() => agents),
    getAgentById: vi.fn((id: string) => agentMap.get(id)),
    getAgentByName: vi.fn((name: string) => agents.find(a => a.name === name)),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
  } as unknown as AgentService;
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
    it('crea un istanza con ConfigService', () => {
      const mockConfigService = createMockConfigService();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      expect(launcher.getActiveAgentCount()).toBe(0);
    });
  });

  describe('launchForTask', () => {
    it('restituisce launched: false con motivo quando nessun agent e configurato (null)', () => {
      const mockConfigService = createMockConfigService({ agentCommand: null });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(false);
      if (!result.launched) {
        expect(result.reason).toBe('Nessun agent configurato');
      }
    });

    it('restituisce launched: false con motivo quando il comando e una stringa vuota', () => {
      const mockConfigService = createMockConfigService({ agentCommand: '' });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(false);
      if (!result.launched) {
        expect(result.reason).toBe('Nessun agent configurato');
      }
    });

    it('restituisce launched: false con motivo quando il comando e solo spazi', () => {
      const mockConfigService = createMockConfigService({ agentCommand: '   ' });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(false);
      if (!result.launched) {
        expect(result.reason).toBe('Nessun agent configurato');
      }
    });

    it('lancia un processo agent con un comando valido e restituisce launched: true', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'agent running\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      if (result.launched) {
        expect(typeof result.processId).toBe('number');
        expect(result.processId).toBeGreaterThan(0);
      }

      launcher.stopAllAgents();
    });

    it('impedisce il lancio di un secondo agent per lo stesso task', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "setTimeout(() => {}, 5000)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const firstResult = launcher.launchForTask(task);
      expect(firstResult.launched).toBe(true);

      const secondResult = launcher.launchForTask(task);
      expect(secondResult.launched).toBe(false);
      if (!secondResult.launched) {
        expect(secondResult.reason).toContain('gia in esecuzione');
      }

      launcher.stopAllAgents();
    });

    it('interpola i placeholder nel comando con i valori del task', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'{{title}}\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask({ title: 'Titolo di test' });

      const result = launcher.launchForTask(task);
      expect(result.launched).toBe(true);

      launcher.stopAllAgents();
    });

    it('sanitizza i valori del task prima dell interpolazione nel comando', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'{{title}}\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask({ title: 'Titolo $(rm -rf /) pericoloso' });

      const result = launcher.launchForTask(task);
      expect(result.launched).toBe(true);

      launcher.stopAllAgents();
    });

    it('legge la configurazione fresca dal ConfigService ad ogni lancio', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'test\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);

      const task1 = createTestTask({ id: 'task-1' });
      const task2 = createTestTask({ id: 'task-2' });

      launcher.launchForTask(task1);
      launcher.launchForTask(task2);

      // loadConfiguration deve essere chiamato una volta per ogni lancio
      expect(mockConfigService.loadConfiguration).toHaveBeenCalledTimes(2);

      launcher.stopAllAgents();
    });
  });

  describe('isAgentRunning', () => {
    it('restituisce false per un task senza agent in esecuzione', () => {
      const mockConfigService = createMockConfigService();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);

      expect(launcher.isAgentRunning('task-inesistente')).toBe(false);
    });

    it('restituisce true per un task con agent in esecuzione', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "setTimeout(() => {}, 5000)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      launcher.launchForTask(task);

      expect(launcher.isAgentRunning(task.id)).toBe(true);

      launcher.stopAllAgents();
    });
  });

  describe('stopAgent', () => {
    it('restituisce false quando il task non ha un agent in esecuzione', () => {
      const mockConfigService = createMockConfigService();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);

      expect(launcher.stopAgent('task-inesistente')).toBe(false);
    });

    it('restituisce true e invia SIGTERM quando il task ha un agent in esecuzione', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "setTimeout(() => {}, 10000)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      launcher.launchForTask(task);
      expect(launcher.isAgentRunning(task.id)).toBe(true);

      const stopped = launcher.stopAgent(task.id);
      expect(stopped).toBe(true);
    });
  });

  describe('getActiveAgentCount', () => {
    it('restituisce 0 quando nessun agent e in esecuzione', () => {
      const mockConfigService = createMockConfigService();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      expect(launcher.getActiveAgentCount()).toBe(0);
    });

    it('restituisce il numero corretto di agent attivi', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "setTimeout(() => {}, 5000)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);

      const task1 = createTestTask({ id: 'task-1' });
      const task2 = createTestTask({ id: 'task-2' });

      launcher.launchForTask(task1);
      launcher.launchForTask(task2);

      expect(launcher.getActiveAgentCount()).toBe(2);

      launcher.stopAllAgents();
    });
  });

  describe('stopAllAgents', () => {
    it('ferma tutti gli agent in esecuzione', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "setTimeout(() => {}, 5000)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);

      const task1 = createTestTask({ id: 'task-1' });
      const task2 = createTestTask({ id: 'task-2' });

      launcher.launchForTask(task1);
      launcher.launchForTask(task2);
      expect(launcher.getActiveAgentCount()).toBe(2);

      launcher.stopAllAgents();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('supporto agent multipli per ID', () => {
    it('usa il comando specifico quando il task ha un agentId collegato a un agente nella tabella', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'default agent\')"',
      });
      const featureAgent: Agent = {
        id: 'agent-feature-id',
        name: 'feature',
        commandTemplate: 'node -e "console.log(\'feature agent\')"',
        workingDirectory: null,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: null,
      };
      const mockAgentService = createMockAgentService([featureAgent]);
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setAgentService(mockAgentService);
      const task = createTestTask({ agentId: 'agent-feature-id' });

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("uso agent 'feature'"),
      );

      launcher.stopAllAgents();
    });

    it('usa il comando di default e logga warning quando agentId non corrisponde a nessun agente', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'default agent\')"',
      });
      const mockAgentService = createMockAgentService([]);
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setAgentService(mockAgentService);
      const task = createTestTask({ agentId: 'agent-inesistente-id' });

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("non trovato"),
      );

      launcher.stopAllAgents();
    });

    it('usa il comando di default quando il task non ha un agentId specificato', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'default agent\')"',
      });
      const mockAgentService = createMockAgentService([]);
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setAgentService(mockAgentService);
      const task = createTestTask({ agentId: null });

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('non trovato'),
      );

      launcher.stopAllAgents();
    });
  });
});
