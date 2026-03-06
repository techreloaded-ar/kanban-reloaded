import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  launchAgentForTask,
  getTaskDependencies,
  addTaskDependency,
  removeTaskDependency,
  getTaskSubtasks,
  createSubtask,
  toggleSubtask,
  deleteSubtask,
} from './taskApi.js';
import type { Subtask, SubtaskListResponse, TaskDependencies } from './taskApi.js';
import { createMockTask, mockFetchSuccess, mockFetchError } from '../test-utils/mockHelpers.js';

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

// ─── updateTask ─────────────────────────────────────────────

describe('updateTask', () => {
  it('sends PATCH /api/tasks/:id with the update payload and returns the updated task', async () => {
    const updatedTask = createMockTask({ title: 'Updated title' });
    mockFetchSuccess(updatedTask);

    const result = await updateTask('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', { title: 'Updated title' });

    expect(fetch).toHaveBeenCalledWith('/api/tasks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated title' }),
    });
    expect(result).toEqual(updatedTask);
  });

  it('throws with the server error message when the task is not found', async () => {
    mockFetchError(404, 'Task non trovato');

    await expect(updateTask('nonexistent-id', { title: 'X' })).rejects.toThrow('Task non trovato');
  });
});

// ─── deleteTask ─────────────────────────────────────────────

describe('deleteTask', () => {
  it('sends DELETE /api/tasks/:id and returns the deleted task', async () => {
    const deletedTask = createMockTask();
    mockFetchSuccess(deletedTask);

    const result = await deleteTask('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      method: 'DELETE',
    });
    expect(result).toEqual(deletedTask);
  });

  it('appends ?force=true query parameter when force flag is set', async () => {
    const deletedTask = createMockTask();
    mockFetchSuccess(deletedTask);

    await deleteTask('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', true);

    expect(fetch).toHaveBeenCalledWith('/api/tasks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?force=true', {
      method: 'DELETE',
    });
  });

  it('throws with the server error message when the task is not found', async () => {
    mockFetchError(404, 'Task non trovato');

    await expect(deleteTask('nonexistent-id')).rejects.toThrow('Task non trovato');
  });
});

// ─── reorderTasks ───────────────────────────────────────────

describe('reorderTasks', () => {
  it('sends PUT /api/tasks/reorder with taskIds and status', async () => {
    mockFetchSuccess(null);

    await reorderTasks(['id-1', 'id-2', 'id-3'], 'backlog');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: ['id-1', 'id-2', 'id-3'], status: 'backlog' }),
    });
  });

  it('throws with the server error message on 400 Bad Request', async () => {
    mockFetchError(400, 'Bad Request');

    await expect(reorderTasks([], 'backlog')).rejects.toThrow('Bad Request');
  });
});

// ─── launchAgentForTask ─────────────────────────────────────

describe('launchAgentForTask', () => {
  it('sends POST /api/tasks/:id/launch-agent and returns the task', async () => {
    const launchedTask = createMockTask({ agentRunning: true });
    mockFetchSuccess(launchedTask);

    const result = await launchAgentForTask('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/launch-agent', {
      method: 'POST',
    });
    expect(result.agentRunning).toBe(true);
  });

  it('throws with the server error message on 500', async () => {
    mockFetchError(500, 'Internal Server Error');

    await expect(launchAgentForTask('some-id')).rejects.toThrow('Internal Server Error');
  });
});

// ─── getTaskDependencies ────────────────────────────────────

describe('getTaskDependencies', () => {
  it('calls GET /api/tasks/:id/dependencies and returns blocking and blockedBy lists', async () => {
    const dependencies: TaskDependencies = {
      blockingTasks: [createMockTask({ displayId: 'TASK-002' })],
      blockedByTasks: [createMockTask({ displayId: 'TASK-003' })],
    };
    mockFetchSuccess(dependencies);

    const result = await getTaskDependencies('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/dependencies');
    expect(result.blockingTasks).toHaveLength(1);
    expect(result.blockedByTasks).toHaveLength(1);
  });

  it('returns empty lists when there are no dependencies', async () => {
    const dependencies: TaskDependencies = { blockingTasks: [], blockedByTasks: [] };
    mockFetchSuccess(dependencies);

    const result = await getTaskDependencies('some-id');

    expect(result.blockingTasks).toEqual([]);
    expect(result.blockedByTasks).toEqual([]);
  });
});

// ─── addTaskDependency ──────────────────────────────────────

describe('addTaskDependency', () => {
  it('sends POST /api/tasks/:blockedId/dependencies with blockingTaskId', async () => {
    mockFetchSuccess(null);

    await addTaskDependency('blocked-id', 'blocking-id');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/blocked-id/dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockingTaskId: 'blocking-id' }),
    });
  });

  it('throws with the server error message on duplicate dependency (409)', async () => {
    mockFetchError(409, 'Dipendenza gia esistente');

    await expect(addTaskDependency('blocked-id', 'blocking-id')).rejects.toThrow('Dipendenza gia esistente');
  });
});

// ─── removeTaskDependency ───────────────────────────────────

describe('removeTaskDependency', () => {
  it('sends DELETE /api/tasks/:blockedId/dependencies/:blockingId', async () => {
    mockFetchSuccess(null);

    await removeTaskDependency('blocked-id', 'blocking-id');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/blocked-id/dependencies/blocking-id', {
      method: 'DELETE',
    });
  });

  it('throws when the dependency is not found', async () => {
    mockFetchError(404, 'Not Found');

    await expect(removeTaskDependency('blocked-id', 'nonexistent')).rejects.toThrow(
      'Errore nella rimozione della dipendenza',
    );
  });
});

// ─── getTaskSubtasks ────────────────────────────────────────

function createMockSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 'sub-aaaa-bbbb-cccc-dddd',
    taskId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    text: 'A subtask',
    completed: false,
    position: 0,
    ...overrides,
  };
}

describe('getTaskSubtasks', () => {
  it('calls GET /api/tasks/:id/subtasks and returns subtasks with progress', async () => {
    const responseBody: SubtaskListResponse = {
      subtasks: [createMockSubtask(), createMockSubtask({ id: 'sub-2', completed: true, position: 1 })],
      progress: { total: 2, completed: 1 },
    };
    mockFetchSuccess(responseBody);

    const result = await getTaskSubtasks('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/subtasks');
    expect(result.subtasks).toHaveLength(2);
    expect(result.progress.completed).toBe(1);
  });

  it('throws when the server responds with an error', async () => {
    mockFetchError(500, 'Internal Server Error');

    await expect(getTaskSubtasks('some-id')).rejects.toThrow('Errore nel recupero dei subtask');
  });
});

// ─── createSubtask ──────────────────────────────────────────

describe('createSubtask', () => {
  it('sends POST /api/tasks/:id/subtasks with text and returns the created subtask', async () => {
    const newSubtask = createMockSubtask({ text: 'New subtask' });
    mockFetchSuccess(newSubtask, 201);

    const result = await createSubtask('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'New subtask');

    expect(fetch).toHaveBeenCalledWith('/api/tasks/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'New subtask' }),
    });
    expect(result.text).toBe('New subtask');
  });

  it('throws when the server responds with an error', async () => {
    mockFetchError(400, 'Bad Request');

    await expect(createSubtask('some-id', '')).rejects.toThrow('Errore nella creazione del subtask');
  });
});

// ─── toggleSubtask ──────────────────────────────────────────

describe('toggleSubtask', () => {
  it('sends PATCH /api/subtasks/:id/toggle and returns the toggled subtask', async () => {
    const toggledSubtask = createMockSubtask({ completed: true });
    mockFetchSuccess(toggledSubtask);

    const result = await toggleSubtask('sub-aaaa-bbbb-cccc-dddd');

    expect(fetch).toHaveBeenCalledWith('/api/subtasks/sub-aaaa-bbbb-cccc-dddd/toggle', {
      method: 'PATCH',
    });
    expect(result.completed).toBe(true);
  });

  it('throws when the subtask is not found', async () => {
    mockFetchError(404, 'Not Found');

    await expect(toggleSubtask('nonexistent')).rejects.toThrow('Errore nel toggle del subtask');
  });
});

// ─── deleteSubtask ──────────────────────────────────────────

describe('deleteSubtask', () => {
  it('sends DELETE /api/subtasks/:id', async () => {
    mockFetchSuccess(null);

    await deleteSubtask('sub-aaaa-bbbb-cccc-dddd');

    expect(fetch).toHaveBeenCalledWith('/api/subtasks/sub-aaaa-bbbb-cccc-dddd', {
      method: 'DELETE',
    });
  });

  it('throws when the subtask is not found', async () => {
    mockFetchError(404, 'Not Found');

    await expect(deleteSubtask('nonexistent')).rejects.toThrow('Errore nella cancellazione del subtask');
  });
});
