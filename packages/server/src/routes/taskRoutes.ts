import type { FastifyInstance } from 'fastify';
import type { TaskService } from '@kanban-reloaded/core';
import type { TaskStatus, TaskPriority } from '@kanban-reloaded/core';
import type { WebSocketBroadcaster } from '../websocket/websocketBroadcaster.js';
import type { AgentLauncher } from '../agent/agentLauncher.js';

const VALID_STATUSES = new Set<string>(['backlog', 'in-progress', 'done']);
const VALID_PRIORITIES = new Set<string>(['high', 'medium', 'low']);

interface GetTasksQuerystring {
  status?: string;
}

interface CreateTaskRequestBody {
  title?: string;
  description?: string;
  priority?: string;
  acceptanceCriteria?: string;
  agent?: string;
}

interface TaskRouteParams {
  id: string;
}

interface UpdateTaskRequestBody {
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: string;
  status?: string;
  position?: number;
  agent?: string | null;
  agentLog?: string | null;
  agentRunning?: boolean;
  executionTime?: number | null;
}

interface ReorderTasksRequestBody {
  taskIds?: string[];
  status?: string;
}

interface DeleteTaskQuerystring {
  force?: string;
}

interface DependencyRouteParams {
  id: string;
  blockingTaskId: string;
}

interface AddDependencyRequestBody {
  blockingTaskId?: string;
}

interface SubtaskRouteParams {
  subtaskId: string;
}

interface CreateSubtaskRequestBody {
  text?: string;
}

interface UpdateSubtaskRequestBody {
  text?: string;
  completed?: boolean;
  position?: number;
}

/**
 * Registra le route REST per la gestione dei task.
 * Le route vengono chiuse sul taskService passato tramite closure.
 */
export function registerTaskRoutes(
  server: FastifyInstance,
  taskService: TaskService,
  websocketBroadcaster: WebSocketBroadcaster,
  agentLauncher: AgentLauncher,
): void {
  server.get<{ Querystring: GetTasksQuerystring }>(
    '/api/tasks',
    async (request, reply) => {
      const { status } = request.query;

      if (status !== undefined) {
        if (!VALID_STATUSES.has(status)) {
          return reply.status(400).send({
            error: `Status non valido: '${status}'. Valori ammessi: backlog, in-progress, done`,
          });
        }
        const tasks = taskService.getTasksByStatus(status as TaskStatus);
        return reply.send(tasks);
      }

      const tasks = taskService.getAllTasks();
      return reply.send(tasks);
    },
  );

  server.post<{ Body: CreateTaskRequestBody }>(
    '/api/tasks',
    async (request, reply) => {
      const body = request.body as CreateTaskRequestBody | null;

      if (!body || typeof body.title !== 'string' || body.title.trim().length === 0) {
        return reply.status(400).send({
          error: 'Il campo title e obbligatorio e non puo essere vuoto',
        });
      }

      if (body.priority !== undefined && !VALID_PRIORITIES.has(body.priority)) {
        return reply.status(400).send({
          error: `Priorita non valida: '${body.priority}'. Valori ammessi: high, medium, low`,
        });
      }

      const createdTask = taskService.createTask({
        title: body.title,
        description: body.description,
        priority: body.priority as TaskPriority | undefined,
        acceptanceCriteria: body.acceptanceCriteria,
        agent: body.agent,
      });

      websocketBroadcaster.broadcastTaskEvent({
        type: 'task:created',
        payload: createdTask,
      });

      return reply.status(201).send(createdTask);
    },
  );

  server.put<{ Body: ReorderTasksRequestBody }>(
    '/api/tasks/reorder',
    async (request, reply) => {
      const body = request.body as ReorderTasksRequestBody | null;

      if (!body || !Array.isArray(body.taskIds) || body.taskIds.length === 0) {
        return reply.status(400).send({
          error: 'Il campo taskIds e obbligatorio e deve essere un array non vuoto di stringhe',
        });
      }

      const hasNonStringElement = body.taskIds.some(
        (element) => typeof element !== 'string',
      );
      if (hasNonStringElement) {
        return reply.status(400).send({
          error: 'Ogni elemento di taskIds deve essere una stringa',
        });
      }

      if (!body.status || !VALID_STATUSES.has(body.status)) {
        return reply.status(400).send({
          error: `Status non valido: '${body.status ?? ''}'.  Valori ammessi: backlog, in-progress, done`,
        });
      }

      try {
        taskService.reorderTasksInColumn(body.taskIds, body.status as TaskStatus);

        const reorderedTasks = taskService.getTasksByStatus(body.status as TaskStatus);
        websocketBroadcaster.broadcastTaskEvent({
          type: 'task:reordered',
          payload: reorderedTasks,
        });

        return reply.send({ success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Errore durante il riordinamento dei task';
        return reply.status(400).send({ error: errorMessage });
      }
    },
  );

  server.patch<{ Params: TaskRouteParams; Body: UpdateTaskRequestBody }>(
    '/api/tasks/:id',
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as UpdateTaskRequestBody | null;

      if (!body) {
        return reply.status(400).send({
          error: 'Il body della richiesta e obbligatorio',
        });
      }

      const hasTitle = body.title !== undefined;
      const hasDescription = body.description !== undefined;
      const hasAcceptanceCriteria = body.acceptanceCriteria !== undefined;
      const hasPriority = body.priority !== undefined;
      const hasStatus = body.status !== undefined;
      const hasPosition = body.position !== undefined;
      const hasAgent = body.agent !== undefined;
      const hasAgentLog = body.agentLog !== undefined;
      const hasAgentRunning = body.agentRunning !== undefined;
      const hasExecutionTime = body.executionTime !== undefined;

      if (!hasTitle && !hasDescription && !hasAcceptanceCriteria && !hasPriority && !hasStatus && !hasPosition && !hasAgent && !hasAgentLog && !hasAgentRunning && !hasExecutionTime) {
        return reply.status(400).send({
          error: 'Specificare almeno un campo da aggiornare: title, description, acceptanceCriteria, priority, status, position, agent, agentLog, agentRunning, executionTime',
        });
      }

      if (hasTitle && body.title!.trim().length === 0) {
        return reply.status(400).send({
          error: 'Il campo title non puo essere vuoto',
        });
      }

      if (hasPriority && !VALID_PRIORITIES.has(body.priority!)) {
        return reply.status(400).send({
          error: `Priorita non valida: '${body.priority}'. Valori ammessi: high, medium, low`,
        });
      }

      if (hasStatus && !VALID_STATUSES.has(body.status!)) {
        return reply.status(400).send({
          error: `Status non valido: '${body.status}'. Valori ammessi: backlog, in-progress, done`,
        });
      }

      const updateFields: { title?: string; description?: string; acceptanceCriteria?: string; priority?: TaskPriority; status?: TaskStatus; position?: number; agent?: string | null; agentLog?: string | null; agentRunning?: boolean; executionTime?: number | null } = {};
      if (hasTitle) updateFields.title = body.title!;
      if (hasDescription) updateFields.description = body.description!;
      if (hasAcceptanceCriteria) updateFields.acceptanceCriteria = body.acceptanceCriteria!;
      if (hasPriority) updateFields.priority = body.priority! as TaskPriority;
      if (hasStatus) updateFields.status = body.status! as TaskStatus;
      if (hasPosition) updateFields.position = body.position!;
      if (hasAgent) updateFields.agent = body.agent!;
      if (hasAgentLog) updateFields.agentLog = body.agentLog!;
      if (hasAgentRunning) updateFields.agentRunning = body.agentRunning!;
      if (hasExecutionTime) updateFields.executionTime = body.executionTime!;

      try {
        // Recupera il task prima dell'aggiornamento per verificare se lo status e cambiato
        const taskBeforeUpdate = taskService.getTaskById(id);
        taskService.updateTask(id, updateFields);

        // Se il task e stato spostato in "in-progress" (e prima non lo era), lancia l'agent
        const isTransitionToInProgress =
          hasStatus &&
          updateFields.status === 'in-progress' &&
          taskBeforeUpdate?.status !== 'in-progress';

        let agentWarning: string | undefined;

        if (isTransitionToInProgress) {
          const taskForAgent = taskService.getTaskById(id)!;
          const agentLaunchResult = agentLauncher.launchForTask(taskForAgent);

          if (agentLaunchResult.launched) {
            taskService.updateTask(id, { agentRunning: true });
          } else {
            agentWarning = agentLaunchResult.reason;
          }
        }

        // Re-fetch finale per avere lo stato definitivo (incluso agentRunning)
        const finalTask = taskService.getTaskById(id)!;

        // Broadcast con lo stato finale del task
        websocketBroadcaster.broadcastTaskEvent({
          type: 'task:updated',
          payload: finalTask,
        });

        const responsePayload: Record<string, unknown> = { ...finalTask };
        if (agentWarning) {
          responsePayload['warning'] = agentWarning;
        }

        return reply.send(responsePayload);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Task non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        if (error instanceof Error && error.message.includes('bloccato')) {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.delete<{ Params: TaskRouteParams; Querystring: DeleteTaskQuerystring }>(
    '/api/tasks/:id',
    async (request, reply) => {
      const { id } = request.params;
      const forceParameter = request.query.force;
      const isForceDelete = forceParameter === 'true';

      // Verifica esistenza del task prima della cancellazione
      const existingTask = taskService.getTaskById(id);
      if (!existingTask) {
        return reply.status(404).send({ error: `Task non trovato con ID: ${id}` });
      }

      // Se il task ha un agent in esecuzione e force non e' abilitato, rifiuta con 409
      if (existingTask.agentRunning && !isForceDelete) {
        return reply.status(409).send({
          error: 'Impossibile eliminare il task: un agent e in esecuzione. Usa ?force=true per forzare la cancellazione.',
        });
      }

      try {
        // Se il task ha un agent in esecuzione e la cancellazione e forzata, fermalo
        if (existingTask.agentRunning && isForceDelete) {
          agentLauncher.stopAgent(id);
        }

        const deletedTask = taskService.deleteTask(id);

        websocketBroadcaster.broadcastTaskEvent({
          type: 'task:deleted',
          payload: { id: deletedTask.id },
        });

        const responsePayload: Record<string, unknown> = { ...deletedTask };
        if (deletedTask.agentRunning) {
          responsePayload.warning = 'Il task ha un agent in esecuzione';
          responsePayload.agentWasRunning = true;
        }

        return reply.send(responsePayload);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Task non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  // ─── Dependency endpoints ────────────────────────────────────────────

  /**
   * GET /api/tasks/:id/dependencies
   * Restituisce i task che bloccano e quelli bloccati dal task specificato.
   */
  server.get<{ Params: TaskRouteParams }>(
    '/api/tasks/:id/dependencies',
    async (request, reply) => {
      const { id } = request.params;

      try {
        const blockingTasks = taskService.getBlockingTasks(id);
        const blockedByTasks = taskService.getBlockedTasks(id);

        return reply.send({ blockingTasks, blockedByTasks });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Task non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * POST /api/tasks/:id/dependencies
   * Aggiunge una dipendenza: il task :id viene bloccato dal blockingTaskId nel body.
   */
  server.post<{ Params: TaskRouteParams; Body: AddDependencyRequestBody }>(
    '/api/tasks/:id/dependencies',
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as AddDependencyRequestBody | null;

      if (!body || typeof body.blockingTaskId !== 'string' || body.blockingTaskId.trim().length === 0) {
        return reply.status(400).send({
          error: 'Il campo blockingTaskId e obbligatorio e deve essere una stringa non vuota',
        });
      }

      try {
        taskService.addDependency(body.blockingTaskId, id);

        websocketBroadcaster.broadcastEvent({
          type: 'task:dependency-added',
          payload: {
            blockingTaskId: body.blockingTaskId,
            blockedTaskId: id,
          },
        });

        return reply.status(201).send({
          success: true,
          blockingTaskId: body.blockingTaskId,
          blockedTaskId: id,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Task non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        if (error instanceof Error) {
          // Self-dependency, circular dependency, or duplicate dependency errors
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * DELETE /api/tasks/:id/dependencies/:blockingTaskId
   * Rimuove la dipendenza tra il task bloccante e il task bloccato (:id).
   */
  server.delete<{ Params: DependencyRouteParams }>(
    '/api/tasks/:id/dependencies/:blockingTaskId',
    async (request, reply) => {
      const { id, blockingTaskId } = request.params;

      try {
        taskService.removeDependency(blockingTaskId, id);

        websocketBroadcaster.broadcastEvent({
          type: 'task:dependency-removed',
          payload: {
            blockingTaskId,
            blockedTaskId: id,
          },
        });

        return reply.send({ success: true });
      } catch (error) {
        if (error instanceof Error && error.message.includes('non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * GET /api/tasks/:id/blocked
   * Restituisce se il task e bloccato e la lista dei bloccanti non completati.
   */
  server.get<{ Params: TaskRouteParams }>(
    '/api/tasks/:id/blocked',
    async (request, reply) => {
      const { id } = request.params;

      try {
        const isBlocked = taskService.isTaskBlocked(id);
        const uncompletedBlockers = taskService.getUncompletedBlockers(id);

        return reply.send({ isBlocked, uncompletedBlockers });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Task non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  // ─── Subtask endpoints ──────────────────────────────────────────────

  /**
   * GET /api/tasks/:id/subtasks
   * Restituisce tutti i subtask di un task, ordinati per posizione.
   */
  server.get<{ Params: TaskRouteParams }>(
    '/api/tasks/:id/subtasks',
    async (request, reply) => {
      const { id } = request.params;

      const existingTask = taskService.getTaskById(id);
      if (!existingTask) {
        return reply.status(404).send({ error: `Task non trovato con ID: ${id}` });
      }

      const subtasks = taskService.getSubtasksByTaskId(id);
      const progress = taskService.getSubtaskProgress(id);

      return reply.send({ subtasks, progress });
    },
  );

  /**
   * POST /api/tasks/:id/subtasks
   * Crea un nuovo subtask per il task specificato.
   */
  server.post<{ Params: TaskRouteParams; Body: CreateSubtaskRequestBody }>(
    '/api/tasks/:id/subtasks',
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as CreateSubtaskRequestBody | null;

      if (!body || typeof body.text !== 'string' || body.text.trim().length === 0) {
        return reply.status(400).send({
          error: 'Il campo text e obbligatorio e non puo essere vuoto',
        });
      }

      try {
        const subtask = taskService.createSubtask({ taskId: id, text: body.text });

        websocketBroadcaster.broadcastEvent({
          type: 'task:subtask-changed',
          payload: { taskId: id, subtask, action: 'created' },
        });

        return reply.status(201).send(subtask);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Task non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * PATCH /api/subtasks/:subtaskId
   * Aggiorna parzialmente un subtask (text, completed, position).
   */
  server.patch<{ Params: SubtaskRouteParams; Body: UpdateSubtaskRequestBody }>(
    '/api/subtasks/:subtaskId',
    async (request, reply) => {
      const { subtaskId } = request.params;
      const body = request.body as UpdateSubtaskRequestBody | null;

      if (!body) {
        return reply.status(400).send({
          error: 'Il body della richiesta e obbligatorio',
        });
      }

      const hasText = body.text !== undefined;
      const hasCompleted = body.completed !== undefined;
      const hasPosition = body.position !== undefined;

      if (!hasText && !hasCompleted && !hasPosition) {
        return reply.status(400).send({
          error: 'Specificare almeno un campo da aggiornare: text, completed, position',
        });
      }

      if (hasText && typeof body.text === 'string' && body.text.trim().length === 0) {
        return reply.status(400).send({
          error: 'Il campo text non puo essere vuoto',
        });
      }

      try {
        const updatedSubtask = taskService.updateSubtask(subtaskId, {
          text: hasText ? body.text : undefined,
          completed: hasCompleted ? body.completed : undefined,
          position: hasPosition ? body.position : undefined,
        });

        websocketBroadcaster.broadcastEvent({
          type: 'task:subtask-changed',
          payload: { taskId: updatedSubtask.taskId, subtask: updatedSubtask, action: 'updated' },
        });

        return reply.send(updatedSubtask);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Subtask non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * DELETE /api/subtasks/:subtaskId
   * Elimina un subtask.
   */
  server.delete<{ Params: SubtaskRouteParams }>(
    '/api/subtasks/:subtaskId',
    async (request, reply) => {
      const { subtaskId } = request.params;

      try {
        const existingSubtask = taskService.getSubtaskById(subtaskId);
        if (!existingSubtask) {
          return reply.status(404).send({ error: `Subtask non trovato con ID: ${subtaskId}` });
        }

        const taskId = existingSubtask.taskId;
        taskService.deleteSubtask(subtaskId);

        websocketBroadcaster.broadcastEvent({
          type: 'task:subtask-changed',
          payload: { taskId, subtaskId, action: 'deleted' },
        });

        return reply.send({ success: true });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Subtask non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * PATCH /api/subtasks/:subtaskId/toggle
   * Inverte lo stato completed di un subtask.
   */
  server.patch<{ Params: SubtaskRouteParams }>(
    '/api/subtasks/:subtaskId/toggle',
    async (request, reply) => {
      const { subtaskId } = request.params;

      try {
        const toggledSubtask = taskService.toggleSubtask(subtaskId);

        websocketBroadcaster.broadcastEvent({
          type: 'task:subtask-changed',
          payload: { taskId: toggledSubtask.taskId, subtask: toggledSubtask, action: 'toggled' },
        });

        return reply.send(toggledSubtask);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Subtask non trovato')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}
