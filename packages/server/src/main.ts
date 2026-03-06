/**
 * Entry point standalone del server Kanban Reloaded.
 *
 * Questo modulo replica la logica di bootstrap che era integrata nella CLI
 * (packages/cli/src/index.ts, comando "serve"), ma senza dipendere da
 * Commander.js né da @kanban-reloaded/cli.
 *
 * Pensato per essere eseguito con tsx durante lo sviluppo:
 *   tsx watch src/main.ts
 *
 * Supporta:
 *   - Variabile d'ambiente PORT per override della porta
 *   - Argomento CLI --port <numero> (tramite node:util parseArgs)
 */

import { parseArgs } from 'node:util';
import {
  discoverProjectDirectory,
  initializeDatabase,
  ConfigService,
} from '@kanban-reloaded/core';
import { createServer, startServer } from './server.js';

// --- Parsing argomenti CLI ---

const { values: commandLineArguments } = parseArgs({
  options: {
    port: {
      type: 'string',
      short: 'p',
    },
  },
  strict: false,
});

// --- Bootstrap del server ---

async function bootstrapServer(): Promise<void> {
  // Determina la directory del progetto
  const projectDirectoryPath = discoverProjectDirectory() ?? process.cwd();

  // Apriamo il database temporaneamente solo per leggere la porta configurata;
  // createServer() inizializzera il proprio database internamente.
  const temporaryDatabaseResult = initializeDatabase(projectDirectoryPath);
  const configService = new ConfigService(
    temporaryDatabaseResult.database,
    projectDirectoryPath,
  );
  configService.seedFromConfigFile();
  const configuration = configService.loadConfiguration();
  temporaryDatabaseResult.closeConnection();

  // Priorita porta: argomento CLI > variabile d'ambiente > configurazione DB
  const portArgument = typeof commandLineArguments.port === 'string'
    ? commandLineArguments.port
    : undefined;
  const rawPort = portArgument ?? process.env['PORT'] ?? undefined;
  const port = rawPort !== undefined ? parseInt(rawPort, 10) : configuration.serverPort;

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.error(`Porta non valida: ${rawPort}`);
    process.exit(1);
  }

  const { server, closeConnection } = await createServer({
    projectDirectoryPath,
  });

  // --- Gestione chiusura pulita ---
  // Su Windows, la chiusura del terminale non invia SIGTERM — il processo viene
  // ucciso senza preavviso. Per questo usiamo anche l'evento 'exit' (sincrono)
  // come ultima risorsa per chiudere almeno la connessione al database.
  let shutdownInProgress = false;

  const handleGracefulShutdown = async (): Promise<void> => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    console.log('\nChiusura in corso...');

    // Timeout di sicurezza: se server.close() non si completa in 3 secondi,
    // forza l'uscita per evitare processi zombie.
    const forceExitTimeout = setTimeout(() => {
      console.error('Timeout di chiusura raggiunto, uscita forzata.');
      closeConnection();
      process.exit(1);
    }, 3000);
    forceExitTimeout.unref(); // Non deve impedire l'uscita del processo

    try {
      await server.close();
    } catch {
      // Ignora errori durante la chiusura
    }
    clearTimeout(forceExitTimeout);
    closeConnection();
    process.exit(0);
  };

  // Ctrl+C e segnali di terminazione
  process.on('SIGINT', () => void handleGracefulShutdown());
  process.on('SIGTERM', () => void handleGracefulShutdown());

  // Ultima risorsa: chiudi almeno il database quando il processo sta uscendo.
  // L'evento 'exit' e sincrono, quindi possiamo solo fare operazioni sincrone
  // (better-sqlite3 close() e sincrono, server.close() no — ma a questo punto
  // il socket viene rilasciato comunque dal sistema operativo).
  process.on('exit', () => {
    try {
      closeConnection();
    } catch {
      // Ignora — potrebbe essere gia chiusa
    }
  });

  const actualPort = await startServer(server, port);
  console.log(`Dashboard disponibile su http://127.0.0.1:${actualPort}`);
  if (actualPort !== port) {
    console.log(
      `Nota: la porta ${port} era occupata, il server e stato avviato sulla porta ${actualPort}`,
    );
  }
}

bootstrapServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Errore nell'avvio del server: ${message}`);
  process.exit(1);
});
