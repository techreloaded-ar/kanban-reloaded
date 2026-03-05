import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  initializeDatabase,
  TaskService,
} from '@kanban-reloaded/core';
import type { TaskStatus, DatabaseInitializationResult } from '@kanban-reloaded/core';

// --- Status mapping identical to the one in index.ts ---

const STATUS_MAP: Record<string, TaskStatus> = {
  backlog: 'backlog',
  arretrato: 'backlog',
  'in-progress': 'in-progress',
  'in-corso': 'in-progress',
  done: 'done',
  completato: 'done',
};

function mapStatus(input: string): TaskStatus | undefined {
  return STATUS_MAP[input.toLowerCase()];
}

// --- Helpers for integration tests ---

const temporaryDirectories: string[] = [];
let databaseResult: DatabaseInitializationResult | null = null;

function createTemporaryProjectWithDatabase(): {
  projectDirectory: string;
  taskService: TaskService;
} {
  const projectDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kanban-cli-move-test-'),
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

// --- Status mapping tests ---

describe('STATUS_MAP — status mapping', () => {
  it('maps "backlog" to backlog', () => {
    expect(mapStatus('backlog')).toBe('backlog');
  });

  it('maps Italian "arretrato" to backlog', () => {
    expect(mapStatus('arretrato')).toBe('backlog');
  });

  it('maps "in-progress" to in-progress', () => {
    expect(mapStatus('in-progress')).toBe('in-progress');
  });

  it('maps Italian "in-corso" to in-progress', () => {
    expect(mapStatus('in-corso')).toBe('in-progress');
  });

  it('maps "done" to done', () => {
    expect(mapStatus('done')).toBe('done');
  });

  it('maps Italian "completato" to done', () => {
    expect(mapStatus('completato')).toBe('done');
  });

  it('is case-insensitive', () => {
    expect(mapStatus('BACKLOG')).toBe('backlog');
    expect(mapStatus('In-Progress')).toBe('in-progress');
    expect(mapStatus('DONE')).toBe('done');
    expect(mapStatus('Arretrato')).toBe('backlog');
    expect(mapStatus('Completato')).toBe('done');
  });

  it('returns undefined for invalid status', () => {
    expect(mapStatus('invalido')).toBeUndefined();
    expect(mapStatus('')).toBeUndefined();
    expect(mapStatus('pending')).toBeUndefined();
    expect(mapStatus('wip')).toBeUndefined();
  });
});

// --- Integration: CLI move logic with real DB ---

describe('CLI move command — integration with TaskService', () => {
  it('sposta un task da backlog a in-progress', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task da spostare' });
    expect(createdTask.status).toBe('backlog');

    const updatedTask = taskService.updateTask(createdTask.id, {
      status: 'in-progress',
    });

    expect(updatedTask.status).toBe('in-progress');
    expect(updatedTask.title).toBe('Task da spostare');
  });

  it('sposta un task da in-progress a done', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task completabile' });

    taskService.updateTask(createdTask.id, { status: 'in-progress' });
    const doneTask = taskService.updateTask(createdTask.id, { status: 'done' });

    expect(doneTask.status).toBe('done');
  });

  it('sposta un task da done a backlog', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task da riaprire' });

    taskService.updateTask(createdTask.id, { status: 'done' });
    const backlogTask = taskService.updateTask(createdTask.id, {
      status: 'backlog',
    });

    expect(backlogTask.status).toBe('backlog');
  });

  it('cerca il task per displayId (case-insensitive) e lo sposta', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task cercabile' });

    // Simula la logica di ricerca per displayId dalla CLI
    const foundTask = taskService.getTaskByDisplayId(
      createdTask.displayId.toLowerCase(),
    );

    expect(foundTask).toBeDefined();
    expect(foundTask!.id).toBe(createdTask.id);

    const updatedTask = taskService.updateTask(foundTask!.id, {
      status: 'done',
    });
    expect(updatedTask.status).toBe('done');
  });

  it('lancia errore quando il task ID non esiste', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    expect(() =>
      taskService.updateTask('00000000-0000-0000-0000-000000000000', {
        status: 'done',
      }),
    ).toThrowError(/Task non trovato/);
  });

  it('getTaskByDisplayId restituisce undefined per displayId inesistente', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const foundTask = taskService.getTaskByDisplayId('TASK-999');
    expect(foundTask).toBeUndefined();
  });

  it('il messaggio di successo contiene displayId, titolo e stato', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Implementa login' });

    const updatedTask = taskService.updateTask(createdTask.id, {
      status: 'in-progress',
    });

    // Simula la formattazione del messaggio dalla CLI
    const STATUS_ITALIAN_LABELS: Record<TaskStatus, string> = {
      backlog: 'Backlog',
      'in-progress': 'In Progress',
      done: 'Done',
    };

    const successMessage = `Task spostato: ${updatedTask.displayId} — ${updatedTask.title} → ${STATUS_ITALIAN_LABELS[updatedTask.status]}`;

    expect(successMessage).toContain('TASK-001');
    expect(successMessage).toContain('Implementa login');
    expect(successMessage).toContain('In Progress');
    expect(successMessage).toContain('Task spostato:');
  });
});
