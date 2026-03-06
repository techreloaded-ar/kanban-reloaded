import type { FastifyInstance } from 'fastify';
import type { ConfigService } from '@kanban-reloaded/core';
import type { ProjectConfiguration, ColumnConfiguration } from '@kanban-reloaded/core';

interface UpdateConfigurationRequestBody {
  agentCommand?: string | null;
  agents?: Record<string, unknown>;
  serverPort?: number;
  columns?: unknown[];
}

/**
 * Verifica che un valore sia un oggetto ColumnConfiguration valido
 * con le proprietà id, name e color di tipo stringa.
 */
function isValidColumnConfiguration(value: unknown): value is ColumnConfiguration {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['name'] === 'string' &&
    typeof candidate['color'] === 'string'
  );
}

/**
 * Registra le route REST per la gestione della configurazione del progetto.
 * Le route vengono chiuse sul configService passato tramite closure.
 */
export function registerConfigRoutes(
  server: FastifyInstance,
  configService: ConfigService,
): void {
  /**
   * GET /api/config
   * Restituisce la configurazione corrente del progetto caricata da config.json.
   */
  server.get('/api/config', async (_request, reply) => {
    try {
      const projectConfiguration = configService.loadConfiguration();
      return reply.send(projectConfiguration);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Errore durante il caricamento della configurazione';
      return reply.status(500).send({ error: errorMessage });
    }
  });

  /**
   * PUT /api/config
   * Aggiorna parzialmente la configurazione del progetto.
   * Accetta un oggetto con i campi da aggiornare, salva tramite
   * ConfigService.saveConfiguration() e restituisce la configurazione completa aggiornata.
   */
  server.put<{ Body: UpdateConfigurationRequestBody }>(
    '/api/config',
    async (request, reply) => {
      const body = request.body as UpdateConfigurationRequestBody | null;

      // Il body deve essere un oggetto non nullo e non un array
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({
          error: 'Il body della richiesta deve essere un oggetto JSON valido',
        });
      }

      // Validazione di agentCommand: deve essere una stringa o null
      if (
        body.agentCommand !== undefined &&
        body.agentCommand !== null &&
        typeof body.agentCommand !== 'string'
      ) {
        return reply.status(400).send({
          error:
            "Il campo 'agentCommand' deve essere una stringa o null",
        });
      }

      // Validazione di agents: deve essere un oggetto con valori stringa
      if (body.agents !== undefined) {
        if (
          typeof body.agents !== 'object' ||
          body.agents === null ||
          Array.isArray(body.agents)
        ) {
          return reply.status(400).send({
            error:
              "Il campo 'agents' deve essere un oggetto (mappa nome agent -> template comando)",
          });
        }

        for (const [agentName, agentCommandTemplate] of Object.entries(
          body.agents,
        )) {
          if (typeof agentCommandTemplate !== 'string') {
            return reply.status(400).send({
              error: `Il valore dell'agent '${agentName}' in 'agents' deve essere una stringa (template comando), ricevuto ${typeof agentCommandTemplate}`,
            });
          }
        }
      }

      // Validazione di serverPort: deve essere un numero positivo
      if (body.serverPort !== undefined) {
        if (typeof body.serverPort !== 'number' || body.serverPort <= 0) {
          return reply.status(400).send({
            error:
              "Il campo 'serverPort' deve essere un numero positivo",
          });
        }
      }

      // Validazione di columns: ogni elemento deve avere id, name e color di tipo stringa
      if (body.columns !== undefined) {
        if (!Array.isArray(body.columns)) {
          return reply.status(400).send({
            error: "Il campo 'columns' deve essere un array",
          });
        }

        for (
          let columnIndex = 0;
          columnIndex < body.columns.length;
          columnIndex++
        ) {
          const columnEntry = body.columns[columnIndex];
          if (!isValidColumnConfiguration(columnEntry)) {
            return reply.status(400).send({
              error: `L'elemento ${columnIndex} di 'columns' deve avere le proprieta 'id', 'name' e 'color' di tipo stringa`,
            });
          }
        }
      }

      // Costruisci l'oggetto di aggiornamento parziale con solo i campi forniti
      const updatedFields: Partial<ProjectConfiguration> = {};

      if (body.agentCommand !== undefined) {
        updatedFields.agentCommand = body.agentCommand;
      }
      if (body.agents !== undefined) {
        updatedFields.agents = body.agents as Record<string, string>;
      }
      if (body.serverPort !== undefined) {
        updatedFields.serverPort = body.serverPort;
      }
      if (body.columns !== undefined) {
        updatedFields.columns = body.columns as ColumnConfiguration[];
      }

      try {
        const updatedConfiguration =
          configService.saveConfiguration(updatedFields);
        return reply.send(updatedConfiguration);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Errore durante il salvataggio della configurazione';
        return reply.status(500).send({ error: errorMessage });
      }
    },
  );
}
