import crypto from 'node:crypto';
import type { DatabaseInstance } from '../storage/database.js';
import { AgentRepository } from './agentRepository.js';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../models/types.js';

/**
 * Servizio per la gestione degli agenti AI (CRUD).
 * Valida l'unicita del nome e genera UUID automaticamente.
 */
export class AgentService {
  private readonly agentRepository: AgentRepository;

  constructor(database: DatabaseInstance) {
    this.agentRepository = new AgentRepository(database);
  }

  getAllAgents(): Agent[] {
    return this.agentRepository.getAllAgents();
  }

  getAgentById(agentId: string): Agent | undefined {
    return this.agentRepository.getAgentById(agentId);
  }

  getAgentByName(name: string): Agent | undefined {
    return this.agentRepository.getAgentByName(name);
  }

  /**
   * Crea un nuovo agente.
   *
   * @throws Error se il nome e vuoto o gia in uso
   */
  createAgent(input: CreateAgentInput): Agent {
    const sanitizedName = input.name.trim();
    if (sanitizedName.length === 0) {
      throw new Error('Il nome dell\'agente non puo essere vuoto');
    }

    const sanitizedCommandTemplate = input.commandTemplate.trim();
    if (sanitizedCommandTemplate.length === 0) {
      throw new Error('Il template comando dell\'agente non puo essere vuoto');
    }

    const existingAgent = this.agentRepository.getAgentByName(sanitizedName);
    if (existingAgent) {
      throw new Error(`Esiste gia un agente con il nome '${sanitizedName}'`);
    }

    const newAgent: Agent = {
      id: crypto.randomUUID(),
      name: sanitizedName,
      commandTemplate: sanitizedCommandTemplate,
      workingDirectory: input.workingDirectory?.trim() || null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    this.agentRepository.insertAgent(newAgent);
    return newAgent;
  }

  /**
   * Aggiorna parzialmente un agente esistente.
   *
   * @throws Error se l'agente non esiste
   * @throws Error se il nuovo nome e gia in uso da un altro agente
   */
  updateAgent(agentId: string, input: UpdateAgentInput): Agent {
    const existingAgent = this.agentRepository.getAgentById(agentId);
    if (!existingAgent) {
      throw new Error(`Agente non trovato con ID: ${agentId}`);
    }

    if (input.name !== undefined) {
      const sanitizedName = input.name.trim();
      if (sanitizedName.length === 0) {
        throw new Error('Il nome dell\'agente non puo essere vuoto');
      }

      const agentWithSameName = this.agentRepository.getAgentByName(sanitizedName);
      if (agentWithSameName && agentWithSameName.id !== agentId) {
        throw new Error(`Esiste gia un agente con il nome '${sanitizedName}'`);
      }
    }

    if (input.commandTemplate !== undefined) {
      const sanitizedCommand = input.commandTemplate.trim();
      if (sanitizedCommand.length === 0) {
        throw new Error('Il template comando dell\'agente non puo essere vuoto');
      }
    }

    const fieldsToUpdate: Partial<Omit<Agent, 'id'>> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) fieldsToUpdate.name = input.name.trim();
    if (input.commandTemplate !== undefined) fieldsToUpdate.commandTemplate = input.commandTemplate.trim();
    if (input.workingDirectory !== undefined) fieldsToUpdate.workingDirectory = input.workingDirectory?.trim() || null;

    this.agentRepository.updateAgent(agentId, fieldsToUpdate);
    return this.agentRepository.getAgentById(agentId) as Agent;
  }

  /**
   * Elimina un agente. Le task con questo agentId diventeranno null
   * grazie a ON DELETE SET NULL nella foreign key.
   *
   * @throws Error se l'agente non esiste
   */
  deleteAgent(agentId: string): Agent {
    const existingAgent = this.agentRepository.getAgentById(agentId);
    if (!existingAgent) {
      throw new Error(`Agente non trovato con ID: ${agentId}`);
    }

    this.agentRepository.deleteAgent(agentId);
    return existingAgent;
  }
}
