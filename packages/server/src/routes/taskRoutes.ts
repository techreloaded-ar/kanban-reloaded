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
}
