import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { initializeDatabase } from '../storage/database.js';
import type { DatabaseInitializationResult } from '../storage/database.js';
import { AgentRepository } from './agentRepository.js';
import type { Agent } from '../models/types.js';

const temporaryDirectories: string[] = [];
let databaseResult: DatabaseInitializationResult | null = null;

function createTestAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: crypto.randomUUID(),
    name: `Agent ${crypto.randomUUID().slice(0, 8)}`,
    commandTemplate: 'claude --task "$TASK"',
    workingDirectory: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...overrides,
  };
}

function createTemporaryProjectWithDatabase(): {
  projectDirectory: string;
  agentRepository: AgentRepository;
} {
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-agent-repo-test-'));
  temporaryDirectories.push(projectDirectory);

  databaseResult = initializeDatabase(projectDirectory);
  const agentRepository = new AgentRepository(databaseResult.database);

  return { projectDirectory, agentRepository };
}

afterEach(() => {
  if (databaseResult) {
    databaseResult.closeConnection();
    databaseResult = null;
  }
  for (const directoryPath of temporaryDirectories) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
    } catch {
      // Ignora errori di pulizia (file lock su Windows)
    }
  }
  temporaryDirectories.length = 0;
});

describe('AgentRepository', () => {
  describe('getAllAgents', () => {
    it('restituisce lista vuota quando non ci sono agenti', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();

      const agents = agentRepository.getAllAgents();

      expect(agents).toHaveLength(0);
    });

    it('restituisce tutti gli agenti inseriti', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agentA = createTestAgent({ name: 'Agent Alpha' });
      const agentB = createTestAgent({ name: 'Agent Beta' });
      const agentC = createTestAgent({ name: 'Agent Gamma' });
      agentRepository.insertAgent(agentA);
      agentRepository.insertAgent(agentB);
      agentRepository.insertAgent(agentC);

      const agents = agentRepository.getAllAgents();

      expect(agents).toHaveLength(3);
      const names = agents.map((a) => a.name);
      expect(names).toContain('Agent Alpha');
      expect(names).toContain('Agent Beta');
      expect(names).toContain('Agent Gamma');
    });
  });

  describe('getAgentById', () => {
    it('restituisce l\'agente corretto dato un ID valido', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({ name: 'Agent Cercato' });
      agentRepository.insertAgent(agent);

      const foundAgent = agentRepository.getAgentById(agent.id);

      expect(foundAgent).toBeDefined();
      expect(foundAgent!.id).toBe(agent.id);
      expect(foundAgent!.name).toBe('Agent Cercato');
      expect(foundAgent!.commandTemplate).toBe(agent.commandTemplate);
    });

    it('restituisce undefined per ID inesistente', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();

      const foundAgent = agentRepository.getAgentById('00000000-0000-0000-0000-000000000000');

      expect(foundAgent).toBeUndefined();
    });
  });

  describe('getAgentByName', () => {
    it('restituisce l\'agente corretto dato un nome valido', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({ name: 'Claude Code' });
      agentRepository.insertAgent(agent);

      const foundAgent = agentRepository.getAgentByName('Claude Code');

      expect(foundAgent).toBeDefined();
      expect(foundAgent!.id).toBe(agent.id);
      expect(foundAgent!.name).toBe('Claude Code');
    });

    it('restituisce undefined per nome inesistente', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();

      const foundAgent = agentRepository.getAgentByName('Agente Fantasma');

      expect(foundAgent).toBeUndefined();
    });

    it('il confronto per nome e case-sensitive', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({ name: 'Claude Code' });
      agentRepository.insertAgent(agent);

      const foundWithDifferentCase = agentRepository.getAgentByName('claude code');

      // SQLite LIKE e case-insensitive, ma eq() usa = che e case-sensitive
      expect(foundWithDifferentCase).toBeUndefined();
    });
  });

  describe('insertAgent', () => {
    it('inserisce un agente con tutti i campi', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({
        name: 'Agent Completo',
        commandTemplate: 'npx agent --run "$TASK"',
        workingDirectory: '/home/user/project',
      });

      agentRepository.insertAgent(agent);

      const foundAgent = agentRepository.getAgentById(agent.id);
      expect(foundAgent).toBeDefined();
      expect(foundAgent!.name).toBe('Agent Completo');
      expect(foundAgent!.commandTemplate).toBe('npx agent --run "$TASK"');
      expect(foundAgent!.workingDirectory).toBe('/home/user/project');
      expect(foundAgent!.createdAt).toBe(agent.createdAt);
      expect(foundAgent!.updatedAt).toBeNull();
    });

    it('lancia errore per violazione vincolo UNIQUE sul nome', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agentA = createTestAgent({ name: 'Nome Duplicato' });
      const agentB = createTestAgent({ name: 'Nome Duplicato' });

      agentRepository.insertAgent(agentA);

      expect(() => agentRepository.insertAgent(agentB)).toThrow();
    });
  });

  describe('updateAgent', () => {
    it('aggiorna il nome di un agente', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({ name: 'Nome Originale' });
      agentRepository.insertAgent(agent);

      agentRepository.updateAgent(agent.id, { name: 'Nome Aggiornato' });

      const updatedAgent = agentRepository.getAgentById(agent.id);
      expect(updatedAgent!.name).toBe('Nome Aggiornato');
    });

    it('aggiorna il commandTemplate di un agente', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({ commandTemplate: 'old-command' });
      agentRepository.insertAgent(agent);

      agentRepository.updateAgent(agent.id, { commandTemplate: 'new-command --verbose' });

      const updatedAgent = agentRepository.getAgentById(agent.id);
      expect(updatedAgent!.commandTemplate).toBe('new-command --verbose');
    });

    it('aggiorna piu campi contemporaneamente', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({
        name: 'Vecchio Nome',
        commandTemplate: 'vecchio-cmd',
        workingDirectory: null,
      });
      agentRepository.insertAgent(agent);

      const updatedAt = new Date().toISOString();
      agentRepository.updateAgent(agent.id, {
        name: 'Nuovo Nome',
        commandTemplate: 'nuovo-cmd',
        workingDirectory: '/nuova/directory',
        updatedAt,
      });

      const updatedAgent = agentRepository.getAgentById(agent.id);
      expect(updatedAgent!.name).toBe('Nuovo Nome');
      expect(updatedAgent!.commandTemplate).toBe('nuovo-cmd');
      expect(updatedAgent!.workingDirectory).toBe('/nuova/directory');
      expect(updatedAgent!.updatedAt).toBe(updatedAt);
    });

    it('non modifica nulla se l\'ID non esiste (nessun errore)', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();

      // Drizzle non lancia errore per update su riga inesistente
      expect(() =>
        agentRepository.updateAgent('00000000-0000-0000-0000-000000000000', { name: 'Fantasma' }),
      ).not.toThrow();
    });

    it('aggiornamento parziale non modifica i campi non specificati', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({
        name: 'Invariato',
        commandTemplate: 'cmd-originale',
        workingDirectory: '/original/path',
      });
      agentRepository.insertAgent(agent);

      agentRepository.updateAgent(agent.id, { name: 'Cambiato' });

      const updatedAgent = agentRepository.getAgentById(agent.id);
      expect(updatedAgent!.name).toBe('Cambiato');
      expect(updatedAgent!.commandTemplate).toBe('cmd-originale');
      expect(updatedAgent!.workingDirectory).toBe('/original/path');
    });
  });

  describe('deleteAgent', () => {
    it('elimina un agente esistente', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agent = createTestAgent({ name: 'Agent Da Eliminare' });
      agentRepository.insertAgent(agent);

      agentRepository.deleteAgent(agent.id);

      const foundAgent = agentRepository.getAgentById(agent.id);
      expect(foundAgent).toBeUndefined();
    });

    it('non lancia errore se l\'ID non esiste', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();

      // Drizzle non lancia errore per delete su riga inesistente
      expect(() =>
        agentRepository.deleteAgent('00000000-0000-0000-0000-000000000000'),
      ).not.toThrow();
    });

    it('non influenza gli altri agenti presenti nel database', () => {
      const { agentRepository } = createTemporaryProjectWithDatabase();
      const agentToKeep = createTestAgent({ name: 'Sopravvissuto' });
      const agentToDelete = createTestAgent({ name: 'Condannato' });
      agentRepository.insertAgent(agentToKeep);
      agentRepository.insertAgent(agentToDelete);

      agentRepository.deleteAgent(agentToDelete.id);

      const agents = agentRepository.getAllAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Sopravvissuto');
    });
  });
});
