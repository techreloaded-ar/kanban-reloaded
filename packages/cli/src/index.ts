#!/usr/bin/env node

import { Command } from 'commander';
import {
  discoverProjectDirectory,
  initializeDatabase,
  ConfigService,
  TaskService,
} from '@kanban-reloaded/core';
import type { TaskPriority, UpdateTaskInput } from '@kanban-reloaded/core';
import { createServer, startServer } from '@kanban-reloaded/server';

const PRIORITY_MAP: Record<string, TaskPriority> = {
  alta: 'high',
  high: 'high',
  media: 'medium',
  medium: 'medium',
  bassa: 'low',
  low: 'low',
};

const program = new Command();

program
  .name('kanban-reloaded')
  .description('CLI per la gestione della board Kanban Reloaded')
  .version('0.1.0');

program
  .command('add')
  .description('Crea un nuovo task nella board Kanban')
  .argument('<title>', 'Titolo del task')
  .option('-d, --description <text>', 'Descrizione del task')
  .option('-a, --acceptance-criteria <text>', 'Criteri di accettazione')
  .option('-P, --priority <level>', 'Priorita: alta, media, bassa (o high, medium, low)', 'medium')
  .action(
    (
      title: string,
      options: {
        description?: string;
        acceptanceCriteria?: string;
        priority: string;
      },
    ) => {
      const projectDirectoryPath = discoverProjectDirectory();
      if (!projectDirectoryPath) {
        console.error(
          "Nessun progetto Kanban Reloaded trovato. Esegui il comando dalla root del repository o da una sotto-directory.",
        );
        process.exitCode = 1;
        return;
      }

      const priorityValue = PRIORITY_MAP[options.priority.toLowerCase()];
      if (!priorityValue) {
        console.error(
          `Priorita non valida: '${options.priority}'. Valori ammessi: alta, media, bassa (o high, medium, low)`,
        );
        process.exitCode = 2;
        return;
      }

      const { database, closeConnection } = initializeDatabase(projectDirectoryPath);
      try {
        const taskService = new TaskService(database);
        const createdTask = taskService.createTask({
          title,
          description: options.description,
          acceptanceCriteria: options.acceptanceCriteria,
          priority: priorityValue,
        });

        console.log(`Task creato: ${createdTask.displayId} — ${createdTask.title}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Errore nella creazione del task: ${message}`);
        process.exitCode = 1;
      } finally {
        closeConnection();
      }
    },
  );

program
  .command('edit')
  .description('Modifica un task esistente')
  .argument('<id>', 'ID del task (es. TASK-001 o UUID)')
  .option('-t, --title <text>', 'Nuovo titolo')
  .option('-d, --description <text>', 'Nuova descrizione')
  .option(
    '-a, --acceptance-criteria <text>',
    'Nuovi criteri di accettazione',
  )
  .action(
    (
      taskIdentifier: string,
      options: {
        title?: string;
        description?: string;
        acceptanceCriteria?: string;
      },
    ) => {
      if (options.title === undefined && options.description === undefined && options.acceptanceCriteria === undefined) {
        console.error(
          'Specifica almeno un campo da modificare (--title, --description, --acceptance-criteria)',
        );
        process.exitCode = 2;
        return;
      }

      const projectDirectoryPath = discoverProjectDirectory();
      if (!projectDirectoryPath) {
        console.error(
          'Nessun progetto Kanban Reloaded trovato. Esegui il comando dalla root del repository o da una sotto-directory.',
        );
        process.exitCode = 1;
        return;
      }

      const { database, closeConnection } = initializeDatabase(projectDirectoryPath);
      try {
        const taskService = new TaskService(database);

        // Cerca per displayId (TASK-xxx) o per UUID
        const isDisplayId = taskIdentifier.toUpperCase().startsWith('TASK-');
        const foundTask = isDisplayId
          ? taskService.getAllTasks().find(
              (task) => task.displayId.toUpperCase() === taskIdentifier.toUpperCase(),
            )
          : taskService.getTaskById(taskIdentifier);

        if (!foundTask) {
          console.error(
            `Task '${taskIdentifier}' non trovato. Usa 'kanban-reloaded list' per vedere i task disponibili.`,
          );
          process.exitCode = 1;
          return;
        }

        const fieldsToUpdate: UpdateTaskInput = {};
        if (options.title !== undefined) fieldsToUpdate.title = options.title;
        if (options.description !== undefined) fieldsToUpdate.description = options.description;
        if (options.acceptanceCriteria !== undefined) fieldsToUpdate.acceptanceCriteria = options.acceptanceCriteria;

        const updatedTask = taskService.updateTask(foundTask.id, fieldsToUpdate);
        console.log(`Task aggiornato: ${updatedTask.displayId} — ${updatedTask.title}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Errore nella modifica del task: ${message}`);
        process.exitCode = 1;
      } finally {
        closeConnection();
      }
    },
  );

program
  .command('delete')
  .description('Elimina un task dalla board Kanban')
  .argument('<id>', 'ID del task (es. TASK-001 o UUID)')
  .option('-f, --force', 'Forza la cancellazione anche se un agente e in esecuzione')
  .action(
    (
      taskIdentifier: string,
      options: {
        force?: boolean;
      },
    ) => {
      const projectDirectoryPath = discoverProjectDirectory();
      if (!projectDirectoryPath) {
        console.error(
          'Nessun progetto Kanban Reloaded trovato. Esegui il comando dalla root del repository o da una sotto-directory.',
        );
        process.exitCode = 1;
        return;
      }

      const { database, closeConnection } = initializeDatabase(projectDirectoryPath);
      try {
        const taskService = new TaskService(database);

        // Cerca per displayId (TASK-xxx) o per UUID
        const isDisplayId = taskIdentifier.toUpperCase().startsWith('TASK-');
        const foundTask = isDisplayId
          ? taskService.getTaskByDisplayId(taskIdentifier)
          : taskService.getTaskById(taskIdentifier);

        if (!foundTask) {
          console.error(
            `Task '${taskIdentifier}' non trovato. Usa 'kanban-reloaded list' per vedere i task disponibili.`,
          );
          process.exitCode = 1;
          return;
        }

        if (foundTask.agentRunning && !options.force) {
          console.error(
            `Il task ${foundTask.displayId} ha un agente in esecuzione. Usa --force per forzare la cancellazione.`,
          );
          process.exitCode = 2;
          return;
        }

        taskService.deleteTask(foundTask.id);
        console.log(`Task eliminato: ${foundTask.displayId} — ${foundTask.title}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Errore nella cancellazione del task: ${message}`);
        process.exitCode = 1;
      } finally {
        closeConnection();
      }
    },
  );

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
