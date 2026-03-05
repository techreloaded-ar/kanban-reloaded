import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAllTasks, createTask } from './taskApi.js';
import type { Task } from '../types.js';

// ─── Test helpers ────────────────────────────────────────────

function createMockTask(overrides: Partial<Task> = {}): Task {
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
    createdAt: '2026-01-01T00:00:00.000Z',
    executionTime: null,
    position: 0,
    ...overrides,
  };
}

function mockFetchSuccess(responseBody: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Created',
      json: () => Promise.resolve(responseBody),
    }),
  );
}

function mockFetchError(status: number, statusText: string): void {
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

// ─── Setup / Teardown ────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getAllTasks ──────────────────────────────────────────────

describe('getAllTasks', () => {
  it('calls GET /api/tasks and returns the task list', async () => {
    const mockTasks = [createMockTask(), createMockTask({ displayId: 'TASK-002', title: 'Second' })];
    mockFetchSuccess(mockTasks);

    const result = await getAllTasks();

    expect(fetch).toHaveBeenCalledWith('/api/tasks');
    expect(result).toEqual(mockTasks);
  });

  it('returns an empty array when no tasks exist', async () => {
    mockFetchSuccess([]);

    const result = await getAllTasks();

    expect(result).toEqual([]);
  });

  it('throws an error when the server responds with an error status', async () => {
    mockFetchError(500, 'Internal Server Error');

    await expect(getAllTasks()).rejects.toThrow(
      'Errore nel caricamento dei task: Internal Server Error',
    );
  });
});

// ─── createTask ──────────────────────────────────────────────

describe('createTask', () => {
  it('sends POST /api/tasks with title-only payload', async () => {
    const createdTask = createMockTask({ title: 'New task' });
    mockFetchSuccess(createdTask, 201);

    const result = await createTask({ title: 'New task' });

    expect(fetch).toHaveBeenCalledWith('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New task' }),
    });
    expect(result).toEqual(createdTask);
  });

  it('includes all optional fields in the request body', async () => {
    const payload = {
      title: 'Full task',
      description: 'A detailed description',
      acceptanceCriteria: 'All tests pass',
      priority: 'high' as const,
    };
    const createdTask = createMockTask({ ...payload });
    mockFetchSuccess(createdTask, 201);

    const result = await createTask(payload);

    expect(fetch).toHaveBeenCalledWith('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(result.title).toBe('Full task');
    expect(result.description).toBe('A detailed description');
    expect(result.priority).toBe('high');
  });

  it('throws an error when the server responds with 400', async () => {
    mockFetchError(400, 'Bad Request');

    await expect(createTask({ title: '' })).rejects.toThrow(
      'Errore nella creazione del task: Bad Request',
    );
  });

  it('throws an error when the server responds with 500', async () => {
    mockFetchError(500, 'Internal Server Error');

    await expect(createTask({ title: 'Test' })).rejects.toThrow(
      'Errore nella creazione del task: Internal Server Error',
    );
  });
});
