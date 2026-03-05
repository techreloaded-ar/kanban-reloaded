import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../server.js';
import type { ServerInstance } from '../server.js';

const temporaryDirectories: string[] = [];
let serverInstance: ServerInstance | null = null;

async function createTemporaryServerInstance(): Promise<ServerInstance> {
  const projectDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kanban-server-test-'),
  );
  temporaryDirectories.push(projectDirectory);

  const instance = await createServer({
    projectDirectoryPath: projectDirectory,
  });
  serverInstance = instance;
  return instance;
}

afterEach(() => {
  if (serverInstance) {
    serverInstance.closeConnection();
    serverInstance = null;
  }
  for (const directoryPath of temporaryDirectories) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    } catch {
      // Ignora errori di pulizia (file lock su Windows)
    }
  }
  temporaryDirectories.length = 0;
});

describe('POST /api/tasks', () => {
  it('crea un task con titolo valido e restituisce 201 con valori di default', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task di test' },
    });

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.payload);
    expect(body.id).toBeDefined();
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.displayId).toBe('TASK-001');
    expect(body.title).toBe('Task di test');
    expect(body.status).toBe('backlog');
    expect(body.priority).toBe('medium');
    expect(body.createdAt).toBeDefined();
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
  });

  it('restituisce 400 quando il body e assente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
  });

  it('restituisce 400 quando il titolo e una stringa vuota', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: '' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('restituisce 400 quando il titolo contiene solo spazi', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: '   ' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('restituisce 400 quando la priorita non e valida', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task valido', priority: 'urgente' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('urgente');
  });

  it('crea un task con tutti i campi opzionali specificati', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'Task completo',
        description: 'Descrizione dettagliata',
        acceptanceCriteria: 'Il task deve funzionare correttamente',
        priority: 'high',
      },
    });

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.payload);
    expect(body.title).toBe('Task completo');
    expect(body.description).toBe('Descrizione dettagliata');
    expect(body.acceptanceCriteria).toBe(
      'Il task deve funzionare correttamente',
    );
    expect(body.priority).toBe('high');
    expect(body.status).toBe('backlog');
  });

  it('il task creato e immediatamente visibile tramite GET /api/tasks', async () => {
    const { server } = await createTemporaryServerInstance();

    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task visibile' },
    });

    const getResponse = await server.inject({
      method: 'GET',
      url: '/api/tasks',
    });

    expect(getResponse.statusCode).toBe(200);
    const tasks = JSON.parse(getResponse.payload);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Task visibile');
    expect(tasks[0].displayId).toBe('TASK-001');
  });

  it('il task creato e visibile filtrando per status backlog', async () => {
    const { server } = await createTemporaryServerInstance();

    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task in backlog' },
    });

    const getResponse = await server.inject({
      method: 'GET',
      url: '/api/tasks?status=backlog',
    });

    expect(getResponse.statusCode).toBe(200);
    const tasks = JSON.parse(getResponse.payload);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Task in backlog');
    expect(tasks[0].status).toBe('backlog');
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('aggiorna il titolo di un task esistente e restituisce 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Titolo originale' },
    });
    const createdTask = JSON.parse(createResponse.payload);

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${createdTask.id}`,
      payload: { title: 'Titolo aggiornato' },
    });

    expect(patchResponse.statusCode).toBe(200);
    const updatedTask = JSON.parse(patchResponse.payload);
    expect(updatedTask.title).toBe('Titolo aggiornato');
    expect(updatedTask.updatedAt).not.toBeNull();
  });

  it('restituisce 404 per un task ID inesistente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/tasks/00000000-0000-0000-0000-000000000000',
      payload: { title: 'Fantasma' },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Task non trovato');
  });

  it('restituisce 400 quando il body non contiene alcun campo da aggiornare', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task esistente' },
    });
    const createdTask = JSON.parse(createResponse.payload);

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${createdTask.id}`,
      payload: {},
    });

    expect(patchResponse.statusCode).toBe(400);
    const body = JSON.parse(patchResponse.payload);
    expect(body.error).toBeDefined();
  });

  it('restituisce 400 quando il titolo e una stringa vuota', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task esistente' },
    });
    const createdTask = JSON.parse(createResponse.payload);

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${createdTask.id}`,
      payload: { title: '' },
    });

    expect(patchResponse.statusCode).toBe(400);
    const body = JSON.parse(patchResponse.payload);
    expect(body.error).toContain('title');
  });
});
