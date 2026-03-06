import crypto from 'node:crypto';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../storage/database.js';
import { tasksTable, taskDependenciesTable, subtasksTable, agentsTable } from '../models/schema.js';
import type { Task, CreateTaskInput, UpdateTaskInput, TaskStatus, TaskDependency, Subtask, CreateSubtaskInput, UpdateSubtaskInput, SubtaskProgress } from '../models/types.js';

/** Riga grezza dalla tabella tasks (senza agentName denormalizzato) */
interface TaskRow {
  id: string;
  displayId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: 'high' | 'medium' | 'low';
  status: 'backlog' | 'in-progress' | 'done';
  agentRunning: boolean;
  agentLog: string | null;
  agentId: string | null;
  createdAt: string;
  updatedAt: string | null;
  executionTime: number | null;
  position: number;
}

/**
 * Servizio per la gestione delle task (CRUD).
 * Fornisce metodi per creare e interrogare i task nella board Kanban.
 */
export class TaskService {
  constructor(private readonly database: DatabaseInstance) {}

  /**
   * Arricchisce una riga task con il nome dell'agente (denormalizzato).
   * Se l'agentId e null o l'agente non esiste piu, agentName sara null.
   */
  private enrichTaskWithAgentName(row: TaskRow): Task {
    let agentName: string | null = null;
    if (row.agentId) {
      const agent = this.database
        .select({ name: agentsTable.name })
        .from(agentsTable)
        .where(eq(agentsTable.id, row.agentId))
        .get();
      agentName = agent?.name ?? null;
    }
    return { ...row, agentName };
  }

  /**
   * Arricchisce un array di righe task con i nomi degli agenti.
   * Usa un singolo fetch di tutti gli agenti per efficienza.
   */
  private enrichTasksWithAgentNames(rows: TaskRow[]): Task[] {
    // Raccogli tutti gli agentId unici non-null
    const agentIds = new Set<string>();
    for (const row of rows) {
      if (row.agentId) agentIds.add(row.agentId);
    }

    if (agentIds.size === 0) {
      return rows.map((row) => ({ ...row, agentName: null }));
    }

    // Fetch tutti gli agenti in un colpo solo
    const allAgents = this.database
      .select({ id: agentsTable.id, name: agentsTable.name })
      .from(agentsTable)
      .all();
    const agentNameMap = new Map(allAgents.map((agent) => [agent.id, agent.name]));

    return rows.map((row) => ({
      ...row,
      agentName: row.agentId ? (agentNameMap.get(row.agentId) ?? null) : null,
    }));
  }

  /**
   * Crea un nuovo task con valori di default per i campi opzionali.
   * Genera automaticamente un UUID come id e un displayId incrementale (TASK-001, TASK-002, ...).
   * Il task viene posizionato in fondo alla colonna di destinazione.
   *
   * @throws Error se il titolo e' vuoto dopo il trim
   */
  createTask(input: CreateTaskInput): Task {
    const sanitizedTitle = input.title.trim();
    if (sanitizedTitle.length === 0) {
      throw new Error('Il titolo del task non puo essere vuoto');
    }

    const sanitizedDescription = input.description?.trim() ?? '';
    const sanitizedAcceptanceCriteria = input.acceptanceCriteria?.trim() ?? '';
    const targetStatus: TaskStatus = input.status ?? 'backlog';
    const targetPriority = input.priority ?? 'medium';

    // Calcola il displayId incrementale basato sul MAX del numero estratto da display_id
    // Usa MAX invece di COUNT per evitare duplicati quando i task vengono cancellati
    const maxDisplayIdResult = this.database
      .select({ maxNumber: sql<number>`MAX(CAST(SUBSTR(${tasksTable.displayId}, 6) AS INTEGER))` })
      .from(tasksTable)
      .get();
    const nextDisplayNumber = (maxDisplayIdResult?.maxNumber ?? 0) + 1;
    const displayId = `TASK-${String(nextDisplayNumber).padStart(3, '0')}`;

    // Calcola la posizione come MAX(position) + 1 nella colonna di destinazione
    const maxPositionResult = this.database
      .select({ maxPosition: sql<number>`MAX(${tasksTable.position})` })
      .from(tasksTable)
      .where(eq(tasksTable.status, targetStatus))
      .get();
    const nextPosition = (maxPositionResult?.maxPosition ?? 0) + 1;

    const taskId = crypto.randomUUID();
    const agentId = input.agentId ?? null;

    this.database.insert(tasksTable).values({
      id: taskId,
      displayId,
      title: sanitizedTitle,
      description: sanitizedDescription,
      acceptanceCriteria: sanitizedAcceptanceCriteria,
      priority: targetPriority,
      status: targetStatus,
      agentRunning: false,
      agentLog: null,
      agentId,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      executionTime: null,
      position: input.position ?? nextPosition,
    }).run();

    return this.getTaskById(taskId) as Task;
  }

  /**
   * Restituisce tutti i task ordinati per posizione crescente.
   */
  getAllTasks(): Task[] {
    const rows = this.database
      .select()
      .from(tasksTable)
      .orderBy(tasksTable.position)
      .all() as TaskRow[];
    return this.enrichTasksWithAgentNames(rows);
  }

  /**
   * Restituisce i task filtrati per status, ordinati per posizione crescente.
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    const rows = this.database
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.status, status))
      .orderBy(tasksTable.position)
      .all() as TaskRow[];
    return this.enrichTasksWithAgentNames(rows);
  }

  /**
   * Cerca un task per UUID.
   * Ritorna undefined se il task non esiste.
   */
  getTaskById(taskId: string): Task | undefined {
    const row = this.database
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId))
      .get() as TaskRow | undefined;
    return row ? this.enrichTaskWithAgentName(row) : undefined;
  }

  /**
   * Aggiorna parzialmente un task esistente.
   * Solo i campi definiti (non undefined) in input vengono sovrascritti.
   * Il campo updatedAt viene impostato automaticamente all'istante corrente.
   *
   * @throws Error se il task non esiste
   */
  updateTask(taskId: string, input: UpdateTaskInput): Task {
    const existingTask = this.getTaskById(taskId);
    if (!existingTask) {
      throw new Error(`Task non trovato con ID: ${taskId}`);
    }

    const fieldsToUpdate: Partial<typeof tasksTable.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.title !== undefined) {
      const trimmedTitle = input.title.trim();
      if (trimmedTitle.length === 0) {
        throw new Error('Il titolo del task non puo essere vuoto');
      }
      fieldsToUpdate.title = trimmedTitle;
    }
    if (input.description !== undefined) fieldsToUpdate.description = input.description.trim();
    if (input.acceptanceCriteria !== undefined) fieldsToUpdate.acceptanceCriteria = input.acceptanceCriteria.trim();
    if (input.priority !== undefined) fieldsToUpdate.priority = input.priority;
    if (input.status !== undefined) {
      // Se il task viene spostato a "in-progress", verifica che non sia bloccato
      if (input.status === 'in-progress' && existingTask.status !== 'in-progress') {
        const uncompletedBlockers = this.getUncompletedBlockers(taskId);
        if (uncompletedBlockers.length > 0) {
          const blockersList = uncompletedBlockers
            .map((blocker) => `${blocker.displayId} - ${blocker.title}`)
            .join(', ');
          throw new Error(
            `Impossibile spostare il task in "In Progress": e bloccato dai seguenti task non completati: ${blockersList}`,
          );
        }
      }
      fieldsToUpdate.status = input.status;
    }
    if (input.agentRunning !== undefined) fieldsToUpdate.agentRunning = input.agentRunning;
    if (input.agentLog !== undefined) fieldsToUpdate.agentLog = input.agentLog;
    if (input.executionTime !== undefined) fieldsToUpdate.executionTime = input.executionTime;
    if (input.agentId !== undefined) fieldsToUpdate.agentId = input.agentId;
    if (input.position !== undefined) fieldsToUpdate.position = input.position;

    this.database
      .update(tasksTable)
      .set(fieldsToUpdate)
      .where(eq(tasksTable.id, taskId))
      .run();

    return this.getTaskById(taskId) as Task;
  }

  /**
   * Elimina un task dal database.
   * Restituisce il task eliminato (i dati letti prima della cancellazione).
   *
   * @throws Error se il task non esiste
   */
  deleteTask(taskId: string): Task {
    const existingTask = this.getTaskById(taskId);
    if (!existingTask) {
      throw new Error(`Task non trovato con ID: ${taskId}`);
    }

    this.database
      .delete(tasksTable)
      .where(eq(tasksTable.id, taskId))
      .run();

    return existingTask;
  }

  /**
   * Cerca un task per displayId (confronto case-insensitive).
   * Utile per la CLI dove l'utente digita "TASK-001" o "task-001".
   *
   * Ritorna undefined se il task non esiste.
   */
  getTaskByDisplayId(displayId: string): Task | undefined {
    const row = this.database
      .select()
      .from(tasksTable)
      .where(sql`LOWER(${tasksTable.displayId}) = LOWER(${displayId})`)
      .get() as TaskRow | undefined;
    return row ? this.enrichTaskWithAgentName(row) : undefined;
  }

  /**
   * Riordina i task all'interno di una colonna (stesso status).
   * L'array taskIds rappresenta l'ordine desiderato: il primo elemento ottiene position 0,
   * il secondo position 1, e cosi via.
   *
   * Ogni task viene anche aggiornato con updatedAt all'istante corrente.
   *
   * @throws Error se un task ID non esiste nel database
   * @throws Error se un task non appartiene alla colonna (status) specificata
   */
  /**
   * Aggiunge una dipendenza: blockingTaskId blocca blockedTaskId.
   * Il task blockedTaskId non potra essere spostato in "In Progress" finche
   * blockingTaskId non e in stato "Done".
   *
   * @throws Error se uno dei due task non esiste
   * @throws Error se si tenta di creare una auto-dipendenza
   * @throws Error se la dipendenza esiste gia
   */
  addDependency(blockingTaskId: string, blockedTaskId: string): void {
    if (blockingTaskId === blockedTaskId) {
      throw new Error('Un task non puo bloccare se stesso');
    }

    const blockingTask = this.getTaskById(blockingTaskId);
    if (!blockingTask) {
      throw new Error(`Task bloccante non trovato con ID: ${blockingTaskId}`);
    }

    const blockedTask = this.getTaskById(blockedTaskId);
    if (!blockedTask) {
      throw new Error(`Task bloccato non trovato con ID: ${blockedTaskId}`);
    }

    // Verifica che la dipendenza non esista gia
    const existingDependency = this.database
      .select()
      .from(taskDependenciesTable)
      .where(
        and(
          eq(taskDependenciesTable.blockingTaskId, blockingTaskId),
          eq(taskDependenciesTable.blockedTaskId, blockedTaskId),
        ),
      )
      .get();

    if (existingDependency) {
      throw new Error(
        `La dipendenza tra ${blockingTask.displayId} e ${blockedTask.displayId} esiste gia`,
      );
    }

    this.database
      .insert(taskDependenciesTable)
      .values({ blockingTaskId, blockedTaskId })
      .run();
  }

  /**
   * Rimuove una dipendenza tra due task.
   *
   * @throws Error se la dipendenza non esiste
   */
  removeDependency(blockingTaskId: string, blockedTaskId: string): void {
    const existingDependency = this.database
      .select()
      .from(taskDependenciesTable)
      .where(
        and(
          eq(taskDependenciesTable.blockingTaskId, blockingTaskId),
          eq(taskDependenciesTable.blockedTaskId, blockedTaskId),
        ),
      )
      .get();

    if (!existingDependency) {
      throw new Error(
        `Dipendenza non trovata tra i task ${blockingTaskId} e ${blockedTaskId}`,
      );
    }

    this.database
      .delete(taskDependenciesTable)
      .where(
        and(
          eq(taskDependenciesTable.blockingTaskId, blockingTaskId),
          eq(taskDependenciesTable.blockedTaskId, blockedTaskId),
        ),
      )
      .run();
  }

  /**
   * Restituisce i task che bloccano il task specificato.
   * Cioe, i task che devono essere completati prima che taskId possa procedere.
   */
  getBlockingTasks(taskId: string): Task[] {
    const dependencies = this.database
      .select({ blockingTaskId: taskDependenciesTable.blockingTaskId })
      .from(taskDependenciesTable)
      .where(eq(taskDependenciesTable.blockedTaskId, taskId))
      .all();

    return dependencies
      .map((dependency) => this.getTaskById(dependency.blockingTaskId))
      .filter((task): task is Task => task !== undefined);
  }

  /**
   * Restituisce i task che sono bloccati dal task specificato.
   * Cioe, i task che dipendono dal completamento di taskId.
   */
  getBlockedTasks(taskId: string): Task[] {
    const dependencies = this.database
      .select({ blockedTaskId: taskDependenciesTable.blockedTaskId })
      .from(taskDependenciesTable)
      .where(eq(taskDependenciesTable.blockingTaskId, taskId))
      .all();

    return dependencies
      .map((dependency) => this.getTaskById(dependency.blockedTaskId))
      .filter((task): task is Task => task !== undefined);
  }

  /**
   * Restituisce i task bloccanti che NON sono ancora in stato "done".
   * Usato per determinare se un task puo essere spostato in "In Progress".
   */
  getUncompletedBlockers(taskId: string): Task[] {
    return this.getBlockingTasks(taskId).filter(
      (blockingTask) => blockingTask.status !== 'done',
    );
  }

  /**
   * Restituisce true se il task ha almeno un bloccante non completato.
   */
  isTaskBlocked(taskId: string): boolean {
    return this.getUncompletedBlockers(taskId).length > 0;
  }

  // ─── Subtask methods ───────────────────────────────────────────────

  /**
   * Crea un nuovo subtask associato a un task esistente.
   * La posizione viene calcolata automaticamente come MAX(position) + 1.
   *
   * @throws Error se il task padre non esiste
   * @throws Error se il testo e vuoto
   */
  createSubtask(input: CreateSubtaskInput): Subtask {
    const parentTask = this.getTaskById(input.taskId);
    if (!parentTask) {
      throw new Error(`Task non trovato con ID: ${input.taskId}`);
    }

    const sanitizedText = input.text.trim();
    if (sanitizedText.length === 0) {
      throw new Error('Il testo del subtask non puo essere vuoto');
    }

    const maxPositionResult = this.database
      .select({ maxPosition: sql<number>`MAX(${subtasksTable.position})` })
      .from(subtasksTable)
      .where(eq(subtasksTable.taskId, input.taskId))
      .get();
    const nextPosition = (maxPositionResult?.maxPosition ?? -1) + 1;

    const newSubtask: Subtask = {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      text: sanitizedText,
      completed: false,
      position: nextPosition,
    };

    this.database.insert(subtasksTable).values(newSubtask).run();

    return newSubtask;
  }

  /**
   * Restituisce tutti i subtask di un task, ordinati per posizione crescente.
   */
  getSubtasksByTaskId(taskId: string): Subtask[] {
    return this.database
      .select()
      .from(subtasksTable)
      .where(eq(subtasksTable.taskId, taskId))
      .orderBy(subtasksTable.position)
      .all() as Subtask[];
  }

  /**
   * Restituisce un singolo subtask per ID.
   */
  getSubtaskById(subtaskId: string): Subtask | undefined {
    return this.database
      .select()
      .from(subtasksTable)
      .where(eq(subtasksTable.id, subtaskId))
      .get() as Subtask | undefined;
  }

  /**
   * Aggiorna parzialmente un subtask esistente.
   *
   * @throws Error se il subtask non esiste
   * @throws Error se il testo risulta vuoto dopo il trim
   */
  updateSubtask(subtaskId: string, input: UpdateSubtaskInput): Subtask {
    const existingSubtask = this.getSubtaskById(subtaskId);
    if (!existingSubtask) {
      throw new Error(`Subtask non trovato con ID: ${subtaskId}`);
    }

    const fieldsToUpdate: Partial<typeof subtasksTable.$inferInsert> = {};

    if (input.text !== undefined) {
      const trimmedText = input.text.trim();
      if (trimmedText.length === 0) {
        throw new Error('Il testo del subtask non puo essere vuoto');
      }
      fieldsToUpdate.text = trimmedText;
    }
    if (input.completed !== undefined) fieldsToUpdate.completed = input.completed;
    if (input.position !== undefined) fieldsToUpdate.position = input.position;

    this.database
      .update(subtasksTable)
      .set(fieldsToUpdate)
      .where(eq(subtasksTable.id, subtaskId))
      .run();

    return this.getSubtaskById(subtaskId) as Subtask;
  }

  /**
   * Elimina un subtask dal database.
   *
   * @throws Error se il subtask non esiste
   */
  deleteSubtask(subtaskId: string): void {
    const existingSubtask = this.getSubtaskById(subtaskId);
    if (!existingSubtask) {
      throw new Error(`Subtask non trovato con ID: ${subtaskId}`);
    }

    this.database
      .delete(subtasksTable)
      .where(eq(subtasksTable.id, subtaskId))
      .run();
  }

  /**
   * Inverte lo stato completed di un subtask (toggle).
   *
   * @throws Error se il subtask non esiste
   */
  toggleSubtask(subtaskId: string): Subtask {
    const existingSubtask = this.getSubtaskById(subtaskId);
    if (!existingSubtask) {
      throw new Error(`Subtask non trovato con ID: ${subtaskId}`);
    }

    this.database
      .update(subtasksTable)
      .set({ completed: !existingSubtask.completed })
      .where(eq(subtasksTable.id, subtaskId))
      .run();

    return this.getSubtaskById(subtaskId) as Subtask;
  }

  /**
   * Restituisce il progresso dei subtask per un task: totale e completati.
   */
  getSubtaskProgress(taskId: string): SubtaskProgress {
    const subtasks = this.getSubtasksByTaskId(taskId);
    const completedCount = subtasks.filter((subtask) => subtask.completed).length;
    return {
      total: subtasks.length,
      completed: completedCount,
    };
  }

  // ─── Reorder methods ──────────────────────────────────────────────

  reorderTasksInColumn(taskIds: string[], status: TaskStatus): void {
    const currentTimestamp = new Date().toISOString();

    // Valida tutti i task prima di eseguire qualsiasi aggiornamento
    for (const taskId of taskIds) {
      const existingTask = this.getTaskById(taskId);
      if (!existingTask) {
        throw new Error(`Task non trovato con ID: ${taskId}`);
      }
      if (existingTask.status !== status) {
        throw new Error(
          `Il task ${taskId} appartiene alla colonna "${existingTask.status}" e non a "${status}"`,
        );
      }
    }

    // Aggiorna la posizione di ogni task in base all'indice nell'array
    for (let index = 0; index < taskIds.length; index++) {
      this.database
        .update(tasksTable)
        .set({
          position: index,
          updatedAt: currentTimestamp,
        })
        .where(eq(tasksTable.id, taskIds[index]))
        .run();
    }
  }
}
