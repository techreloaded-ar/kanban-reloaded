import type { FastifyInstance } from 'fastify';
import type { AgentService } from '@kanban-reloaded/core';

interface AgentRouteParams {
  agentId: string;
}

interface CreateAgentRequestBody {
  name?: string;
  commandTemplate?: string;
  workingDirectory?: string | null;
}

interface UpdateAgentRequestBody {
  name?: string;
  commandTemplate?: string;
  workingDirectory?: string | null;
}

/**
 * Registra le route REST per la gestione degli agenti AI.
 * Le route vengono chiuse sull'agentService passato tramite closure.
 */
export function registerAgentRoutes(
  server: FastifyInstance,
  agentService: AgentService,
): void {
  /**
   * GET /api/agents
   * Restituisce la lista di tutti gli agenti configurati.
   */
  server.get('/api/agents', async (_request, reply) => {
    const allAgents = agentService.getAllAgents();
    return reply.send(allAgents);
  });

  /**
   * GET /api/agents/:agentId
   * Restituisce un singolo agente identificato dal suo ID.
   */
  server.get<{ Params: AgentRouteParams }>(
    '/api/agents/:agentId',
    async (request, reply) => {
      const { agentId } = request.params;

      const agent = agentService.getAgentById(agentId);
      if (!agent) {
        return reply.status(404).send({
          error: `Agente non trovato con ID: ${agentId}`,
        });
      }

      return reply.send(agent);
    },
  );

  /**
   * POST /api/agents
   * Crea un nuovo agente con nome, template comando e directory di lavoro opzionale.
   */
  server.post<{ Body: CreateAgentRequestBody }>(
    '/api/agents',
    async (request, reply) => {
      const body = request.body as CreateAgentRequestBody | null;

      if (
        !body ||
        typeof body.name !== 'string' ||
        body.name.trim().length === 0
      ) {
        return reply.status(400).send({
          error:
            'Il campo name e obbligatorio e non puo essere vuoto',
        });
      }

      if (
        typeof body.commandTemplate !== 'string' ||
        body.commandTemplate.trim().length === 0
      ) {
        return reply.status(400).send({
          error:
            'Il campo commandTemplate e obbligatorio e non puo essere vuoto',
        });
      }

      if (
        body.workingDirectory !== undefined &&
        body.workingDirectory !== null &&
        typeof body.workingDirectory !== 'string'
      ) {
        return reply.status(400).send({
          error:
            "Il campo workingDirectory deve essere una stringa o null",
        });
      }

      try {
        const createdAgent = agentService.createAgent({
          name: body.name,
          commandTemplate: body.commandTemplate,
          workingDirectory: body.workingDirectory,
        });

        return reply.status(201).send(createdAgent);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Esiste gia un agente con il nome')
        ) {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * PATCH /api/agents/:agentId
   * Aggiorna parzialmente un agente esistente (nome, template comando, directory di lavoro).
   */
  server.patch<{ Params: AgentRouteParams; Body: UpdateAgentRequestBody }>(
    '/api/agents/:agentId',
    async (request, reply) => {
      const { agentId } = request.params;
      const body = request.body as UpdateAgentRequestBody | null;

      if (!body) {
        return reply.status(400).send({
          error: 'Il body della richiesta e obbligatorio',
        });
      }

      const hasName = body.name !== undefined;
      const hasCommandTemplate = body.commandTemplate !== undefined;
      const hasWorkingDirectory = body.workingDirectory !== undefined;

      if (!hasName && !hasCommandTemplate && !hasWorkingDirectory) {
        return reply.status(400).send({
          error:
            'Specificare almeno un campo da aggiornare: name, commandTemplate, workingDirectory',
        });
      }

      if (hasName && typeof body.name !== 'string') {
        return reply.status(400).send({
          error: 'Il campo name deve essere una stringa',
        });
      }

      if (hasName && body.name!.trim().length === 0) {
        return reply.status(400).send({
          error: 'Il campo name non puo essere vuoto',
        });
      }

      if (hasCommandTemplate && typeof body.commandTemplate !== 'string') {
        return reply.status(400).send({
          error: 'Il campo commandTemplate deve essere una stringa',
        });
      }

      if (hasCommandTemplate && body.commandTemplate!.trim().length === 0) {
        return reply.status(400).send({
          error: 'Il campo commandTemplate non puo essere vuoto',
        });
      }

      if (
        hasWorkingDirectory &&
        body.workingDirectory !== null &&
        typeof body.workingDirectory !== 'string'
      ) {
        return reply.status(400).send({
          error:
            "Il campo workingDirectory deve essere una stringa o null",
        });
      }

      try {
        const updatedAgent = agentService.updateAgent(agentId, {
          name: hasName ? body.name : undefined,
          commandTemplate: hasCommandTemplate
            ? body.commandTemplate
            : undefined,
          workingDirectory: hasWorkingDirectory
            ? body.workingDirectory
            : undefined,
        });

        return reply.send(updatedAgent);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Agente non trovato')
        ) {
          return reply.status(404).send({ error: error.message });
        }
        if (
          error instanceof Error &&
          error.message.includes('Esiste gia un agente con il nome')
        ) {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  /**
   * DELETE /api/agents/:agentId
   * Elimina un agente. I task associati perderanno il riferimento all'agente.
   */
  server.delete<{ Params: AgentRouteParams }>(
    '/api/agents/:agentId',
    async (request, reply) => {
      const { agentId } = request.params;

      try {
        const deletedAgent = agentService.deleteAgent(agentId);
        return reply.send(deletedAgent);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Agente non trovato')
        ) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}
