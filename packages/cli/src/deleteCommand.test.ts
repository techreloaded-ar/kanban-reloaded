import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  initializeDatabase,
  TaskService,
} from '@kanban-reloaded/core';
import type { DatabaseInitializationResult } from '@kanban-reloaded/core';

const temporaryDirectories: string[] = [];
let databaseResult: DatabaseInitializationResult | null = null;

function createTemporaryProjectWithDatabase(): {
  projectDirectory: string;
  taskService: TaskService;
} {
  const projectDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kanban-cli-delete-test-'),
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

describe('CLI delete command — integration with TaskService', () => {
  it('elimina un task esistente tramite UUID', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task da eliminare' });

    const deletedTask = taskService.deleteTask(createdTask.id);

    expect(deletedTask.id).toBe(createdTask.id);
    expect(deletedTask.title).toBe('Task da eliminare');
  });

  it('elimina un task cercandolo per displayId', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task cercabile per displayId' });

    // Simula la logica di ricerca per displayId dalla CLI
    const foundTask = taskService.getTaskByDisplayId(createdTask.displayId);
    expect(foundTask).toBeDefined();

    const deletedTask = taskService.deleteTask(foundTask!.id);
    expect(deletedTask.id).toBe(createdTask.id);
  });

  it('lancia errore quando si tenta di eliminare un task inesistente', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    expect(() =>
      taskService.deleteTask('00000000-0000-0000-0000-000000000000'),
    ).toThrowError(/Task non trovato/);
  });

  it('verifica che il task non esista piu dopo la cancellazione', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task temporaneo' });

    taskService.deleteTask(createdTask.id);

    const taskAfterDeletion = taskService.getTaskByDisplayId(createdTask.displayId);
    expect(taskAfterDeletion).toBeUndefined();

    const allTasks = taskService.getAllTasks();
    expect(allTasks).toHaveLength(0);
  });
});
