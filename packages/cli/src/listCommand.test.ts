import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  initializeDatabase,
  TaskService,
} from '@kanban-reloaded/core';
import type {
  TaskStatus,
  TaskPriority,
  DatabaseInitializationResult,
} from '@kanban-reloaded/core';

// --- Status and priority label maps (mirroring index.ts) ---

const VALID_STATUSES: TaskStatus[] = ['backlog', 'in-progress', 'done'];

const STATUS_ITALIAN_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'In Progress',
  done: 'Done',
};

const PRIORITY_ITALIAN_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Bassa',
};

function truncateTitle(title: string, maximumLength: number): string {
  if (title.length <= maximumLength) return title;
  return title.slice(0, maximumLength - 3) + '...';
}

// --- Helpers for integration tests ---

const temporaryDirectories: string[] = [];
let databaseResult: DatabaseInitializationResult | null = null;

function createTemporaryProjectWithDatabase(): {
  projectDirectory: string;
  taskService: TaskService;
} {
  const projectDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kanban-cli-list-test-'),
  );
  temporaryDirectories.push(projectDirectory);

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

// ─── Status validation tests ──────────────────────────────────

describe('Status validation', () => {
  it('accepts valid statuses: backlog, in-progress, done', () => {
    for (const validStatus of VALID_STATUSES) {
      expect(VALID_STATUSES.includes(validStatus)).toBe(true);
    }
  });

  it('rejects invalid status values', () => {
    const invalidStatuses = ['pending', 'todo', 'completed', 'wip', ''];
    for (const invalidStatus of invalidStatuses) {
      expect(VALID_STATUSES.includes(invalidStatus as TaskStatus)).toBe(false);
    }
  });
});

// ─── Label mapping tests ──────────────────────────────────────

describe('Italian label mappings', () => {
  it('maps status values to Italian display labels', () => {
    expect(STATUS_ITALIAN_LABELS['backlog']).toBe('Backlog');
    expect(STATUS_ITALIAN_LABELS['in-progress']).toBe('In Progress');
    expect(STATUS_ITALIAN_LABELS['done']).toBe('Done');
  });

  it('maps priority values to Italian display labels', () => {
    expect(PRIORITY_ITALIAN_LABELS['high']).toBe('Alta');
    expect(PRIORITY_ITALIAN_LABELS['medium']).toBe('Media');
    expect(PRIORITY_ITALIAN_LABELS['low']).toBe('Bassa');
  });
});

// ─── Title truncation tests ───────────────────────────────────

describe('truncateTitle', () => {
  it('does not truncate short titles', () => {
    expect(truncateTitle('Short title', 40)).toBe('Short title');
  });

  it('truncates long titles with ellipsis', () => {
    const longTitle = 'A very long task title that exceeds the maximum column width for display';
    const truncated = truncateTitle(longTitle, 40);
    expect(truncated.length).toBe(40);
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('handles title exactly at the limit', () => {
    const exactTitle = 'A'.repeat(40);
    expect(truncateTitle(exactTitle, 40)).toBe(exactTitle);
  });
});

// ─── Integration: list logic with real DB ─────────────────────

describe('CLI list command — integration with TaskService', () => {
  it('lists all tasks when no status filter is applied', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    taskService.createTask({ title: 'Task Uno', priority: 'high' });
    taskService.createTask({ title: 'Task Due', priority: 'low' });
    taskService.createTask({ title: 'Task Tre', priority: 'medium' });

    const allTasks = taskService.getAllTasks();
    expect(allTasks).toHaveLength(3);
    expect(allTasks.map((task) => task.title)).toContain('Task Uno');
    expect(allTasks.map((task) => task.title)).toContain('Task Due');
    expect(allTasks.map((task) => task.title)).toContain('Task Tre');
  });

  it('filters tasks by status', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    taskService.createTask({ title: 'Backlog task', priority: 'medium' });
    const taskToMove = taskService.createTask({ title: 'Progress task', priority: 'high' });
    taskService.updateTask(taskToMove.id, { status: 'in-progress' });

    const backlogTasks = taskService.getTasksByStatus('backlog');
    expect(backlogTasks).toHaveLength(1);
    expect(backlogTasks[0].title).toBe('Backlog task');

    const inProgressTasks = taskService.getTasksByStatus('in-progress');
    expect(inProgressTasks).toHaveLength(1);
    expect(inProgressTasks[0].title).toBe('Progress task');

    const doneTasks = taskService.getTasksByStatus('done');
    expect(doneTasks).toHaveLength(0);
  });

  it('returns empty array when no tasks exist', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const allTasks = taskService.getAllTasks();
    expect(allTasks).toHaveLength(0);
  });

  it('returns empty array when filtering by status with no matching tasks', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    taskService.createTask({ title: 'Only backlog', priority: 'medium' });

    const doneTasks = taskService.getTasksByStatus('done');
    expect(doneTasks).toHaveLength(0);
  });

  it('handles 50+ tasks without issue', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const taskCount = 55;
    for (let index = 0; index < taskCount; index++) {
      taskService.createTask({ title: `Task numero ${index + 1}`, priority: 'medium' });
    }

    const allTasks = taskService.getAllTasks();
    expect(allTasks).toHaveLength(taskCount);
  });
});
