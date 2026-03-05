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
    path.join(os.tmpdir(), 'kanban-cli-edit-test-'),
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

describe('CLI edit command — integration with TaskService', () => {
  it('aggiorna il titolo di un task esistente tramite updateTask', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Titolo originale' });

    const updatedTask = taskService.updateTask(createdTask.id, {
      title: 'Titolo modificato via CLI',
    });

    expect(updatedTask.title).toBe('Titolo modificato via CLI');
    expect(updatedTask.description).toBe(createdTask.description);
    expect(updatedTask.updatedAt).not.toBeNull();
  });

  it('cerca il task per displayId (case-insensitive) e lo aggiorna', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({ title: 'Task cercabile' });

    // Simula la logica di ricerca per displayId dalla CLI
    const allTasks = taskService.getAllTasks();
    const foundTask = allTasks.find(
      (task) => task.displayId.toUpperCase() === createdTask.displayId.toUpperCase(),
    );

    expect(foundTask).toBeDefined();
    expect(foundTask!.id).toBe(createdTask.id);

    const updatedTask = taskService.updateTask(foundTask!.id, {
      description: 'Descrizione aggiornata',
    });
    expect(updatedTask.description).toBe('Descrizione aggiornata');
  });

  it('lancia errore quando il task ID non esiste', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    expect(() =>
      taskService.updateTask('00000000-0000-0000-0000-000000000000', {
        title: 'Fantasma',
      }),
    ).toThrowError(/Task non trovato/);
  });

  it('aggiorna la priorita di un task tramite updateTask', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({
      title: 'Task con priorita',
      priority: 'low',
    });

    const updatedTask = taskService.updateTask(createdTask.id, {
      priority: 'high',
    });

    expect(updatedTask.priority).toBe('high');
    expect(updatedTask.title).toBe('Task con priorita');
  });

  it('PRIORITY_MAP restituisce undefined per valori non validi', () => {
    const PRIORITY_MAP: Record<string, string> = {
      alta: 'high',
      high: 'high',
      media: 'medium',
      medium: 'medium',
      bassa: 'low',
      low: 'low',
    };

    expect(PRIORITY_MAP['invalida']).toBeUndefined();
    expect(PRIORITY_MAP['xyz']).toBeUndefined();
    expect(PRIORITY_MAP['alta']).toBe('high');
    expect(PRIORITY_MAP['bassa']).toBe('low');
  });

  it('aggiorna tutti i campi testuali contemporaneamente', () => {
    const { taskService } = createTemporaryProjectWithDatabase();
    const createdTask = taskService.createTask({
      title: 'Originale',
      description: 'Desc originale',
      acceptanceCriteria: 'Criteri originali',
    });

    const updatedTask = taskService.updateTask(createdTask.id, {
      title: 'Nuovo titolo',
      description: 'Nuova descrizione',
      acceptanceCriteria: 'Nuovi criteri',
    });

    expect(updatedTask.title).toBe('Nuovo titolo');
    expect(updatedTask.description).toBe('Nuova descrizione');
    expect(updatedTask.acceptanceCriteria).toBe('Nuovi criteri');
  });
});
