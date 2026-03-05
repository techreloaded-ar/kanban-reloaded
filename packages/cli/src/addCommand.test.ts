import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  initializeDatabase,
  TaskService,
  KANBAN_DIRECTORY_NAME,
} from '@kanban-reloaded/core';
import type {
  TaskPriority,
  DatabaseInitializationResult,
} from '@kanban-reloaded/core';

/**
 * Priority mapping identical to the one in index.ts.
 * We test it here as a pure function to validate all Italian/English aliases.
 */
const PRIORITY_MAP: Record<string, TaskPriority> = {
  alta: 'high',
  high: 'high',
  media: 'medium',
  medium: 'medium',
  bassa: 'low',
  low: 'low',
};

function mapPriority(input: string): TaskPriority | undefined {
  return PRIORITY_MAP[input.toLowerCase()];
}

// --- Helpers for integration tests ---

const temporaryDirectories: string[] = [];
let databaseResult: DatabaseInitializationResult | null = null;

function createTemporaryProjectWithDatabase(): {
  projectDirectory: string;
  taskService: TaskService;
} {
  const projectDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kanban-cli-add-test-'),
  );
  temporaryDirectories.push(projectDirectory);

  // The CLI discovers the .kanban-reloaded directory; initializeDatabase creates it
  databaseResult = initializeDatabase(projectDirectory);
  const taskService = new TaskService(databaseResult.database);

  return { projectDirectory, taskService };
}

afterEach(() => {
  if (databaseResult) {
    databaseResult.closeConnection();
    databaseResult = null;
  }
  for (const directoryPath of temporaryDirectories) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  }
  temporaryDirectories.length = 0;
});

// ─── Priority mapping tests ──────────────────────────────────

describe('PRIORITY_MAP — priority mapping', () => {
  it('maps Italian "alta" to high', () => {
    expect(mapPriority('alta')).toBe('high');
  });

  it('maps Italian "media" to medium', () => {
    expect(mapPriority('media')).toBe('medium');
  });

  it('maps Italian "bassa" to low', () => {
    expect(mapPriority('bassa')).toBe('low');
  });

  it('maps English "high" to high', () => {
    expect(mapPriority('high')).toBe('high');
  });

  it('maps English "medium" to medium', () => {
    expect(mapPriority('medium')).toBe('medium');
  });

  it('maps English "low" to low', () => {
    expect(mapPriority('low')).toBe('low');
  });

  it('is case-insensitive', () => {
    expect(mapPriority('ALTA')).toBe('high');
    expect(mapPriority('Media')).toBe('medium');
    expect(mapPriority('LOW')).toBe('low');
  });

  it('returns undefined for invalid priority', () => {
    expect(mapPriority('urgente')).toBeUndefined();
    expect(mapPriority('')).toBeUndefined();
    expect(mapPriority('critical')).toBeUndefined();
  });
});

// ─── Integration: CLI add logic with real DB ────────────────

describe('CLI add command — integration with TaskService', () => {
  it('creates a task with only required title', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const createdTask = taskService.createTask({
      title: 'Implement login',
    });

    expect(createdTask.title).toBe('Implement login');
    expect(createdTask.priority).toBe('medium');
    expect(createdTask.status).toBe('backlog');
    expect(createdTask.displayId).toMatch(/^TASK-\d{3}$/);
  });

  it('creates a task with all optional fields', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const createdTask = taskService.createTask({
      title: 'Implement OAuth',
      description: 'Add Google OAuth support',
      acceptanceCriteria: 'User can sign in with Google',
      priority: 'high',
    });

    expect(createdTask.title).toBe('Implement OAuth');
    expect(createdTask.description).toBe('Add Google OAuth support');
    expect(createdTask.acceptanceCriteria).toBe('User can sign in with Google');
    expect(createdTask.priority).toBe('high');
  });

  it('maps Italian priority and passes it to TaskService', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const priorityValue = mapPriority('bassa');
    expect(priorityValue).toBe('low');

    const createdTask = taskService.createTask({
      title: 'Low priority task',
      priority: priorityValue,
    });

    expect(createdTask.priority).toBe('low');
  });

  it('assigns sequential displayIds across multiple tasks', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const firstTask = taskService.createTask({ title: 'First' });
    const secondTask = taskService.createTask({ title: 'Second' });
    const thirdTask = taskService.createTask({ title: 'Third' });

    expect(firstTask.displayId).toBe('TASK-001');
    expect(secondTask.displayId).toBe('TASK-002');
    expect(thirdTask.displayId).toBe('TASK-003');
  });

  it('creates the .kanban-reloaded directory when initializing database', () => {
    const { projectDirectory } = createTemporaryProjectWithDatabase();
    const kanbanDirectory = path.join(projectDirectory, KANBAN_DIRECTORY_NAME);

    expect(fs.existsSync(kanbanDirectory)).toBe(true);
  });

  it('rejects a task with an empty title', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    expect(() => taskService.createTask({ title: '' })).toThrow();
    expect(() => taskService.createTask({ title: '   ' })).toThrow();
  });
});
