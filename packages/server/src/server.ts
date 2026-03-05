import path from 'node:path';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebSocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import {
  initializeDatabase,
  TaskService,
  ConfigService,
} from '@kanban-reloaded/core';
import type { DatabaseInitializationResult } from '@kanban-reloaded/core';
import { registerTaskRoutes } from './routes/taskRoutes.js';
import { WebSocketBroadcaster } from './websocket/websocketBroadcaster.js';
import { registerWebSocketRoute } from './websocket/websocketRoute.js';
import { AgentLauncher } from './agent/agentLauncher.js';

export interface ServerDependencies {
  projectDirectoryPath: string;
  staticFilesPath?: string;
}

export interface ServerInstance {
  server: FastifyInstance;
  closeConnection: () => void;
}

/**
 * Crea e configura l'istanza Fastify con tutte le route e i plugin.
 *
 * - Inizializza il database SQLite tramite @kanban-reloaded/core
 * - Registra CORS per lo sviluppo locale
 * - Serve i file statici della dashboard (se la directory dist esiste)
 * - Registra le route API per i task
 * - Catch-all per SPA routing (index.html)
 */
export async function createServer(
  dependencies: ServerDependencies,
): Promise<ServerInstance> {
  const { projectDirectoryPath, staticFilesPath } = dependencies;

  // Inizializza database e servizi
  const databaseResult: DatabaseInitializationResult =
    initializeDatabase(projectDirectoryPath);
  const taskService = new TaskService(databaseResult.database);

  // Carica la configurazione per ottenere il comando agent
  const configService = new ConfigService(projectDirectoryPath);
  const projectConfiguration = configService.loadConfiguration();

  // Crea istanza Fastify
  const server = Fastify({ logger: true });

  // CORS per dev mode (dashboard su porta diversa)
  await server.register(fastifyCors, { origin: true });

  // WebSocket plugin per la sincronizzazione real-time
  await server.register(fastifyWebSocket);

  // Broadcaster per inviare eventi a tutti i client WebSocket connessi
  const websocketBroadcaster = new WebSocketBroadcaster();

  // AgentLauncher per lanciare automaticamente gli agent quando un task va in "in-progress"
  const agentLauncher = new AgentLauncher(
    projectConfiguration.agentCommand,
    server.log,
  );
  agentLauncher.setTaskService(taskService);
  agentLauncher.setWebSocketBroadcaster(websocketBroadcaster);

  // Determina il percorso dei file statici della dashboard
  const resolvedStaticPath =
    staticFilesPath ??
    path.resolve(import.meta.dirname, '..', '..', 'dashboard', 'dist');

  // Registra static serving solo se la directory esiste
  try {
    await server.register(fastifyStatic, {
      root: resolvedStaticPath,
      prefix: '/',
      wildcard: false,
    });
  } catch {
    server.log.warn(
      `Directory statica non trovata: ${resolvedStaticPath}. La dashboard non sara servita.`,
    );
  }

  // Registra route WebSocket
  registerWebSocketRoute(server, websocketBroadcaster);

  // Registra route API
  registerTaskRoutes(server, taskService, websocketBroadcaster, agentLauncher);

  // Alla chiusura del server, ferma tutti i processi agent attivi
  server.addHook('onClose', async () => {
    agentLauncher.stopAllAgents();
  });

  // Catch-all per SPA routing: ogni GET non-API serve index.html
  server.setNotFoundHandler(async (request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      try {
        return reply.sendFile('index.html', resolvedStaticPath);
      } catch {
        return reply.status(404).send({ error: 'Dashboard non trovata' });
      }
    }
    return reply.status(404).send({ error: 'Route non trovata' });
  });

  return {
    server,
    closeConnection: databaseResult.closeConnection,
  };
}

/**
 * Avvia il server Fastify sulla porta e host specificati.
 */
export async function startServer(
  serverInstance: FastifyInstance,
  port: number,
): Promise<void> {
  await serverInstance.listen({ host: '127.0.0.1', port });
}
