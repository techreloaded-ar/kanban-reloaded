import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Task, TaskService, AgentConfiguration } from '@kanban-reloaded/core';
import type { WebSocketBroadcaster, WebSocketEventPayload } from '../websocket/websocketBroadcaster.js';

/**
 * Risultato del tentativo di lancio di un agent per un task.
 *
 * - `launched: true` indica che il processo agent e stato avviato con successo.
 * - `launched: false` indica che il lancio non e avvenuto, con il motivo specifico.
 */
export type AgentLaunchResult =
  | { launched: true; processId: number }
  | { launched: false; reason: string };

/**
 * Logger minimo richiesto dall'AgentLauncher.
 * Compatibile con il logger di Fastify.
 */
export interface AgentLauncherLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Caratteri pericolosi per l'iniezione di comandi shell.
 * Vengono rimossi da qualsiasi campo del task prima dell'interpolazione nel comando.
 */
const SHELL_METACHARACTERS_PATTERN = /[`$(){}|;&<>\n\r"']/g;

/**
 * Sanitizza un valore stringa rimuovendo i metacaratteri shell pericolosi.
 * Previene attacchi di command injection quando i campi del task vengono
 * interpolati nel template del comando agent.
 */
export function sanitizeShellValue(unsafeValue: string): string {
  return unsafeValue.replace(SHELL_METACHARACTERS_PATTERN, '');
}

/**
 * Gestisce il ciclo di vita dei processi agent AI associati ai task.
 *
 * Quando un task viene spostato in "in-progress", questa classe avvia il
 * comando agent configurato come sottoprocesso, traccia i processi attivi,
 * e gestisce la terminazione (volontaria o forzata).
 *
 * Responsabilita:
 * - Avviare processi agent con il comando dal config
 * - Sanitizzare i campi del task prima dell'interpolazione nel comando
 * - Tracciare i processi attivi in una Map<taskId, ChildProcess>
 * - Aggiornare il task (agentRunning, agentLog, executionTime) al termine
 * - Trasmettere eventi WebSocket per agent:started, agent:output, agent:completed
 * - Terminare i processi su richiesta (SIGTERM)
 */
export class AgentLauncher {
  private readonly defaultAgentCommand: string | null;
  private readonly agentConfigurationMap: AgentConfiguration;
  private readonly logger: AgentLauncherLogger;
  private readonly activeAgentProcesses: Map<string, ChildProcess> = new Map();
  private readonly agentStartTimestamps: Map<string, number> = new Map();

  /**
   * Dipendenze iniettate dopo la costruzione, poiche il server le crea
   * in momenti diversi del ciclo di vita.
   */
  private taskService: TaskService | null = null;
  private websocketBroadcaster: WebSocketBroadcaster | null = null;

  constructor(
    defaultAgentCommand: string | null,
    logger: AgentLauncherLogger,
    agentConfigurationMap: AgentConfiguration = {},
  ) {
    this.defaultAgentCommand = defaultAgentCommand;
    this.agentConfigurationMap = agentConfigurationMap;
    this.logger = logger;
  }

  /**
   * Imposta il TaskService per permettere all'AgentLauncher di aggiornare
   * i task quando il processo agent termina.
   */
  setTaskService(taskService: TaskService): void {
    this.taskService = taskService;
  }

  /**
   * Imposta il WebSocketBroadcaster per permettere all'AgentLauncher di
   * trasmettere eventi in tempo reale ai client connessi.
   */
  setWebSocketBroadcaster(websocketBroadcaster: WebSocketBroadcaster): void {
    this.websocketBroadcaster = websocketBroadcaster;
  }

  /**
   * Tenta di lanciare un processo agent per il task specificato.
   *
   * Il comando viene costruito sostituendo i placeholder {{title}},
   * {{description}} e {{acceptanceCriteria}} con i valori sanitizzati
   * del task.
   *
   * Se nessun comando agent e configurato, restituisce un risultato
   * con `launched: false` e il motivo.
   *
   * SICUREZZA: spawn viene invocato con `shell: false` e i valori
   * del task vengono sanitizzati per prevenire command injection.
   */
  launchForTask(task: Task): AgentLaunchResult {
    // Risolvi il comando agent: usa quello specifico del task se disponibile,
    // altrimenti usa il comando di default (AC-3: log warning se agent non trovato)
    const resolvedAgentCommand = this.resolveAgentCommand(task);

    if (!resolvedAgentCommand || resolvedAgentCommand.trim().length === 0) {
      this.logger.info(
        `Nessun agent configurato per il task ${task.displayId}. Il task procede senza agent.`,
      );
      return { launched: false, reason: 'Nessun agent configurato' };
    }

    // Se c'e gia un agent in esecuzione per questo task, non lanciarne un altro
    if (this.activeAgentProcesses.has(task.id)) {
      this.logger.warn(
        `Agent gia in esecuzione per il task ${task.displayId} (${task.id}). Lancio ignorato.`,
      );
      return { launched: false, reason: 'Agent gia in esecuzione per questo task' };
    }

    // Interpola i placeholder nel comando con valori sanitizzati
    const interpolatedCommand = this.interpolateCommandTemplate(
      resolvedAgentCommand,
      task,
    );

    // Esegui il comando con shell: false per sicurezza.
    // Splittiamo il comando in eseguibile + argomenti.
    const commandParts = this.parseCommandIntoParts(interpolatedCommand);
    if (commandParts.length === 0) {
      this.logger.error(
        `Comando agent vuoto dopo l'interpolazione per il task ${task.displayId}.`,
      );
      return { launched: false, reason: 'Comando agent vuoto dopo interpolazione' };
    }

    const [executable, ...commandArguments] = commandParts;

    try {
      const childProcess = spawn(executable, commandArguments, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      if (childProcess.pid === undefined) {
        this.logger.error(
          `Impossibile avviare il processo agent per il task ${task.displayId}. Il processo non ha ricevuto un PID.`,
        );
        return { launched: false, reason: 'Impossibile avviare il processo agent' };
      }

      this.activeAgentProcesses.set(task.id, childProcess);
      this.agentStartTimestamps.set(task.id, Date.now());

      this.logger.info(
        `Agent avviato per il task ${task.displayId} (PID: ${childProcess.pid}). Comando: ${executable}`,
      );

      // Broadcast evento agent:started
      this.broadcastAgentEvent({
        type: 'agent:started',
        payload: {
          taskId: task.id,
          displayId: task.displayId,
          processId: childProcess.pid,
        },
      });

      // Gestisci output stdout
      this.setupOutputStreaming(childProcess, task);

      // Gestisci terminazione del processo
      this.setupProcessExitHandler(childProcess, task);

      // Gestisci errore di spawn (comando non trovato, permessi, ecc.)
      childProcess.on('error', (spawnError: Error) => {
        this.logger.error(
          `Errore del processo agent per il task ${task.displayId}: ${spawnError.message}`,
        );
        this.updateTaskOnAgentCompletion(task.id, 1, `Errore: ${spawnError.message}`);
        this.cleanupAgentProcess(task.id);
        this.broadcastAgentEvent({
          type: 'agent:completed',
          payload: {
            taskId: task.id,
            displayId: task.displayId,
            exitCode: 1,
            success: false,
            errorMessage: spawnError.message,
          },
        });
      });

      return { launched: true, processId: childProcess.pid };
    } catch (spawnError: unknown) {
      const errorMessage =
        spawnError instanceof Error
          ? spawnError.message
          : 'Errore sconosciuto durante il lancio del processo agent';
      this.logger.error(
        `Errore durante il lancio dell'agent per il task ${task.displayId}: ${errorMessage}`,
      );
      return { launched: false, reason: errorMessage };
    }
  }

  /**
   * Verifica se un agent e attualmente in esecuzione per il task specificato.
   */
  isAgentRunning(taskId: string): boolean {
    return this.activeAgentProcesses.has(taskId);
  }

  /**
   * Ferma il processo agent per il task specificato inviando SIGTERM.
   * Restituisce true se il segnale e stato inviato con successo.
   */
  stopAgent(taskId: string): boolean {
    const agentProcess = this.activeAgentProcesses.get(taskId);
    if (!agentProcess) {
      this.logger.warn(
        `Tentativo di fermare un agent non in esecuzione per il task ${taskId}.`,
      );
      return false;
    }

    try {
      agentProcess.kill('SIGTERM');
      this.logger.info(
        `Segnale SIGTERM inviato al processo agent per il task ${taskId} (PID: ${agentProcess.pid}).`,
      );
      return true;
    } catch (killError: unknown) {
      const errorMessage =
        killError instanceof Error
          ? killError.message
          : 'Errore sconosciuto durante la terminazione';
      this.logger.error(
        `Errore durante l'invio di SIGTERM al processo agent per il task ${taskId}: ${errorMessage}`,
      );
      this.cleanupAgentProcess(taskId);
      return false;
    }
  }

  /**
   * Restituisce il numero di processi agent attualmente in esecuzione.
   */
  getActiveAgentCount(): number {
    return this.activeAgentProcesses.size;
  }

  /**
   * Termina tutti i processi agent attivi. Utile durante lo shutdown del server.
   */
  stopAllAgents(): void {
    const activeTaskIds = [...this.activeAgentProcesses.keys()];
    for (const taskId of activeTaskIds) {
      this.stopAgent(taskId);
    }
  }

  /**
   * Risolve il comando agent da usare per un task.
   *
   * Logica di risoluzione (US-016):
   * 1. Se il task ha un campo `agent` specificato, cerca nella mappa `agents` del config
   * 2. Se il nome agent non corrisponde a nessuna configurazione, usa il comando di default
   *    e logga un warning (AC-3)
   * 3. Se il task non ha un campo `agent`, usa il comando di default
   */
  private resolveAgentCommand(task: Task): string | null {
    if (task.agent) {
      const agentSpecificCommand = this.agentConfigurationMap[task.agent];
      if (agentSpecificCommand) {
        this.logger.info(
          `Task ${task.displayId}: uso agent '${task.agent}' con comando specifico dalla configurazione.`,
        );
        return agentSpecificCommand;
      }

      // AC-3: agent specificato ma non trovato nella configurazione -> warning + fallback al default
      this.logger.warn(
        `Task ${task.displayId}: agent '${task.agent}' non trovato nella configurazione agents. ` +
        `Uso del comando agent di default.`,
      );
    }

    return this.defaultAgentCommand;
  }

  /**
   * Sostituisce i placeholder nel template del comando con i valori sanitizzati del task.
   *
   * Placeholder supportati:
   * - {{title}} -> task.title (sanitizzato)
   * - {{description}} -> task.description (sanitizzato)
   * - {{acceptanceCriteria}} -> task.acceptanceCriteria (sanitizzato)
   */
  private interpolateCommandTemplate(
    commandTemplate: string,
    task: Task,
  ): string {
    const sanitizedTitle = sanitizeShellValue(task.title);
    const sanitizedDescription = sanitizeShellValue(task.description);
    const sanitizedAcceptanceCriteria = sanitizeShellValue(
      task.acceptanceCriteria,
    );

    return commandTemplate
      .replace(/\{\{title\}\}/g, sanitizedTitle)
      .replace(/\{\{description\}\}/g, sanitizedDescription)
      .replace(/\{\{acceptanceCriteria\}\}/g, sanitizedAcceptanceCriteria)
      .replace(/\{\{acceptance_criteria\}\}/g, sanitizedAcceptanceCriteria);
  }

  /**
   * Splitta una stringa di comando in un array di parti (eseguibile + argomenti).
   * Gestisce le virgolette per argomenti che contengono spazi.
   */
  private parseCommandIntoParts(command: string): string[] {
    const parts: string[] = [];
    let currentPart = '';
    let insideQuotes = false;
    let quoteCharacter = '';

    for (const character of command) {
      if (insideQuotes) {
        if (character === quoteCharacter) {
          insideQuotes = false;
        } else {
          currentPart += character;
        }
      } else if (character === '"' || character === "'") {
        insideQuotes = true;
        quoteCharacter = character;
      } else if (character === ' ' || character === '\t') {
        if (currentPart.length > 0) {
          parts.push(currentPart);
          currentPart = '';
        }
      } else {
        currentPart += character;
      }
    }

    if (currentPart.length > 0) {
      parts.push(currentPart);
    }

    return parts;
  }

  /**
   * Configura lo streaming dell'output (stdout e stderr) del processo agent.
   * Ogni chunk viene accumulato nell'agentLog del task e trasmesso via WebSocket.
   */
  private setupOutputStreaming(childProcess: ChildProcess, task: Task): void {
    let accumulatedOutput = '';

    const handleOutputChunk = (chunk: Buffer): void => {
      const textChunk = chunk.toString('utf-8');
      accumulatedOutput += textChunk;

      // Aggiorna l'agentLog nel database periodicamente
      this.updateTaskAgentLog(task.id, accumulatedOutput);

      // Broadcast l'output in tempo reale
      this.broadcastAgentEvent({
        type: 'agent:output',
        payload: {
          taskId: task.id,
          displayId: task.displayId,
          output: textChunk,
        },
      });
    };

    childProcess.stdout?.on('data', handleOutputChunk);
    childProcess.stderr?.on('data', handleOutputChunk);
  }

  /**
   * Configura il gestore per la terminazione del processo agent.
   * Aggiorna il task con il tempo di esecuzione e lo stato dell'agent.
   */
  private setupProcessExitHandler(
    childProcess: ChildProcess,
    task: Task,
  ): void {
    childProcess.on('close', (exitCode: number | null) => {
      const normalizedExitCode = exitCode ?? 1;
      const isSuccess = normalizedExitCode === 0;

      this.logger.info(
        `Agent per il task ${task.displayId} terminato con codice ${normalizedExitCode} (${isSuccess ? 'successo' : 'errore'}).`,
      );

      this.updateTaskOnAgentCompletion(task.id, normalizedExitCode);
      this.cleanupAgentProcess(task.id);

      this.broadcastAgentEvent({
        type: 'agent:completed',
        payload: {
          taskId: task.id,
          displayId: task.displayId,
          exitCode: normalizedExitCode,
          success: isSuccess,
        },
      });
    });
  }

  /**
   * Rimuove il processo agent dalla mappa dei processi attivi
   * e il timestamp di avvio.
   */
  private cleanupAgentProcess(taskId: string): void {
    this.activeAgentProcesses.delete(taskId);
    this.agentStartTimestamps.delete(taskId);
  }

  /**
   * Aggiorna il task nel database quando il processo agent termina.
   * Imposta agentRunning a false e calcola il tempo di esecuzione.
   * Se l'exit code e 0, sposta il task a "done".
   */
  private updateTaskOnAgentCompletion(
    taskId: string,
    exitCode: number,
    errorMessage?: string,
  ): void {
    if (!this.taskService) {
      this.logger.warn(
        `TaskService non disponibile. Impossibile aggiornare il task ${taskId} al termine dell'agent.`,
      );
      return;
    }

    try {
      const startTimestamp = this.agentStartTimestamps.get(taskId);
      const executionTimeMilliseconds = startTimestamp
        ? Date.now() - startTimestamp
        : null;

      const updatePayload: {
        agentRunning: boolean;
        executionTime?: number | null;
        agentLog?: string | null;
        status?: 'done';
      } = {
        agentRunning: false,
        executionTime: executionTimeMilliseconds,
      };

      if (errorMessage) {
        updatePayload.agentLog = errorMessage;
      }

      // Se l'exit code e 0, sposta il task a "done"
      if (exitCode === 0) {
        updatePayload.status = 'done';
      }

      this.taskService.updateTask(taskId, updatePayload);
    } catch (updateError: unknown) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : 'Errore sconosciuto';
      this.logger.error(
        `Errore durante l'aggiornamento del task ${taskId} al termine dell'agent: ${message}`,
      );
    }
  }

  /**
   * Aggiorna il campo agentLog del task nel database.
   */
  private updateTaskAgentLog(taskId: string, logContent: string): void {
    if (!this.taskService) {
      return;
    }

    try {
      this.taskService.updateTask(taskId, { agentLog: logContent });
    } catch {
      // Errori di log non devono interrompere lo streaming
    }
  }

  /**
   * Invia un evento agent tramite il WebSocketBroadcaster.
   * Utilizza il metodo broadcastEvent che supporta nativamente gli eventi agent.
   */
  private broadcastAgentEvent(event: WebSocketEventPayload): void {
    if (!this.websocketBroadcaster) {
      return;
    }

    this.websocketBroadcaster.broadcastEvent(event);
  }
}
