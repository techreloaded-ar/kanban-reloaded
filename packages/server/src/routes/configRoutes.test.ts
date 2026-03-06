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
    path.join(os.tmpdir(), 'kanban-config-test-'),
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

// ─────────────────────────────────────────────────
// GET /api/config
// ─────────────────────────────────────────────────

describe('GET /api/config', () => {
  it('restituisce la configurazione corrente con status 200', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'GET',
      url: '/api/config',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.payload);
    expect(body.agentCommand).toBeNull();
    expect(body.serverPort).toBe(3000);
    expect(body.columns).toBeInstanceOf(Array);
    expect(body.columns).toHaveLength(3);
    expect(body.workingDirectory).toBeNull();
    expect(body.agentEnvironmentVariables).toEqual({});
  });

  it('restituisce le colonne di default con id, name e color', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'GET',
      url: '/api/config',
    });

    const body = JSON.parse(response.payload);
    const columnIds = body.columns.map((col: { id: string }) => col.id);
    expect(columnIds).toEqual(['backlog', 'in-progress', 'done']);

    for (const column of body.columns) {
      expect(typeof column.id).toBe('string');
      expect(typeof column.name).toBe('string');
      expect(typeof column.color).toBe('string');
    }
  });

  it('maschera i valori delle variabili d ambiente nella risposta', async () => {
    const { server } = await createTemporaryServerInstance();

    // Prima salva delle env vars
    await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        agentEnvironmentVariables: {
          API_KEY: 'secret-value-123',
          DATABASE_URL: 'postgres://user:pass@host/db',
        },
      },
    });

    // Poi rileggi la configurazione
    const response = await server.inject({
      method: 'GET',
      url: '/api/config',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);

    // Le chiavi devono essere presenti, i valori mascherati
    expect(body.agentEnvironmentVariables).toHaveProperty('API_KEY');
    expect(body.agentEnvironmentVariables).toHaveProperty('DATABASE_URL');
    expect(body.agentEnvironmentVariables.API_KEY).toBe('****');
    expect(body.agentEnvironmentVariables.DATABASE_URL).toBe('****');
  });
});

// ─────────────────────────────────────────────────
// PUT /api/config — agentCommand
// ─────────────────────────────────────────────────

describe('PUT /api/config — agentCommand', () => {
  it('aggiorna agentCommand con una stringa valida', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentCommand: 'claude --dangerously-skip-permissions' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.agentCommand).toBe('claude --dangerously-skip-permissions');
  });

  it('aggiorna agentCommand a null per rimuoverlo', async () => {
    const { server } = await createTemporaryServerInstance();

    // Imposta un valore
    await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentCommand: 'some-command' },
    });

    // Rimuovilo con null
    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentCommand: null },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.agentCommand).toBeNull();
  });

  it('restituisce 400 quando agentCommand non e ne stringa ne null', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentCommand: 12345 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('agentCommand');
  });
});

// ─────────────────────────────────────────────────
// PUT /api/config — serverPort
// ─────────────────────────────────────────────────

describe('PUT /api/config — serverPort', () => {
  it('aggiorna serverPort con un numero positivo valido', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { serverPort: 8080 },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.serverPort).toBe(8080);
  });

  it('restituisce 400 quando serverPort e zero', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { serverPort: 0 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('serverPort');
  });

  it('restituisce 400 quando serverPort e negativo', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { serverPort: -1 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('serverPort');
  });

  it('restituisce 400 quando serverPort non e un numero', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { serverPort: 'not-a-number' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('serverPort');
  });
});

// ─────────────────────────────────────────────────
// PUT /api/config — columns
// ─────────────────────────────────────────────────

describe('PUT /api/config — columns', () => {
  it('aggiorna columns con un array di colonne valide', async () => {
    const { server } = await createTemporaryServerInstance();

    const newColumns = [
      { id: 'todo', name: 'To Do', color: '#FF0000' },
      { id: 'doing', name: 'Doing', color: '#00FF00' },
      { id: 'review', name: 'Review', color: '#0000FF' },
      { id: 'done', name: 'Done', color: '#2ECC71' },
    ];

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { columns: newColumns },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.columns).toHaveLength(4);
    expect(body.columns[0].id).toBe('todo');
    expect(body.columns[3].id).toBe('done');
  });

  it('accetta un array vuoto di colonne', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { columns: [] },
    });

    // L'array vuoto e tecnicamente valido — nessun elemento da validare
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.columns).toEqual([]);
  });

  it('restituisce 400 quando columns non e un array', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { columns: 'not-an-array' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('columns');
  });

  it('restituisce 400 quando un elemento di columns manca la proprieta id', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        columns: [{ name: 'Backlog', color: '#3498DB' }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('columns');
  });

  it('restituisce 400 quando un elemento di columns ha id non stringa', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        columns: [{ id: 123, name: 'Backlog', color: '#3498DB' }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('columns');
  });

  it('restituisce 400 quando un elemento di columns manca la proprieta name', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        columns: [{ id: 'backlog', color: '#3498DB' }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('columns');
  });

  it('restituisce 400 quando un elemento di columns manca la proprieta color', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        columns: [{ id: 'backlog', name: 'Backlog' }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('columns');
  });

  it('restituisce 400 indicando l indice dell elemento non valido', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        columns: [
          { id: 'backlog', name: 'Backlog', color: '#3498DB' },
          { id: 'bad-column' }, // manca name e color
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    // L'errore deve indicare l'indice 1 (il secondo elemento)
    expect(body.error).toContain('1');
  });
});

// ─────────────────────────────────────────────────
// PUT /api/config — agentEnvironmentVariables
// ─────────────────────────────────────────────────

describe('PUT /api/config — agentEnvironmentVariables', () => {
  it('aggiorna le variabili d ambiente con valori stringa validi', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        agentEnvironmentVariables: {
          NODE_ENV: 'production',
          API_KEY: 'abc-123',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    // I valori nella risposta devono essere mascherati
    expect(body.agentEnvironmentVariables.NODE_ENV).toBe('****');
    expect(body.agentEnvironmentVariables.API_KEY).toBe('****');
  });

  it('restituisce 400 quando un valore di env var non e una stringa', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        agentEnvironmentVariables: {
          VALID_KEY: 'valid-value',
          INVALID_KEY: 12345,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('INVALID_KEY');
  });

  it('restituisce 400 quando agentEnvironmentVariables e null', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentEnvironmentVariables: null },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('agentEnvironmentVariables');
  });

  it('restituisce 400 quando agentEnvironmentVariables e un array', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentEnvironmentVariables: ['VAR1', 'VAR2'] },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('agentEnvironmentVariables');
  });

  it('accetta un oggetto vuoto per agentEnvironmentVariables', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentEnvironmentVariables: {} },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.agentEnvironmentVariables).toEqual({});
  });
});

// ─────────────────────────────────────────────────
// PUT /api/config — workingDirectory
// ─────────────────────────────────────────────────

describe('PUT /api/config — workingDirectory', () => {
  it('aggiorna workingDirectory con una stringa valida', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { workingDirectory: '/home/user/projects' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.workingDirectory).toBe('/home/user/projects');
  });

  it('aggiorna workingDirectory a null per rimuoverlo', async () => {
    const { server } = await createTemporaryServerInstance();

    // Imposta un valore
    await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { workingDirectory: '/some/path' },
    });

    // Rimuovilo
    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { workingDirectory: null },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.workingDirectory).toBeNull();
  });

  it('restituisce 400 quando workingDirectory non e ne stringa ne null', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { workingDirectory: 42 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toContain('workingDirectory');
  });
});

// ─────────────────────────────────────────────────
// PUT /api/config — aggiornamento multi-campo e body invalidi
// ─────────────────────────────────────────────────

describe('PUT /api/config — aggiornamento multi-campo', () => {
  it('aggiorna piu campi contemporaneamente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        agentCommand: 'claude-agent run',
        serverPort: 4000,
        workingDirectory: '/workspace',
        columns: [
          { id: 'todo', name: 'To Do', color: '#FF0000' },
          { id: 'done', name: 'Done', color: '#00FF00' },
        ],
        agentEnvironmentVariables: {
          TOKEN: 'secret',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.agentCommand).toBe('claude-agent run');
    expect(body.serverPort).toBe(4000);
    expect(body.workingDirectory).toBe('/workspace');
    expect(body.columns).toHaveLength(2);
    expect(body.agentEnvironmentVariables.TOKEN).toBe('****');
  });

  it('l aggiornamento parziale preserva i campi non specificati', async () => {
    const { server } = await createTemporaryServerInstance();

    // Imposta agentCommand
    await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { agentCommand: 'my-agent' },
    });

    // Aggiorna solo serverPort — agentCommand deve restare invariato
    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { serverPort: 5000 },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.serverPort).toBe(5000);
    expect(body.agentCommand).toBe('my-agent');
  });
});

describe('PUT /api/config — body invalidi', () => {
  it('restituisce 400 quando il body e null', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { 'content-type': 'application/json' },
      payload: 'null',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('restituisce 400 quando il body e un array', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: [{ agentCommand: 'test' }],
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBeDefined();
  });

  it('accetta un body vuoto senza errore (nessun campo da aggiornare)', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {},
    });

    // Un oggetto vuoto e valido — semplicemente non aggiorna nulla
    expect(response.statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────
// PUT /api/config — persistenza e coerenza con GET
// ─────────────────────────────────────────────────

describe('PUT /api/config — persistenza', () => {
  it('i valori aggiornati tramite PUT sono visibili nella successiva GET', async () => {
    const { server } = await createTemporaryServerInstance();

    await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        agentCommand: 'persistent-command',
        serverPort: 9090,
      },
    });

    const getResponse = await server.inject({
      method: 'GET',
      url: '/api/config',
    });

    expect(getResponse.statusCode).toBe(200);
    const body = JSON.parse(getResponse.payload);
    expect(body.agentCommand).toBe('persistent-command');
    expect(body.serverPort).toBe(9090);
  });

  it('la risposta PUT maschera le variabili d ambiente', async () => {
    const { server } = await createTemporaryServerInstance();

    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        agentEnvironmentVariables: { SECRET: 'super-secret' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.agentEnvironmentVariables.SECRET).toBe('****');
  });
});
