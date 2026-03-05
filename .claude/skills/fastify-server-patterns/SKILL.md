---
name: fastify-server-patterns
description: >
  Patterns for the Kanban Reloaded API server using Fastify 5.x with REST routes,
  WebSocket real-time updates, and static file serving. Use this skill when working on
  packages/server/, creating or modifying REST API routes, implementing WebSocket
  handlers, configuring Fastify plugins, working on the agent launcher subprocess
  management, or debugging server-side issues. Also triggers for CORS configuration,
  request validation, error handling, and serving the dashboard as static files.
---

# Fastify Server Patterns

The `@kanban-reloaded/server` package provides the HTTP API and WebSocket server.
It imports business logic from `@kanban-reloaded/core` and exposes it over REST
and WebSocket for the dashboard and external agents.

## Technology Stack

- **Fastify** 5.x — Fast, low-overhead web framework
- **@fastify/websocket** 11.x — WebSocket support
- **@fastify/static** — Serve the built dashboard
- **@fastify/cors** — CORS for development
- **TypeBox** — JSON Schema-based request/response validation

## Server Setup

```typescript
// packages/server/src/index.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';

export async function createServer(options: ServerOptions) {
  const server = Fastify({ logger: true });

  await server.register(cors, { origin: true }); // Dev: allow all; prod: restrict
  await server.register(websocket);
  await server.register(staticPlugin, {
    root: dashboardDistPath,
    prefix: '/',
  });

  // Register route plugins
  await server.register(taskRoutes, { prefix: '/api' });
  await server.register(configRoutes, { prefix: '/api' });
  await server.register(websocketRoutes);

  return server;
}
```

### Binding: localhost only

The server MUST bind to `127.0.0.1` only — never `0.0.0.0`. This is a security
requirement from the PRD (NFR5). The tool is local-first and should not be
accessible from the network:

```typescript
await server.listen({ port, host: '127.0.0.1' });
```

### Auto-retry port

If the configured port is busy, try the next one:

```typescript
async function listenWithRetry(server: FastifyInstance, startPort: number, maxRetries = 10) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const port = startPort + attempt;
      await server.listen({ port, host: '127.0.0.1' });
      return port;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`No available port found after ${maxRetries} attempts starting from ${startPort}`);
}
```

## Routes as Plugins

Fastify's plugin system is its superpower — each route group is a self-contained
plugin that gets its own encapsulated scope:

```typescript
// packages/server/src/routes/taskRoutes.ts
import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';

const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/tasks
  fastify.get('/tasks', {
    schema: {
      querystring: Type.Object({
        status: Type.Optional(Type.String()),
      }),
      response: {
        200: Type.Array(TaskSchema),
      },
    },
  }, async (request, reply) => {
    const { status } = request.query;
    const tasks = taskService.listTasks(status);
    return tasks;
  });

  // POST /api/tasks
  fastify.post('/tasks', {
    schema: {
      body: CreateTaskSchema,
      response: { 201: TaskSchema },
    },
  }, async (request, reply) => {
    const task = taskService.createTask(request.body);
    broadcastWebSocketEvent('task:created', task);
    reply.code(201);
    return task;
  });

  // PATCH /api/tasks/:id
  fastify.patch('/tasks/:id', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      body: UpdateTaskSchema,
      response: { 200: TaskSchema },
    },
  }, async (request, reply) => {
    const task = taskService.updateTask(request.params.id, request.body);
    broadcastWebSocketEvent('task:updated', task);
    return task;
  });

  // DELETE /api/tasks/:id
  fastify.delete('/tasks/:id', async (request, reply) => {
    taskService.deleteTask(request.params.id);
    broadcastWebSocketEvent('task:deleted', { id: request.params.id });
    reply.code(204).send();
  });
};
```

## Request Validation with TypeBox

TypeBox generates JSON Schema at compile time and provides TypeScript types at
the same time — one definition serves both validation and typing:

```typescript
import { Type, Static } from '@sinclair/typebox';

const CreateTaskSchema = Type.Object({
  title: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  acceptanceCriteria: Type.Optional(Type.String()),
  priority: Type.Optional(Type.Union([
    Type.Literal('high'),
    Type.Literal('medium'),
    Type.Literal('low'),
  ])),
});

type CreateTaskInput = Static<typeof CreateTaskSchema>;
```

## WebSocket Real-Time Updates

Use a `Set<WebSocket>` to track connected clients. Every mutation (create, update,
delete, move) broadcasts an event to all clients:

```typescript
// packages/server/src/websocket/websocketHandler.ts
import { WebSocket } from 'ws';

const connectedClients = new Set<WebSocket>();

export function setupWebSocket(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket, request) => {
    connectedClients.add(socket);

    socket.on('close', () => {
      connectedClients.delete(socket);
    });

    socket.on('error', () => {
      connectedClients.delete(socket);
    });
  });
}

export function broadcastWebSocketEvent(type: string, payload: unknown) {
  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });

  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
```

WebSocket event format — all events follow this structure:
```json
{
  "type": "task:created" | "task:updated" | "task:deleted" | "task:moved" | "agent:started" | "agent:output" | "agent:completed",
  "payload": { ... },
  "timestamp": "2026-03-05T10:30:00.000Z"
}
```

## Agent Launcher

The agent launcher spawns AI agent processes when a task moves to "in-progress".
It uses `child_process.spawn` with strict input sanitization:

```typescript
import { spawn } from 'node:child_process';

export function launchAgent(commandTemplate: string, task: Task): ChildProcess {
  // Sanitize: only allow the task fields to be interpolated, never raw shell
  const sanitizedDescription = task.description
    .replace(/[`$(){}|;&<>]/g, '');  // Strip shell metacharacters

  const command = commandTemplate
    .replace('{{task_description}}', sanitizedDescription)
    .replace('{{task_title}}', task.title.replace(/[`$(){}|;&<>]/g, ''));

  // Split command safely — do NOT use shell: true
  const [executable, ...args] = command.split(/\s+/);

  return spawn(executable, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,  // NEVER use shell: true — prevents command injection
  });
}
```

Security is critical here: the command template comes from config and the task
description comes from user input. Always sanitize interpolated values and never
use `shell: true`.

## Error Handler

Centralized error handling as a Fastify plugin:

```typescript
fastify.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500;

  if (statusCode >= 500) {
    fastify.log.error(error);
  }

  reply.status(statusCode).send({
    error: error.name,
    message: error.message,
    statusCode,
  });
});

// Custom not-found handler
fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
    statusCode: 404,
  });
});
```

## Testing with inject()

Fastify's `inject()` method lets you test routes without starting the HTTP server:

```typescript
import { createServer } from '../src/index.js';

const server = await createServer(testOptions);

const response = await server.inject({
  method: 'POST',
  url: '/api/tasks',
  payload: { title: 'Test task' },
});

expect(response.statusCode).toBe(201);
expect(response.json().title).toBe('Test task');
```

This is faster and more reliable than making real HTTP requests in tests.
