import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, startServer } from './server.js';
import type { ServerInstance } from './server.js';

const temporaryDirectories: string[] = [];
const serverInstances: ServerInstance[] = [];
const netServersToClose: net.Server[] = [];

function createTemporaryProjectDirectory(): string {
  const projectDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kanban-start-server-test-'),
  );
  temporaryDirectories.push(projectDirectory);
  return projectDirectory;
}

/**
 * Occupa una porta TCP creando un server net in ascolto.
 * Restituisce il server creato (da chiudere in afterEach).
 */
function occupyPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const blockingServer = net.createServer();
    blockingServer.listen(port, '127.0.0.1', () => {
      netServersToClose.push(blockingServer);
      resolve(blockingServer);
    });
    blockingServer.on('error', reject);
  });
}

afterEach(async () => {
  // Chiudi tutti i server Fastify
  for (const instance of serverInstances) {
    try {
      await instance.server.close();
      instance.closeConnection();
    } catch {
      // Ignora errori di chiusura
    }
  }
  serverInstances.length = 0;

  // Chiudi tutti i server net di blocco
  for (const netServer of netServersToClose) {
    await new Promise<void>((resolve) => {
      netServer.close(() => resolve());
    });
  }
  netServersToClose.length = 0;

  // Pulisci directory temporanee
  for (const directoryPath of temporaryDirectories) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    } catch {
      // Ignora errori di pulizia (file lock su Windows)
    }
  }
  temporaryDirectories.length = 0;
});

describe('startServer', () => {
  it('restituisce la porta richiesta quando e disponibile', async () => {
    const projectDirectory = createTemporaryProjectDirectory();
    const instance = await createServer({
      projectDirectoryPath: projectDirectory,
    });
    serverInstances.push(instance);

    // Usa una porta alta per evitare conflitti
    const requestedPort = 49_100;
    const actualPort = await startServer(instance.server, requestedPort);

    expect(actualPort).toBe(requestedPort);
  });

  it('passa alla porta successiva se la porta richiesta e occupata', async () => {
    const requestedPort = 49_200;

    // Occupa la porta richiesta
    await occupyPort(requestedPort);

    const projectDirectory = createTemporaryProjectDirectory();
    const instance = await createServer({
      projectDirectoryPath: projectDirectory,
    });
    serverInstances.push(instance);

    const actualPort = await startServer(instance.server, requestedPort);

    expect(actualPort).toBe(requestedPort + 1);
  });

  it('salta piu porte occupate consecutive', async () => {
    const requestedPort = 49_300;

    // Occupa 3 porte consecutive
    await occupyPort(requestedPort);
    await occupyPort(requestedPort + 1);
    await occupyPort(requestedPort + 2);

    const projectDirectory = createTemporaryProjectDirectory();
    const instance = await createServer({
      projectDirectoryPath: projectDirectory,
    });
    serverInstances.push(instance);

    const actualPort = await startServer(instance.server, requestedPort);

    expect(actualPort).toBe(requestedPort + 3);
  });

  it('lancia errore dopo il numero massimo di tentativi', async () => {
    const requestedPort = 49_400;

    // Occupa 10 porte consecutive (il massimo dei tentativi)
    for (let offset = 0; offset < 10; offset++) {
      await occupyPort(requestedPort + offset);
    }

    const projectDirectory = createTemporaryProjectDirectory();
    const instance = await createServer({
      projectDirectoryPath: projectDirectory,
    });
    serverInstances.push(instance);

    await expect(
      startServer(instance.server, requestedPort),
    ).rejects.toThrow(
      `Impossibile trovare una porta disponibile tra ${requestedPort} e ${requestedPort + 9}`,
    );
  });
});
