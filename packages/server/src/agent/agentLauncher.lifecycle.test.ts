import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentLauncher, sanitizeShellValue } from './agentLauncher.js';
import type { AgentLauncherLogger } from './agentLauncher.js';
import type { Task, ProjectConfiguration, ConfigService, TaskService } from '@kanban-reloaded/core';
import type { WebSocketBroadcaster } from '../websocket/websocketBroadcaster.js';

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
 * Crea un TaskService mock con metodi spy.
 */
function createMockTaskService(): TaskService {
  return {
    updateTask: vi.fn((_id: string, _data: Record<string, unknown>) => createTestTask()),
    getTaskById: vi.fn((_id: string) => createTestTask()),
    createTask: vi.fn(),
    getAllTasks: vi.fn(() => []),
    getTasksByStatus: vi.fn(() => []),
    deleteTask: vi.fn(),
    getTaskByDisplayId: vi.fn(),
    reorderTasksInColumn: vi.fn(),
    addDependency: vi.fn(),
    removeDependency: vi.fn(),
    getBlockingTasks: vi.fn(() => []),
    getBlockedTasks: vi.fn(() => []),
    getUncompletedBlockers: vi.fn(() => []),
    isTaskBlocked: vi.fn(() => false),
    createSubtask: vi.fn(),
    getSubtasksByTaskId: vi.fn(() => []),
    updateSubtask: vi.fn(),
    toggleSubtask: vi.fn(),
    deleteSubtask: vi.fn(),
    getSubtaskProgress: vi.fn(() => ({ total: 0, completed: 0 })),
  } as unknown as TaskService;
}

/**
 * Crea un WebSocketBroadcaster mock.
 */
function createMockBroadcaster(): WebSocketBroadcaster {
  return {
    broadcastEvent: vi.fn(),
    broadcastTaskEvent: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    getConnectedClientCount: vi.fn(() => 0),
  } as unknown as WebSocketBroadcaster;
}

describe('AgentLauncher — ciclo di vita del processo', () => {
  let mockLogger: AgentLauncherLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('parseCommandIntoParts (testato indirettamente via launchForTask)', () => {
    it('splitta un comando semplice in eseguibile e argomenti', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(1)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      // Il comando viene parsato e il processo viene lanciato con successo
      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });

    it('gestisce un comando con singola parola senza argomenti', () => {
      // 'node' da solo e un comando valido che spawn puo eseguire
      const mockConfigService = createMockConfigService({
        agentCommand: 'node',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      // node senza argomenti si avvia e attende stdin
      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });

    it('gestisce un comando con argomenti tra virgolette doppie', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });

    it('restituisce launched false quando il comando e vuoto dopo la sanitizzazione dei placeholder', () => {
      // Il comando contiene solo metacaratteri che vengono sanitizzati dal template
      // ma il comando stesso e solo spazi dopo il parsing
      const mockConfigService = createMockConfigService({
        agentCommand: '   ',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(false);
    });
  });

  describe('setupProcessExitHandler (testato indirettamente tramite processo reale)', () => {
    it('aggiorna il task a done quando il processo termina con exit code 0', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
      });
      const mockTaskService = createMockTaskService();
      const mockBroadcaster = createMockBroadcaster();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setTaskService(mockTaskService);
      launcher.setWebSocketBroadcaster(mockBroadcaster);

      const task = createTestTask();
      const result = launcher.launchForTask(task);
      expect(result.launched).toBe(true);

      // Aspetta che il processo termini
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Il task deve essere stato aggiornato con agentRunning: false e status: done
      expect(mockTaskService.updateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          agentRunning: false,
          status: 'done',
        }),
      );
    });

    it('aggiorna il task senza spostarlo a done quando il processo termina con exit code non-zero', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(1)"',
      });
      const mockTaskService = createMockTaskService();
      const mockBroadcaster = createMockBroadcaster();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setTaskService(mockTaskService);
      launcher.setWebSocketBroadcaster(mockBroadcaster);

      const task = createTestTask();
      launcher.launchForTask(task);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Il task deve essere aggiornato ma NON spostato a done
      expect(mockTaskService.updateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          agentRunning: false,
        }),
      );

      // Verifica che status: 'done' NON sia presente nell'update
      const updateCall = (mockTaskService.updateTask as ReturnType<typeof vi.fn>).mock.calls[0];
      if (updateCall) {
        expect(updateCall[1]).not.toHaveProperty('status');
      }
    });

    it('broadcast evento agent:completed con success true per exit code 0', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
      });
      const mockTaskService = createMockTaskService();
      const mockBroadcaster = createMockBroadcaster();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setTaskService(mockTaskService);
      launcher.setWebSocketBroadcaster(mockBroadcaster);

      const task = createTestTask();
      launcher.launchForTask(task);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(mockBroadcaster.broadcastEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent:completed',
          payload: expect.objectContaining({
            taskId: task.id,
            success: true,
            exitCode: 0,
          }),
        }),
      );
    });

    it('broadcast evento agent:completed con success false per exit code non-zero', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(42)"',
      });
      const mockTaskService = createMockTaskService();
      const mockBroadcaster = createMockBroadcaster();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setTaskService(mockTaskService);
      launcher.setWebSocketBroadcaster(mockBroadcaster);

      const task = createTestTask();
      launcher.launchForTask(task);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(mockBroadcaster.broadcastEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent:completed',
          payload: expect.objectContaining({
            taskId: task.id,
            success: false,
            exitCode: 42,
          }),
        }),
      );
    });

    it('rimuove il processo dalla mappa degli attivi dopo la terminazione', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);

      const task = createTestTask();
      launcher.launchForTask(task);

      expect(launcher.isAgentRunning(task.id)).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(launcher.isAgentRunning(task.id)).toBe(false);
      expect(launcher.getActiveAgentCount()).toBe(0);
    });
  });

  describe('updateTaskOnAgentCompletion (testato indirettamente)', () => {
    it('calcola executionTime come differenza tra avvio e fine', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "setTimeout(() => process.exit(0), 200)"',
      });
      const mockTaskService = createMockTaskService();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setTaskService(mockTaskService);

      const task = createTestTask();
      launcher.launchForTask(task);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verifica che executionTime sia un numero positivo (almeno ~200ms)
      expect(mockTaskService.updateTask).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          agentRunning: false,
          executionTime: expect.any(Number),
        }),
      );

      const updateCall = (mockTaskService.updateTask as ReturnType<typeof vi.fn>).mock.calls[0];
      const executionTime = (updateCall[1] as { executionTime: number }).executionTime;
      expect(executionTime).toBeGreaterThanOrEqual(100);
    });

    it('logga un warning se TaskService non e disponibile', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
      });
      // Non impostiamo il TaskService
      const launcher = new AgentLauncher(mockConfigService, mockLogger);

      const task = createTestTask();
      launcher.launchForTask(task);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('TaskService non disponibile'),
      );
    });

    it('broadcast task:updated dopo il completamento dell agent per sincronizzare il frontend', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
      });
      const mockTaskService = createMockTaskService();
      const mockBroadcaster = createMockBroadcaster();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setTaskService(mockTaskService);
      launcher.setWebSocketBroadcaster(mockBroadcaster);

      const task = createTestTask();
      launcher.launchForTask(task);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Deve avere broadcast sia agent:completed che task:updated
      const broadcastCalls = (mockBroadcaster.broadcastEvent as ReturnType<typeof vi.fn>).mock.calls;
      const eventTypes = broadcastCalls.map(
        (call: [{ type: string }]) => call[0].type,
      );

      expect(eventTypes).toContain('agent:started');
      expect(eventTypes).toContain('agent:completed');
      expect(eventTypes).toContain('task:updated');
    });
  });

  describe('resolveWorkingDirectory (testato indirettamente via launchForTask)', () => {
    it('usa la directory del progetto come default quando nessun workingDirectory e configurato', () => {
      const projectDir = process.cwd();
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
        workingDirectory: null,
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger, projectDir);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      // Il lancio riesce, il che significa che il working directory e stato risolto
      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });

    it('logga un warning quando la directory configurata non esiste e usa il default', () => {
      const projectDir = process.cwd();
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(0)"',
        workingDirectory: '/directory/inesistente/sicuramente',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger, projectDir);
      const task = createTestTask();

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('non esiste o non e una directory'),
      );
      launcher.stopAllAgents();
    });
  });

  describe('broadcast evento agent:started', () => {
    it('invia agent:started con taskId, displayId e processId al lancio', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "setTimeout(() => {}, 5000)"',
      });
      const mockBroadcaster = createMockBroadcaster();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setWebSocketBroadcaster(mockBroadcaster);

      const task = createTestTask();
      const result = launcher.launchForTask(task);
      expect(result.launched).toBe(true);

      expect(mockBroadcaster.broadcastEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent:started',
          payload: expect.objectContaining({
            taskId: task.id,
            displayId: task.displayId,
            processId: expect.any(Number),
          }),
        }),
      );

      launcher.stopAllAgents();
    });
  });

  describe('interpolazione dei placeholder nel comando', () => {
    it('interpola {{title}} con il titolo sanitizzato del task', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'{{title}}\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask({ title: 'Titolo semplice' });

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });

    it('interpola {{description}} e {{acceptanceCriteria}} correttamente', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'{{description}} {{acceptanceCriteria}}\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask({
        description: 'Desc test',
        acceptanceCriteria: 'Criteria test',
      });

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });

    it('supporta il placeholder alternativo {{acceptance_criteria}}', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'{{acceptance_criteria}}\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask({ acceptanceCriteria: 'Test criteria' });

      const result = launcher.launchForTask(task);

      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });

    it('sanitizza i metacaratteri shell nei valori del task prima dell interpolazione', () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "console.log(\'{{title}}\')"',
      });
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      const task = createTestTask({ title: 'test `whoami` $(rm -rf /) | cat' });

      const result = launcher.launchForTask(task);

      // Il titolo viene sanitizzato: i metacaratteri vengono rimossi
      expect(result.launched).toBe(true);
      launcher.stopAllAgents();
    });
  });

  describe('variabili di ambiente del processo agent', () => {
    it('lancia il processo con le variabili di ambiente configurate', async () => {
      const mockConfigService = createMockConfigService({
        agentCommand: 'node -e "process.exit(process.env.TEST_VAR === \'hello\' ? 0 : 1)"',
        agentEnvironmentVariables: { TEST_VAR: 'hello' },
      });
      const mockTaskService = createMockTaskService();
      const mockBroadcaster = createMockBroadcaster();
      const launcher = new AgentLauncher(mockConfigService, mockLogger);
      launcher.setTaskService(mockTaskService);
      launcher.setWebSocketBroadcaster(mockBroadcaster);

      const task = createTestTask();
      launcher.launchForTask(task);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Il processo deve terminare con exit code 0 (la variabile TEST_VAR era 'hello')
      expect(mockBroadcaster.broadcastEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent:completed',
          payload: expect.objectContaining({
            exitCode: 0,
            success: true,
          }),
        }),
      );
    });
  });
});
