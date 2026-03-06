import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../storage/database.js';
import { agentsTable } from '../models/schema.js';
import type { Agent } from '../models/types.js';

/**
 * Data-access layer per la tabella `agents`.
 * Fornisce operazioni CRUD di basso livello senza logica di business.
 */
export class AgentRepository {
  constructor(private readonly database: DatabaseInstance) {}

  getAllAgents(): Agent[] {
    return this.database
      .select()
      .from(agentsTable)
      .all() as Agent[];
  }

  getAgentById(agentId: string): Agent | undefined {
    return this.database
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, agentId))
      .get() as Agent | undefined;
  }

  getAgentByName(name: string): Agent | undefined {
    return this.database
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.name, name))
      .get() as Agent | undefined;
  }

  insertAgent(agent: Agent): void {
    this.database.insert(agentsTable).values(agent).run();
  }

  updateAgent(agentId: string, fields: Partial<Omit<Agent, 'id'>>): void {
    this.database
      .update(agentsTable)
      .set(fields)
      .where(eq(agentsTable.id, agentId))
      .run();
  }

  deleteAgent(agentId: string): void {
    this.database
      .delete(agentsTable)
      .where(eq(agentsTable.id, agentId))
      .run();
  }
}
