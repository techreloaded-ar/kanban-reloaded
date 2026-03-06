import { vi } from 'vitest';
import type { Task } from '../types.js';
import type { Agent } from '../api/agentApi.js';
import type { ProjectConfiguration } from '../api/configApi.js';

/**
 * Crea un Task con valori di default sensati, sovrascrivibili tramite `overrides`.
 */
export function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    displayId: 'TASK-001',
    title: 'Test task',
    description: '',
    acceptanceCriteria: '',
    priority: 'medium',
    status: 'backlog',
    agentRunning: false,
    agentLog: null,
    agentId: null,
    agentName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    executionTime: null,
    position: 0,
    ...overrides,
  };
}

/**
 * Crea un Agent con valori di default sovrascrivibili.
 */
export function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-aaaa-bbbb-cccc-dddddddddddd',
    name: 'Test Agent',
    commandTemplate: 'echo "hello"',
    workingDirectory: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    ...overrides,
  };
}

/**
 * Crea una ProjectConfiguration con valori di default sovrascrivibili.
 */
export function createMockConfiguration(
  overrides: Partial<ProjectConfiguration> = {},
): ProjectConfiguration {
  return {
    agentCommand: null,
    serverPort: 3000,
    columns: [
      { id: 'backlog', name: 'Backlog', color: 'bg-info' },
      { id: 'in-progress', name: 'In Progress', color: 'bg-warning' },
      { id: 'done', name: 'Done', color: 'bg-success' },
    ],
    workingDirectory: null,
    agentEnvironmentVariables: {},
    ...overrides,
  };
}

function statusTextForCode(status: number): string {
  if (status === 200) return 'OK';
  if (status === 201) return 'Created';
  if (status === 204) return 'No Content';
  return 'OK';
}

/**
 * Stub `fetch` globale per restituire una risposta di successo con il body fornito.
 */
export function mockFetchSuccess(responseBody: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: statusTextForCode(status),
      json: () => Promise.resolve(responseBody),
    }),
  );
}

/**
 * Stub `fetch` globale per restituire una risposta di errore.
 */
export function mockFetchError(status: number, statusText: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText,
      json: () => Promise.resolve({ error: statusText }),
    }),
  );
}
