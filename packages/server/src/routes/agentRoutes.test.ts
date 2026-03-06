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
    path.join(os.tmpdir(), 'kanban-agent-routes-test-'),
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

// ---------------------------------------------------------------------------
// Helper per creare un agente tramite POST e restituire il body parsed
// ---------------------------------------------------------------------------
async function createAgentViaApi(
  server: ServerInstance['server'],
  overrides: Record<string, unknown> = {},
) {
  const payload = {
    name: 'Claude Code',
    commandTemplate: 'claude --task "$TASK"',
    ...overrides,
  };
  const response = await server.inject({
    method: 'POST',
    url: '/api/agents',
    payload,
  });
  return { response, body: JSON.parse(response.payload) };
}

// ===========================================================================
// GET /api/agents
// ===========================================================================
describe('GET /api/agents', () => {
  it('restituisce una lista vuota quando non esistono agenti', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'GET',
      url: '/api/agents',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual([]);
  });

  it('restituisce la lista degli agenti creati', async () => {
    const { server } = await createTemporaryServerInstance();

    await createAgentViaApi(server, { name: 'Agent Alfa' });
    await createAgentViaApi(server, { name: 'Agent Beta' });

    const response = await server.inject({
      method: 'GET',
      url: '/api/agents',
    });

    expect(response.statusCode).toBe(200);
    const agents = JSON.parse(response.payload);
    expect(agents).toHaveLength(2);

    const names = agents.map((a: { name: string }) => a.name);
    expect(names).toContain('Agent Alfa');
    expect(names).toContain('Agent Beta');
  });
});

// ===========================================================================
// POST /api/agents
// ===========================================================================
describe('POST /api/agents', () => {
  it('crea un agente con dati validi e restituisce 201', async () => {
    const { server } = await createTemporaryServerInstance();

    const { response, body } = await createAgentViaApi(server);

    expect(response.statusCode).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.name).toBe('Claude Code');
    expect(body.commandTemplate).toBe('claude --task "$TASK"');
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeNull();
  });

  it('crea un agente con workingDirectory specificata', async () => {
    const { server } = await createTemporaryServerInstance();

    const { response, body } = await createAgentViaApi(server, {
      workingDirectory: '/home/user/project',
    });

    expect(response.statusCode).toBe(201);
    expect(body.workingDirectory).toBe('/home/user/project');
  });

  it('crea un agente con workingDirectory null', async () => {
    const { server } = await createTemporaryServerInstance();

    const { response, body } = await createAgentViaApi(server, {
      workingDirectory: null,
    });

    expect(response.statusCode).toBe(201);
    expect(body.workingDirectory).toBeNull();
  });

  it('restituisce 400 quando il nome e assente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/agents',
      payload: { commandTemplate: 'some-command' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('name');
  });

  it('restituisce 400 quando il nome e una stringa vuota', async () => {
    const { server } = await createTemporaryServerInstance();

    const { response, body } = await createAgentViaApi(server, { name: '' });

    expect(response.statusCode).toBe(400);
    expect(body.error).toContain('name');
  });

  it('restituisce 400 quando il nome contiene solo spazi', async () => {
    const { server } = await createTemporaryServerInstance();

    const { response, body } = await createAgentViaApi(server, {
      name: '   ',
    });

    expect(response.statusCode).toBe(400);
    expect(body.error).toContain('name');
  });

  it('restituisce 400 quando il commandTemplate e assente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'POST',
      url: '/api/agents',
      payload: { name: 'Test Agent' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('commandTemplate');
  });

  it('restituisce 400 quando il commandTemplate e una stringa vuota', async () => {
    const { server } = await createTemporaryServerInstance();

    const { response, body } = await createAgentViaApi(server, {
      commandTemplate: '',
    });

    expect(response.statusCode).toBe(400);
    expect(body.error).toContain('commandTemplate');
  });

  it('restituisce 409 quando il nome e duplicato', async () => {
    const { server } = await createTemporaryServerInstance();

    await createAgentViaApi(server, { name: 'Duplicato' });
    const { response, body } = await createAgentViaApi(server, {
      name: 'Duplicato',
    });

    expect(response.statusCode).toBe(409);
    expect(body.error).toContain('Esiste gia un agente con il nome');
  });

  it('effettua il trim degli spazi su nome e commandTemplate', async () => {
    const { server } = await createTemporaryServerInstance();

    const { response, body } = await createAgentViaApi(server, {
      name: '  Agent Trimmed  ',
      commandTemplate: '  some-command  ',
    });

    expect(response.statusCode).toBe(201);
    expect(body.name).toBe('Agent Trimmed');
    expect(body.commandTemplate).toBe('some-command');
  });
});

// ===========================================================================
// GET /api/agents/:agentId
// ===========================================================================
describe('GET /api/agents/:agentId', () => {
  it('restituisce un agente esistente con 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'GET',
      url: `/api/agents/${createdAgent.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.id).toBe(createdAgent.id);
    expect(body.name).toBe('Claude Code');
    expect(body.commandTemplate).toBe('claude --task "$TASK"');
  });

  it('restituisce 404 per un agente inesistente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'GET',
      url: '/api/agents/00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Agente non trovato');
  });
});

// ===========================================================================
// PATCH /api/agents/:agentId
// ===========================================================================
describe('PATCH /api/agents/:agentId', () => {
  it('aggiorna solo il nome e restituisce 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: { name: 'Nome Aggiornato' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.name).toBe('Nome Aggiornato');
    expect(body.commandTemplate).toBe('claude --task "$TASK"');
    expect(body.updatedAt).not.toBeNull();
  });

  it('aggiorna solo il commandTemplate e restituisce 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: { commandTemplate: 'new-command --verbose' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.commandTemplate).toBe('new-command --verbose');
    expect(body.name).toBe('Claude Code');
  });

  it('aggiorna piu campi contemporaneamente e restituisce 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: {
        name: 'Agente Rinominato',
        commandTemplate: 'altro-comando',
        workingDirectory: '/nuova/directory',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.name).toBe('Agente Rinominato');
    expect(body.commandTemplate).toBe('altro-comando');
    expect(body.workingDirectory).toBe('/nuova/directory');
  });

  it('aggiorna la workingDirectory a null', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server, {
      workingDirectory: '/vecchia/directory',
    });

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: { workingDirectory: null },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.workingDirectory).toBeNull();
  });

  it('restituisce 404 per un agente inesistente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/agents/00000000-0000-0000-0000-000000000000',
      payload: { name: 'Fantasma' },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Agente non trovato');
  });

  it('restituisce 409 quando il nuovo nome e gia in uso da un altro agente', async () => {
    const { server } = await createTemporaryServerInstance();

    await createAgentViaApi(server, { name: 'Nome Occupato' });
    const { body: secondAgent } = await createAgentViaApi(server, {
      name: 'Agente Due',
    });

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${secondAgent.id}`,
      payload: { name: 'Nome Occupato' },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Esiste gia un agente con il nome');
  });

  it('permette di aggiornare il nome mantenendolo uguale (stesso agente)', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server, {
      name: 'Nome Invariato',
    });

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: { name: 'Nome Invariato' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.name).toBe('Nome Invariato');
  });

  it('restituisce 400 quando il body non contiene alcun campo da aggiornare', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('almeno un campo');
  });

  it('restituisce 400 quando il nome e una stringa vuota', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('name');
  });

  it('restituisce 400 quando il commandTemplate e una stringa vuota', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${createdAgent.id}`,
      payload: { commandTemplate: '' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('commandTemplate');
  });
});

// ===========================================================================
// DELETE /api/agents/:agentId
// ===========================================================================
describe('DELETE /api/agents/:agentId', () => {
  it('elimina un agente esistente e restituisce 200 con i dati dell agente', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: createdAgent } = await createAgentViaApi(server);

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/agents/${createdAgent.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.id).toBe(createdAgent.id);
    expect(body.name).toBe('Claude Code');
  });

  it('restituisce 404 per un agente inesistente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'DELETE',
      url: '/api/agents/00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('Agente non trovato');
  });

  it('dopo la cancellazione GET /api/agents restituisce lista senza l agente eliminato', async () => {
    const { server } = await createTemporaryServerInstance();

    const { body: agentToDelete } = await createAgentViaApi(server, {
      name: 'Da Eliminare',
    });
    await createAgentViaApi(server, { name: 'Da Mantenere' });

    await server.inject({
      method: 'DELETE',
      url: `/api/agents/${agentToDelete.id}`,
    });

    const getResponse = await server.inject({
      method: 'GET',
      url: '/api/agents',
    });

    expect(getResponse.statusCode).toBe(200);
    const agents = JSON.parse(getResponse.payload);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Da Mantenere');
  });
});
