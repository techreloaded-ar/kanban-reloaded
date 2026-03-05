#!/usr/bin/env node

import { Command } from 'commander';
import {
  discoverProjectDirectory,
  ConfigService,
} from '@kanban-reloaded/core';
import { createServer, startServer } from '@kanban-reloaded/server';

const program = new Command();

program
  .name('kanban-reloaded')
  .description('CLI per la gestione della board Kanban Reloaded')
  .version('0.1.0');

program
  .command('serve')
  .description('Avvia il server della dashboard Kanban')
  .option('-p, --port <port>', 'Porta del server (default: da config o 3000)')
  .option(
    '-d, --directory <path>',
    'Directory del progetto (default: scoperta automatica)',
  )
  .action(async (options: { port?: string; directory?: string }) => {
    // Determina la directory del progetto
    const projectDirectoryPath =
      options.directory ?? discoverProjectDirectory() ?? process.cwd();

    // Carica la configurazione per la porta predefinita
    const configService = new ConfigService(projectDirectoryPath);
    const configuration = configService.loadConfiguration();

    const port = options.port
      ? parseInt(options.port, 10)
      : configuration.serverPort;

    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error(`Porta non valida: ${options.port}`);
      process.exit(1);
    }

    try {
      const { server, closeConnection } = await createServer({
        projectDirectoryPath,
      });

      // Gestione chiusura pulita con Ctrl+C
      const handleShutdown = async () => {
        console.log('\nChiusura in corso...');
        await server.close();
        closeConnection();
        process.exit(0);
      };

      process.on('SIGINT', () => void handleShutdown());
      process.on('SIGTERM', () => void handleShutdown());

      await startServer(server, port);
      console.log(
        `Dashboard disponibile su http://127.0.0.1:${port}`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`Errore nell'avvio del server: ${message}`);
      process.exit(1);
    }
  });

program.parse();
