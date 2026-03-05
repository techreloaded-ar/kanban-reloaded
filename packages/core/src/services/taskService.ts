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
    return this.database
      .select()
      .from(tasksTable)
      .where(sql`LOWER(${tasksTable.displayId}) = LOWER(${displayId})`)
      .get() as Task | undefined;
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
