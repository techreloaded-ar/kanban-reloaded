#!/usr/bin/env node

import { Command } from 'commander';
import {
  discoverProjectDirectory,
  initializeDatabase,
  ConfigService,
  TaskService,
} from '@kanban-reloaded/core';
import type { TaskPriority, TaskStatus, UpdateTaskInput } from '@kanban-reloaded/core';
import { createServer, startServer, AgentLauncher } from '@kanban-reloaded/server';
import type { AgentLauncherLogger } from '@kanban-reloaded/server';

const PRIORITY_MAP: Record<string, TaskPriority> = {
  alta: 'high',
  high: 'high',
  media: 'medium',
  medium: 'medium',
  bassa: 'low',
  low: 'low',
};

const STATUS_MAP: Record<string, TaskStatus> = {
  backlog: 'backlog',
  arretrato: 'backlog',
  'in-progress': 'in-progress',
  'in-corso': 'in-progress',
  done: 'done',
  completato: 'done',
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

const VALID_STATUSES: TaskStatus[] = ['backlog', 'in-progress', 'done'];

const STATUS_ITALIAN_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'In Progress',
  done: 'Done',
};

const PRIORITY_ITALIAN_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Bassa',
};

function truncateTitle(title: string, maximumLength: number): string {
  if (title.length <= maximumLength) return title;
  return title.slice(0, maximumLength - 3) + '...';
}

program
  .command('list')
  .description('Elenca i task della board Kanban')
  .option('-s, --status <status>', 'Filtra per stato: backlog, in-progress, done (o arretrato, in-corso, completato)')
  .action((options: { status?: string }) => {
    const statusFilter = options.status
      ? STATUS_MAP[options.status.toLowerCase()]
      : undefined;

    if (options.status && !statusFilter) {
      console.error(
        `Stato non valido: '${options.status}'. Valori ammessi: backlog, in-progress, done (o arretrato, in-corso, completato)`,
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
      const tasks = statusFilter
        ? taskService.getTasksByStatus(statusFilter)
        : taskService.getAllTasks();

      if (tasks.length === 0) {
        const emptyMessage = statusFilter
          ? `Nessun task trovato con stato '${statusFilter}'`
          : 'Nessun task trovato';
        console.log(emptyMessage);
        return;
      }

      // Column widths for aligned table output
      const columnWidthId = 10;
      const columnWidthTitle = 42;
      const columnWidthStatus = 14;
      const columnWidthPriority = 10;

      const headerLine = [
        'ID'.padEnd(columnWidthId),
        'Titolo'.padEnd(columnWidthTitle),
        'Stato'.padEnd(columnWidthStatus),
        'Priorita'.padEnd(columnWidthPriority),
      ].join('  ');

      const separatorLine = [
        '-'.repeat(columnWidthId),
        '-'.repeat(columnWidthTitle),
        '-'.repeat(columnWidthStatus),
        '-'.repeat(columnWidthPriority),
      ].join('  ');

      console.log(headerLine);
      console.log(separatorLine);

      for (const task of tasks) {
        const taskRow = [
          task.displayId.padEnd(columnWidthId),
          truncateTitle(task.title, columnWidthTitle).padEnd(columnWidthTitle),
          STATUS_ITALIAN_LABELS[task.status].padEnd(columnWidthStatus),
          PRIORITY_ITALIAN_LABELS[task.priority].padEnd(columnWidthPriority),
        ].join('  ');

        console.log(taskRow);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Errore nel recupero dei task: ${message}`);
      process.exitCode = 1;
    } finally {
      closeConnection();
    }
  });

program
  .command('move')
  .description('Sposta un task in un nuovo stato')
  .argument('<id>', 'ID del task (es. TASK-001 o UUID)')
  .argument('<status>', 'Nuovo stato: backlog, in-progress, done (o arretrato, in-corso, completato)')
  .action(
    (
      taskIdentifier: string,
      targetStatusInput: string,
    ) => {
      const resolvedStatus = STATUS_MAP[targetStatusInput.toLowerCase()];
      if (!resolvedStatus) {
        console.error(
          `Stato non valido: '${targetStatusInput}'. Valori ammessi: backlog, in-progress, done (o arretrato, in-corso, completato)`,
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
          ? taskService.getTaskByDisplayId(taskIdentifier)
          : taskService.getTaskById(taskIdentifier);

        if (!foundTask) {
          console.error(
            `Task '${taskIdentifier}' non trovato. Usa 'kanban-reloaded list' per vedere i task disponibili.`,
          );
          process.exitCode = 1;
          return;
        }

        // Aggiorna lo stato del task
        const updatedTask = taskService.updateTask(foundTask.id, {
          status: resolvedStatus,
        });

        const statusLabel = STATUS_ITALIAN_LABELS[resolvedStatus];
        console.log(
          `Task spostato: ${updatedTask.displayId} — ${updatedTask.title} → ${statusLabel}`,
        );

        // Se il nuovo stato e "in-progress", tenta di lanciare l'agent
        if (resolvedStatus === 'in-progress') {
          const configService = new ConfigService(database, projectDirectoryPath);

          const consoleLogger: AgentLauncherLogger = {
            info: (message: string) => console.log(message),
            warn: (message: string) => console.warn(message),
            error: (message: string) => console.error(message),
          };

          const agentLauncher = new AgentLauncher(
            configService,
            consoleLogger,
            projectDirectoryPath,
          );
          agentLauncher.setTaskService(taskService);

          const launchResult = agentLauncher.launchForTask(updatedTask);

          if (launchResult.launched) {
            taskService.updateTask(foundTask.id, { agentRunning: true });
            console.log(
              `Agent avviato per il task ${updatedTask.displayId} (PID: ${launchResult.processId})`,
            );
          } else {
            console.warn(
              `Nessun agent avviato: ${launchResult.reason}`,
            );
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Errore nello spostamento del task: ${message}`);
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
  .option(
    '-P, --priority <level>',
    'Nuova priorita: alta, media, bassa (o high, medium, low)',
  )
  .action(
    (
      taskIdentifier: string,
      options: {
        title?: string;
        description?: string;
        acceptanceCriteria?: string;
        priority?: string;
      },
    ) => {
      if (options.title === undefined && options.description === undefined && options.acceptanceCriteria === undefined && options.priority === undefined) {
        console.error(
          'Specifica almeno un campo da modificare (--title, --description, --acceptance-criteria, --priority)',
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
          ? taskService.getTaskByDisplayId(taskIdentifier)
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
        if (options.priority !== undefined) {
          const priorityValue = PRIORITY_MAP[options.priority.toLowerCase()];
          if (!priorityValue) {
            console.error(
              `Priorita non valida: '${options.priority}'. Valori ammessi: alta, media, bassa (o high, medium, low)`,
            );
            process.exitCode = 2;
            return;
          }
          fieldsToUpdate.priority = priorityValue;
        }

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

    // Carica la configurazione per la porta predefinita.
    // Apriamo il database temporaneamente solo per leggere la porta configurata;
    // createServer() inizializzera il proprio database internamente.
    const tempDatabaseResult = initializeDatabase(projectDirectoryPath);
    const configService = new ConfigService(tempDatabaseResult.database, projectDirectoryPath);
    configService.seedFromConfigFile();
    const configuration = configService.loadConfiguration();
    tempDatabaseResult.closeConnection();

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

      // Gestione chiusura pulita.
      // Su Windows, la chiusura del terminale non invia SIGTERM — il processo viene
      // ucciso senza preavviso. Per questo usiamo anche l'evento 'exit' (sincrono)
      // come ultima risorsa per chiudere almeno la connessione al database.
      let shutdownInProgress = false;

      const handleGracefulShutdown = async () => {
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
      console.log(
        `Dashboard disponibile su http://127.0.0.1:${actualPort}`,
      );
      if (actualPort !== port) {
        console.log(
          `Nota: la porta ${port} era occupata, il server e stato avviato sulla porta ${actualPort}`,
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`Errore nell'avvio del server: ${message}`);
      process.exit(1);
    }
  });

program.parse();
