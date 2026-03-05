import type { FastifyInstance } from 'fastify';
import type { TaskService } from '@kanban-reloaded/core';
import type { TaskStatus, TaskPriority } from '@kanban-reloaded/core';

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
}

interface ReorderTasksRequestBody {
  taskIds?: string[];
  status?: string;
}

interface DeleteTaskQuerystring {
  force?: string;
}

/**
 * Registra le route REST per la gestione dei task.
 * Le route vengono chiuse sul taskService passato tramite closure.
 */
export function registerTaskRoutes(
  server: FastifyInstance,
  taskService: TaskService,
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

      if (!hasTitle && !hasDescription && !hasAcceptanceCriteria && !hasPriority && !hasStatus) {
        return reply.status(400).send({
          error: 'Specificare almeno un campo da aggiornare: title, description, acceptanceCriteria, priority, status',
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

      const updateFields: { title?: string; description?: string; acceptanceCriteria?: string; priority?: TaskPriority; status?: TaskStatus } = {};
      if (hasTitle) updateFields.title = body.title!;
      if (hasDescription) updateFields.description = body.description!;
      if (hasAcceptanceCriteria) updateFields.acceptanceCriteria = body.acceptanceCriteria!;
      if (hasPriority) updateFields.priority = body.priority! as TaskPriority;
      if (hasStatus) updateFields.status = body.status! as TaskStatus;

      try {
        const updatedTask = taskService.updateTask(id, updateFields);
        return reply.send(updatedTask);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Task non trovato')) {
          return reply.status(404).send({ error: error.message });
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
        const deletedTask = taskService.deleteTask(id);

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
}
