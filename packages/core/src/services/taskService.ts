import crypto from 'node:crypto';
import { eq, sql, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../storage/database.js';
import { tasksTable } from '../models/schema.js';
import type { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../models/types.js';

/**
 * Servizio per la gestione delle task (CRUD).
 * Fornisce metodi per creare e interrogare i task nella board Kanban.
 */
export class TaskService {
  constructor(private readonly database: DatabaseInstance) {}

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

    const newTask: Task = {
      id: crypto.randomUUID(),
      displayId,
      title: sanitizedTitle,
      description: sanitizedDescription,
      acceptanceCriteria: sanitizedAcceptanceCriteria,
      priority: targetPriority,
      status: targetStatus,
      agentRunning: false,
      agentLog: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      executionTime: null,
      position: input.position ?? nextPosition,
    };

    this.database.insert(tasksTable).values(newTask).run();

    return newTask;
  }

  /**
   * Restituisce tutti i task ordinati per posizione crescente.
   */
  getAllTasks(): Task[] {
    return this.database
      .select()
      .from(tasksTable)
      .orderBy(tasksTable.position)
      .all() as Task[];
  }

  /**
   * Restituisce i task filtrati per status, ordinati per posizione crescente.
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.database
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.status, status))
      .orderBy(tasksTable.position)
      .all() as Task[];
  }

  /**
   * Cerca un task per UUID.
   * Ritorna undefined se il task non esiste.
   */
  getTaskById(taskId: string): Task | undefined {
    return this.database
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId))
      .get() as Task | undefined;
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
    if (input.status !== undefined) fieldsToUpdate.status = input.status;
    if (input.agentRunning !== undefined) fieldsToUpdate.agentRunning = input.agentRunning;
    if (input.agentLog !== undefined) fieldsToUpdate.agentLog = input.agentLog;
    if (input.executionTime !== undefined) fieldsToUpdate.executionTime = input.executionTime;
    if (input.position !== undefined) fieldsToUpdate.position = input.position;

    this.database
      .update(tasksTable)
      .set(fieldsToUpdate)
      .where(eq(tasksTable.id, taskId))
      .run();

    return this.getTaskById(taskId) as Task;
  }
}
