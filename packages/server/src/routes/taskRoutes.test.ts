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

describe('DELETE /api/tasks/:id', () => {
  it('elimina un task esistente e restituisce 200 con i dati del task', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task da eliminare' },
    });
    const createdTask = JSON.parse(createResponse.payload);

    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: `/api/tasks/${createdTask.id}`,
    });

    expect(deleteResponse.statusCode).toBe(200);
    const deletedTask = JSON.parse(deleteResponse.payload);
    expect(deletedTask.id).toBe(createdTask.id);
    expect(deletedTask.title).toBe('Task da eliminare');
  });

  it('restituisce 404 per un task ID inesistente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'DELETE',
      url: '/api/tasks/00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Task non trovato');
  });

  it('dopo la cancellazione GET /api/tasks restituisce array vuoto', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task temporaneo' },
    });
    const createdTask = JSON.parse(createResponse.payload);

    await server.inject({
      method: 'DELETE',
      url: `/api/tasks/${createdTask.id}`,
    });

    const getResponse = await server.inject({
      method: 'GET',
      url: '/api/tasks',
    });

    expect(getResponse.statusCode).toBe(200);
    const tasks = JSON.parse(getResponse.payload);
    expect(tasks).toHaveLength(0);
  });
});

describe('PUT /api/tasks/reorder', () => {
  it('riordina i task in una colonna e verifica il nuovo ordine tramite GET', async () => {
    const { server } = await createTemporaryServerInstance();

    // Crea 3 task
    const createResponse1 = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task Alfa' },
    });
    const task1 = JSON.parse(createResponse1.payload);

    const createResponse2 = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task Beta' },
    });
    const task2 = JSON.parse(createResponse2.payload);

    const createResponse3 = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task Gamma' },
    });
    const task3 = JSON.parse(createResponse3.payload);

    // Riordina: inverti l'ordine (3, 1, 2)
    const reorderResponse = await server.inject({
      method: 'PUT',
      url: '/api/tasks/reorder',
      payload: {
        taskIds: [task3.id, task1.id, task2.id],
        status: 'backlog',
      },
    });

    expect(reorderResponse.statusCode).toBe(200);
    const reorderBody = JSON.parse(reorderResponse.payload);
    expect(reorderBody.success).toBe(true);

    // Verifica il nuovo ordine tramite GET
    const getResponse = await server.inject({
      method: 'GET',
      url: '/api/tasks?status=backlog',
    });

    expect(getResponse.statusCode).toBe(200);
    const tasks = JSON.parse(getResponse.payload);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('Task Gamma');
    expect(tasks[1].title).toBe('Task Alfa');
    expect(tasks[2].title).toBe('Task Beta');
  });

  it('restituisce 400 per uno status non valido', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/tasks/reorder',
      payload: {
        taskIds: ['some-id'],
        status: 'archived',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('archived');
  });

  it('restituisce 400 per un array taskIds vuoto', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/tasks/reorder',
      payload: {
        taskIds: [],
        status: 'backlog',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
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

  it('aggiorna la priorita di un task esistente e restituisce 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task con priorita', priority: 'low' },
    });
    const createdTask = JSON.parse(createResponse.payload);
    expect(createdTask.priority).toBe('low');

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${createdTask.id}`,
      payload: { priority: 'high' },
    });

    expect(patchResponse.statusCode).toBe(200);
    const updatedTask = JSON.parse(patchResponse.payload);
    expect(updatedTask.priority).toBe('high');
    expect(updatedTask.title).toBe('Task con priorita');
  });

  it('restituisce 400 quando la priorita non e valida', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task per priorita invalida' },
    });
    const createdTask = JSON.parse(createResponse.payload);

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${createdTask.id}`,
      payload: { priority: 'urgente' },
    });

    expect(patchResponse.statusCode).toBe(400);
    const body = JSON.parse(patchResponse.payload);
    expect(body.error).toContain('urgente');
  });

  it('aggiorna lo status di un task esistente e restituisce 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task da spostare' },
    });
    const createdTask = JSON.parse(createResponse.payload);
    expect(createdTask.status).toBe('backlog');

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${createdTask.id}`,
      payload: { status: 'done' },
    });

    expect(patchResponse.statusCode).toBe(200);
    const updatedTask = JSON.parse(patchResponse.payload);
    expect(updatedTask.status).toBe('done');
    expect(updatedTask.title).toBe('Task da spostare');
  });

  it('restituisce 400 quando lo status non e valido', async () => {
    const { server } = await createTemporaryServerInstance();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Task per status invalido' },
    });
    const createdTask = JSON.parse(createResponse.payload);

    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${createdTask.id}`,
      payload: { status: 'archived' },
    });

    expect(patchResponse.statusCode).toBe(400);
    const body = JSON.parse(patchResponse.payload);
    expect(body.error).toContain('archived');
  });
});
