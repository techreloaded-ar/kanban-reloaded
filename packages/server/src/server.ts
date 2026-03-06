import fs from 'node:fs';
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
import { registerConfigRoutes } from './routes/configRoutes.js';
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
    projectConfiguration.agents,
  );
  agentLauncher.setTaskService(taskService);
  agentLauncher.setWebSocketBroadcaster(websocketBroadcaster);

  // Determina il percorso dei file statici della dashboard
  const resolvedStaticPath =
    staticFilesPath ??
    path.resolve(import.meta.dirname, '..', '..', 'dashboard', 'dist');

  // Registra @fastify/static solo per il decorator reply.sendFile(),
  // senza registrare route automatiche (serve: false).
  // Questo evita conflitti nel radix tree di find-my-way tra le route
  // statiche e le route API parametriche nested (es. /api/tasks/:id/subtasks).
  try {
    await server.register(fastifyStatic, {
      root: resolvedStaticPath,
      serve: false,
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
  registerConfigRoutes(server, configService);

  // Alla chiusura del server, ferma tutti i processi agent attivi
  server.addHook('onClose', async () => {
    agentLauncher.stopAllAgents();
  });

  // Catch-all: serve file statici della dashboard e fallback SPA.
  // Con serve:false su @fastify/static, tutte le richieste non matchate
  // dalle route API finiscono qui.
  //
  // NOTA: reply.sendFile() per un file inesistente invia direttamente una
  // risposta 404 senza lanciare eccezione, quindi usiamo fs.existsSync()
  // per decidere se servire il file esatto o fare fallback a index.html.
  server.setNotFoundHandler(async (request, reply) => {
    // Solo le richieste GET non-API vengono servite come file statici
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      const urlPath = request.url.split('?')[0];
      const filePath = urlPath === '/' ? 'index.html' : urlPath.slice(1);
      const absoluteFilePath = path.join(resolvedStaticPath, filePath);

      // Se il file esiste nel filesystem, servilo direttamente
      if (fs.existsSync(absoluteFilePath) && fs.statSync(absoluteFilePath).isFile()) {
        return reply.sendFile(filePath, resolvedStaticPath);
      }

      // SPA fallback: qualsiasi route sconosciuta serve index.html
      // per permettere al router client-side di gestire la navigazione
      try {
        return await reply.sendFile('index.html', resolvedStaticPath);
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

const MAXIMUM_PORT_ATTEMPTS = 10;

/**
 * Avvia il server Fastify sulla porta e host specificati.
 *
 * Se la porta richiesta e occupata (EADDRINUSE), prova automaticamente
 * le porte successive fino a un massimo di MAXIMUM_PORT_ATTEMPTS tentativi.
 *
 * @returns La porta effettivamente utilizzata dal server.
 */
export async function startServer(
  serverInstance: FastifyInstance,
  port: number,
): Promise<number> {
  for (let attempt = 0; attempt < MAXIMUM_PORT_ATTEMPTS; attempt++) {
    const candidatePort = port + attempt;
    try {
      await serverInstance.listen({ host: '127.0.0.1', port: candidatePort });
      return candidatePort;
    } catch (error: unknown) {
      const isAddressInUse =
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'EADDRINUSE';

      if (isAddressInUse) {
        if (attempt < MAXIMUM_PORT_ATTEMPTS - 1) {
          serverInstance.log.warn(
            `Porta ${candidatePort} occupata, tentativo sulla porta ${candidatePort + 1}...`,
          );
        } else {
          serverInstance.log.warn(
            `Porta ${candidatePort} occupata, nessun altro tentativo disponibile.`,
          );
        }
        continue;
      }

      throw error;
    }
  }

  const lastAttemptedPort = port + MAXIMUM_PORT_ATTEMPTS - 1;
  throw new Error(
    `Impossibile trovare una porta disponibile tra ${port} e ${lastAttemptedPort}`,
  );
}
