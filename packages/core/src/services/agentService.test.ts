import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { initializeDatabase } from '../storage/database.js';
import type { DatabaseInitializationResult } from '../storage/database.js';
import { AgentService } from './agentService.js';
import { TaskService } from './taskService.js';

const temporaryDirectories: string[] = [];
let databaseResult: DatabaseInitializationResult | null = null;

function createTemporaryProjectWithDatabase(): {
  projectDirectory: string;
  agentService: AgentService;
  taskService: TaskService;
} {
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-agent-svc-test-'));
  temporaryDirectories.push(projectDirectory);

  databaseResult = initializeDatabase(projectDirectory);
  const agentService = new AgentService(databaseResult.database);
  const taskService = new TaskService(databaseResult.database);

  return { projectDirectory, agentService, taskService };
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

describe('AgentService', () => {
  describe('createAgent', () => {
    it('crea un agente con tutti i campi obbligatori', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const agent = agentService.createAgent({
        name: 'Claude Code',
        commandTemplate: 'claude --task "$TASK"',
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Claude Code');
      expect(agent.commandTemplate).toBe('claude --task "$TASK"');
      expect(agent.workingDirectory).toBeNull();
      expect(agent.createdAt).toBeDefined();
      expect(new Date(agent.createdAt).toISOString()).toBe(agent.createdAt);
      expect(agent.updatedAt).toBeNull();
    });

    it('crea un agente con workingDirectory specificata', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const agent = agentService.createAgent({
        name: 'Agent con Directory',
        commandTemplate: 'agent-run',
        workingDirectory: '/home/user/project',
      });

      expect(agent.workingDirectory).toBe('/home/user/project');
    });

    it('esegue il trim su nome e commandTemplate', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const agent = agentService.createAgent({
        name: '  Claude Code  ',
        commandTemplate: '  claude --task "$TASK"  ',
        workingDirectory: '  /path/to/dir  ',
      });

      expect(agent.name).toBe('Claude Code');
      expect(agent.commandTemplate).toBe('claude --task "$TASK"');
      expect(agent.workingDirectory).toBe('/path/to/dir');
    });

    it('lancia errore se il nome e vuoto', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      expect(() =>
        agentService.createAgent({ name: '', commandTemplate: 'cmd' }),
      ).toThrowError(/nome.*vuoto/i);
    });

    it('lancia errore se il nome e solo spazi', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      expect(() =>
        agentService.createAgent({ name: '   ', commandTemplate: 'cmd' }),
      ).toThrowError(/nome.*vuoto/i);
    });

    it('lancia errore se il commandTemplate e vuoto', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      expect(() =>
        agentService.createAgent({ name: 'Agent', commandTemplate: '' }),
      ).toThrowError(/template comando.*vuoto/i);
    });

    it('lancia errore se il commandTemplate e solo spazi', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      expect(() =>
        agentService.createAgent({ name: 'Agent', commandTemplate: '   ' }),
      ).toThrowError(/template comando.*vuoto/i);
    });

    it('lancia errore per nome duplicato', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      agentService.createAgent({ name: 'Unico', commandTemplate: 'cmd' });

      expect(() =>
        agentService.createAgent({ name: 'Unico', commandTemplate: 'altro-cmd' }),
      ).toThrowError(/Esiste gia un agente con il nome/);
    });

    it('genera UUID univoci per ogni agente', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const agentA = agentService.createAgent({ name: 'Agent A', commandTemplate: 'cmd-a' });
      const agentB = agentService.createAgent({ name: 'Agent B', commandTemplate: 'cmd-b' });

      expect(agentA.id).not.toBe(agentB.id);
    });

    it('workingDirectory null se non specificata o stringa vuota', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const agentSenza = agentService.createAgent({ name: 'Senza Dir', commandTemplate: 'cmd' });
      const agentVuota = agentService.createAgent({
        name: 'Dir Vuota',
        commandTemplate: 'cmd',
        workingDirectory: '   ',
      });

      expect(agentSenza.workingDirectory).toBeNull();
      expect(agentVuota.workingDirectory).toBeNull();
    });
  });

  describe('getAllAgents', () => {
    it('restituisce lista vuota quando non ci sono agenti', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const agents = agentService.getAllAgents();

      expect(agents).toHaveLength(0);
    });

    it('restituisce tutti gli agenti creati', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      agentService.createAgent({ name: 'Alpha', commandTemplate: 'cmd-a' });
      agentService.createAgent({ name: 'Beta', commandTemplate: 'cmd-b' });
      agentService.createAgent({ name: 'Gamma', commandTemplate: 'cmd-g' });

      const agents = agentService.getAllAgents();

      expect(agents).toHaveLength(3);
      const names = agents.map((a) => a.name);
      expect(names).toContain('Alpha');
      expect(names).toContain('Beta');
      expect(names).toContain('Gamma');
    });
  });

  describe('getAgentById', () => {
    it('restituisce l\'agente corretto dato un ID valido', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const createdAgent = agentService.createAgent({ name: 'Cercato', commandTemplate: 'cmd' });

      const foundAgent = agentService.getAgentById(createdAgent.id);

      expect(foundAgent).toBeDefined();
      expect(foundAgent!.id).toBe(createdAgent.id);
      expect(foundAgent!.name).toBe('Cercato');
    });

    it('restituisce undefined per ID inesistente', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const foundAgent = agentService.getAgentById('00000000-0000-0000-0000-000000000000');

      expect(foundAgent).toBeUndefined();
    });
  });

  describe('getAgentByName', () => {
    it('restituisce l\'agente corretto dato un nome valido', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      agentService.createAgent({ name: 'Claude Code', commandTemplate: 'cmd' });

      const foundAgent = agentService.getAgentByName('Claude Code');

      expect(foundAgent).toBeDefined();
      expect(foundAgent!.name).toBe('Claude Code');
    });

    it('restituisce undefined per nome inesistente', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      const foundAgent = agentService.getAgentByName('Agente Fantasma');

      expect(foundAgent).toBeUndefined();
    });
  });

  describe('updateAgent', () => {
    it('aggiorna solo il nome lasciando invariati gli altri campi', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const original = agentService.createAgent({
        name: 'Originale',
        commandTemplate: 'cmd-originale',
        workingDirectory: '/original',
      });

      const updated = agentService.updateAgent(original.id, { name: 'Modificato' });

      expect(updated.name).toBe('Modificato');
      expect(updated.commandTemplate).toBe('cmd-originale');
      expect(updated.workingDirectory).toBe('/original');
    });

    it('aggiorna solo il commandTemplate', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const original = agentService.createAgent({
        name: 'Immutabile',
        commandTemplate: 'vecchio-cmd',
      });

      const updated = agentService.updateAgent(original.id, {
        commandTemplate: 'nuovo-cmd --flag',
      });

      expect(updated.name).toBe('Immutabile');
      expect(updated.commandTemplate).toBe('nuovo-cmd --flag');
    });

    it('aggiorna piu campi contemporaneamente', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const original = agentService.createAgent({
        name: 'Vecchio',
        commandTemplate: 'vecchio-cmd',
      });

      const updated = agentService.updateAgent(original.id, {
        name: 'Nuovo',
        commandTemplate: 'nuovo-cmd',
        workingDirectory: '/nuova/dir',
      });

      expect(updated.name).toBe('Nuovo');
      expect(updated.commandTemplate).toBe('nuovo-cmd');
      expect(updated.workingDirectory).toBe('/nuova/dir');
    });

    it('imposta automaticamente updatedAt come stringa ISO valida', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const original = agentService.createAgent({ name: 'Timestamp', commandTemplate: 'cmd' });
      expect(original.updatedAt).toBeNull();

      const updated = agentService.updateAgent(original.id, { name: 'Aggiornato' });

      expect(updated.updatedAt).not.toBeNull();
      expect(new Date(updated.updatedAt!).toISOString()).toBe(updated.updatedAt);
    });

    it('esegue il trim sui campi aggiornati', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const original = agentService.createAgent({ name: 'Originale', commandTemplate: 'cmd' });

      const updated = agentService.updateAgent(original.id, {
        name: '  Trimmato  ',
        commandTemplate: '  cmd-trimmato  ',
      });

      expect(updated.name).toBe('Trimmato');
      expect(updated.commandTemplate).toBe('cmd-trimmato');
    });

    it('lancia errore se l\'agente non esiste', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      expect(() =>
        agentService.updateAgent('00000000-0000-0000-0000-000000000000', { name: 'Fantasma' }),
      ).toThrowError(/Agente non trovato/);
    });

    it('lancia errore per nome duplicato di un altro agente', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      agentService.createAgent({ name: 'Primo', commandTemplate: 'cmd-1' });
      const secondo = agentService.createAgent({ name: 'Secondo', commandTemplate: 'cmd-2' });

      expect(() =>
        agentService.updateAgent(secondo.id, { name: 'Primo' }),
      ).toThrowError(/Esiste gia un agente con il nome/);
    });

    it('consente di mantenere il proprio nome (esclude se stesso dal controllo duplicati)', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const agent = agentService.createAgent({ name: 'Stabile', commandTemplate: 'cmd' });

      const updated = agentService.updateAgent(agent.id, { name: 'Stabile' });

      expect(updated.name).toBe('Stabile');
    });

    it('lancia errore se il commandTemplate aggiornato e vuoto', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const agent = agentService.createAgent({ name: 'Agent', commandTemplate: 'cmd' });

      expect(() =>
        agentService.updateAgent(agent.id, { commandTemplate: '   ' }),
      ).toThrowError(/template comando.*vuoto/i);
    });

    it('lancia errore se il nome aggiornato e vuoto', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const agent = agentService.createAgent({ name: 'Agent', commandTemplate: 'cmd' });

      expect(() =>
        agentService.updateAgent(agent.id, { name: '   ' }),
      ).toThrowError(/nome.*vuoto/i);
    });
  });

  describe('deleteAgent', () => {
    it('elimina un agente esistente e restituisce i suoi dati', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const agent = agentService.createAgent({
        name: 'Condannato',
        commandTemplate: 'cmd-doom',
      });

      const deletedAgent = agentService.deleteAgent(agent.id);

      expect(deletedAgent.id).toBe(agent.id);
      expect(deletedAgent.name).toBe('Condannato');
      expect(agentService.getAgentById(agent.id)).toBeUndefined();
    });

    it('lancia errore se l\'agente non esiste', () => {
      const { agentService } = createTemporaryProjectWithDatabase();

      expect(() =>
        agentService.deleteAgent('00000000-0000-0000-0000-000000000000'),
      ).toThrowError(/Agente non trovato/);
    });

    it('FK SET NULL: le task associate diventano agentId null quando l\'agente viene eliminato', () => {
      const { agentService, taskService } = createTemporaryProjectWithDatabase();

      const agent = agentService.createAgent({
        name: 'Agent Eliminabile',
        commandTemplate: 'cmd',
      });

      // Crea un task associato a questo agente
      const task = taskService.createTask({ title: 'Task con agente', agentId: agent.id });
      expect(task.agentId).toBe(agent.id);

      // Elimina l'agente
      agentService.deleteAgent(agent.id);

      // Il task deve ancora esistere ma con agentId a null
      const taskAfterDelete = taskService.getTaskById(task.id);
      expect(taskAfterDelete).toBeDefined();
      expect(taskAfterDelete!.agentId).toBeNull();
    });

    it('non influenza gli altri agenti presenti', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const survivor = agentService.createAgent({ name: 'Sopravvissuto', commandTemplate: 'cmd-s' });
      const doomed = agentService.createAgent({ name: 'Destinato', commandTemplate: 'cmd-d' });

      agentService.deleteAgent(doomed.id);

      const agents = agentService.getAllAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe(survivor.id);
    });

    it('consente di ricreare un agente con lo stesso nome dopo la cancellazione', () => {
      const { agentService } = createTemporaryProjectWithDatabase();
      const original = agentService.createAgent({ name: 'Riciclabile', commandTemplate: 'cmd' });
      agentService.deleteAgent(original.id);

      const recreated = agentService.createAgent({ name: 'Riciclabile', commandTemplate: 'cmd-nuovo' });

      expect(recreated.id).not.toBe(original.id);
      expect(recreated.name).toBe('Riciclabile');
    });
  });
});
