import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { initializeDatabase } from '../storage/database.js';
import type { DatabaseInitializationResult } from '../storage/database.js';
import { TaskService } from './taskService.js';

const temporaryDirectories: string[] = [];
let databaseResult: DatabaseInitializationResult | null = null;

function createTemporaryProjectWithDatabase(): { projectDirectory: string; taskService: TaskService } {
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-task-test-'));
  temporaryDirectories.push(projectDirectory);

  databaseResult = initializeDatabase(projectDirectory);
  const taskService = new TaskService(databaseResult.database);

  return { projectDirectory, taskService };
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

describe('TaskService', () => {
  it('crea un task con valori di default', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const task = taskService.createTask({ title: 'Primo task' });

    expect(task.id).toBeDefined();
    expect(task.displayId).toBe('TASK-001');
    expect(task.title).toBe('Primo task');
    expect(task.description).toBe('');
    expect(task.acceptanceCriteria).toBe('');
    expect(task.priority).toBe('medium');
    expect(task.status).toBe('backlog');
    expect(task.agentRunning).toBe(false);
    expect(task.agentLog).toBeNull();
    expect(task.executionTime).toBeNull();
    expect(task.position).toBe(1);
  });

  it('genera displayId incrementali', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const firstTask = taskService.createTask({ title: 'Task uno' });
    const secondTask = taskService.createTask({ title: 'Task due' });
    const thirdTask = taskService.createTask({ title: 'Task tre' });

    expect(firstTask.displayId).toBe('TASK-001');
    expect(secondTask.displayId).toBe('TASK-002');
    expect(thirdTask.displayId).toBe('TASK-003');
  });

  it('restituisce tutti i task ordinati per posizione', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    taskService.createTask({ title: 'Task A' });
    taskService.createTask({ title: 'Task B', status: 'in-progress' });
    taskService.createTask({ title: 'Task C', status: 'done' });

    const allTasks = taskService.getAllTasks();

    expect(allTasks).toHaveLength(3);
    expect(allTasks[0].title).toBe('Task A');
    expect(allTasks[1].title).toBe('Task B');
    expect(allTasks[2].title).toBe('Task C');
  });

  it('filtra i task per status', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    taskService.createTask({ title: 'Backlog 1' });
    taskService.createTask({ title: 'Backlog 2' });
    taskService.createTask({ title: 'In Progress 1', status: 'in-progress' });
    taskService.createTask({ title: 'Done 1', status: 'done' });

    const backlogTasks = taskService.getTasksByStatus('backlog');
    const inProgressTasks = taskService.getTasksByStatus('in-progress');
    const doneTasks = taskService.getTasksByStatus('done');

    expect(backlogTasks).toHaveLength(2);
    expect(inProgressTasks).toHaveLength(1);
    expect(doneTasks).toHaveLength(1);
    expect(backlogTasks[0].title).toBe('Backlog 1');
    expect(inProgressTasks[0].title).toBe('In Progress 1');
  });

  it('rifiuta un titolo vuoto', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    expect(() => taskService.createTask({ title: '' })).toThrowError(/vuoto/);
    expect(() => taskService.createTask({ title: '   ' })).toThrowError(/vuoto/);
  });

  it('esegue il trim su titolo e descrizione', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const task = taskService.createTask({
      title: '  Task con spazi  ',
      description: '  Descrizione con spazi  ',
      acceptanceCriteria: '  Criteri con spazi  ',
    });

    expect(task.title).toBe('Task con spazi');
    expect(task.description).toBe('Descrizione con spazi');
    expect(task.acceptanceCriteria).toBe('Criteri con spazi');
  });

  describe('getTaskById', () => {
    it('ritorna il task corretto dato un UUID valido', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const createdTask = taskService.createTask({ title: 'Task da cercare' });

      const foundTask = taskService.getTaskById(createdTask.id);

      expect(foundTask).toBeDefined();
      expect(foundTask!.id).toBe(createdTask.id);
      expect(foundTask!.title).toBe('Task da cercare');
      expect(foundTask!.displayId).toBe(createdTask.displayId);
    });

    it('ritorna undefined per UUID inesistente', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const foundTask = taskService.getTaskById('00000000-0000-0000-0000-000000000000');

      expect(foundTask).toBeUndefined();
    });
  });

  describe('updateTask', () => {
    it('aggiorna solo il titolo lasciando invariati gli altri campi', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const originalTask = taskService.createTask({
        title: 'Titolo originale',
        description: 'Descrizione originale',
        acceptanceCriteria: 'Criteri originali',
        priority: 'high',
      });

      const updatedTask = taskService.updateTask(originalTask.id, { title: 'Titolo modificato' });

      expect(updatedTask.title).toBe('Titolo modificato');
      expect(updatedTask.description).toBe('Descrizione originale');
      expect(updatedTask.acceptanceCriteria).toBe('Criteri originali');
      expect(updatedTask.priority).toBe('high');
      expect(updatedTask.status).toBe('backlog');
      expect(updatedTask.position).toBe(originalTask.position);
    });

    it('aggiorna solo la descrizione lasciando invariati gli altri campi', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const originalTask = taskService.createTask({ title: 'Task immutabile' });

      const updatedTask = taskService.updateTask(originalTask.id, { description: 'Nuova descrizione' });

      expect(updatedTask.title).toBe('Task immutabile');
      expect(updatedTask.description).toBe('Nuova descrizione');
    });

    it('aggiorna solo i criteri di accettazione', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const originalTask = taskService.createTask({ title: 'Task con criteri' });

      const updatedTask = taskService.updateTask(originalTask.id, {
        acceptanceCriteria: 'Nuovi criteri di accettazione',
      });

      expect(updatedTask.title).toBe('Task con criteri');
      expect(updatedTask.acceptanceCriteria).toBe('Nuovi criteri di accettazione');
    });

    it('aggiorna piu campi contemporaneamente', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const originalTask = taskService.createTask({ title: 'Task multiplo' });

      const updatedTask = taskService.updateTask(originalTask.id, {
        title: 'Titolo aggiornato',
        description: 'Descrizione aggiornata',
        acceptanceCriteria: 'Criteri aggiornati',
      });

      expect(updatedTask.title).toBe('Titolo aggiornato');
      expect(updatedTask.description).toBe('Descrizione aggiornata');
      expect(updatedTask.acceptanceCriteria).toBe('Criteri aggiornati');
    });

    it('imposta automaticamente updatedAt come stringa ISO valida', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const originalTask = taskService.createTask({ title: 'Task timestamp' });
      expect(originalTask.updatedAt).toBeNull();

      const updatedTask = taskService.updateTask(originalTask.id, { title: 'Aggiornato' });

      expect(updatedTask.updatedAt).not.toBeNull();
      expect(new Date(updatedTask.updatedAt!).toISOString()).toBe(updatedTask.updatedAt);
    });

    it('lancia errore se il task ID non esiste', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      expect(() =>
        taskService.updateTask('00000000-0000-0000-0000-000000000000', { title: 'Fantasma' }),
      ).toThrowError(/Task non trovato/);
    });
  });

  describe('deleteTask', () => {
    it('elimina un task e verifica che non esista piu nel database', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const createdTask = taskService.createTask({ title: 'Task da eliminare' });

      taskService.deleteTask(createdTask.id);

      const foundTask = taskService.getTaskById(createdTask.id);
      expect(foundTask).toBeUndefined();
    });

    it('restituisce i dati del task eliminato', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const createdTask = taskService.createTask({ title: 'Task restituito', priority: 'high' });

      const deletedTask = taskService.deleteTask(createdTask.id);

      expect(deletedTask.id).toBe(createdTask.id);
      expect(deletedTask.title).toBe('Task restituito');
      expect(deletedTask.priority).toBe('high');
      expect(deletedTask.displayId).toBe(createdTask.displayId);
    });

    it('lancia errore se il task ID non esiste', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      expect(() =>
        taskService.deleteTask('00000000-0000-0000-0000-000000000000'),
      ).toThrowError(/Task non trovato/);
    });

    it('non influenza gli altri task presenti nel database', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const taskToKeep1 = taskService.createTask({ title: 'Task che resta 1' });
      const taskToDelete = taskService.createTask({ title: 'Task da rimuovere' });
      const taskToKeep2 = taskService.createTask({ title: 'Task che resta 2' });

      taskService.deleteTask(taskToDelete.id);

      const allTasks = taskService.getAllTasks();
      expect(allTasks).toHaveLength(2);
      expect(allTasks.map((task) => task.id)).toContain(taskToKeep1.id);
      expect(allTasks.map((task) => task.id)).toContain(taskToKeep2.id);
      expect(allTasks.map((task) => task.id)).not.toContain(taskToDelete.id);
    });
  });

  describe('getTaskByDisplayId', () => {
    it('trova un task per displayId esatto', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const createdTask = taskService.createTask({ title: 'Task cercato' });

      const foundTask = taskService.getTaskByDisplayId(createdTask.displayId);

      expect(foundTask).toBeDefined();
      expect(foundTask!.id).toBe(createdTask.id);
      expect(foundTask!.title).toBe('Task cercato');
    });

    it('trova un task con confronto case-insensitive', () => {
      const { taskService } = createTemporaryProjectWithDatabase();
      const createdTask = taskService.createTask({ title: 'Task case test' });

      const foundWithLowerCase = taskService.getTaskByDisplayId('task-001');
      const foundWithUpperCase = taskService.getTaskByDisplayId('TASK-001');

      expect(foundWithLowerCase).toBeDefined();
      expect(foundWithLowerCase!.id).toBe(createdTask.id);
      expect(foundWithUpperCase).toBeDefined();
      expect(foundWithUpperCase!.id).toBe(createdTask.id);
    });

    it('ritorna undefined per displayId inesistente', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const foundTask = taskService.getTaskByDisplayId('TASK-999');

      expect(foundTask).toBeUndefined();
    });
  });

  describe('reorderTasksInColumn', () => {
    it('riordina 3 task nella colonna backlog e verifica le nuove posizioni', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const taskA = taskService.createTask({ title: 'Task A' });
      const taskB = taskService.createTask({ title: 'Task B' });
      const taskC = taskService.createTask({ title: 'Task C' });

      // Riordina: C, A, B
      taskService.reorderTasksInColumn([taskC.id, taskA.id, taskB.id], 'backlog');

      const reorderedTasks = taskService.getTasksByStatus('backlog');
      expect(reorderedTasks[0].id).toBe(taskC.id);
      expect(reorderedTasks[0].position).toBe(0);
      expect(reorderedTasks[1].id).toBe(taskA.id);
      expect(reorderedTasks[1].position).toBe(1);
      expect(reorderedTasks[2].id).toBe(taskB.id);
      expect(reorderedTasks[2].position).toBe(2);
    });

    it('imposta updatedAt su tutti i task riordinati', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const taskA = taskService.createTask({ title: 'Task A' });
      const taskB = taskService.createTask({ title: 'Task B' });
      expect(taskA.updatedAt).toBeNull();
      expect(taskB.updatedAt).toBeNull();

      taskService.reorderTasksInColumn([taskB.id, taskA.id], 'backlog');

      const updatedA = taskService.getTaskById(taskA.id)!;
      const updatedB = taskService.getTaskById(taskB.id)!;
      expect(updatedA.updatedAt).not.toBeNull();
      expect(updatedB.updatedAt).not.toBeNull();
      expect(new Date(updatedA.updatedAt!).toISOString()).toBe(updatedA.updatedAt);
    });

    it('lancia errore se un task ID non esiste', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const taskA = taskService.createTask({ title: 'Task A' });

      expect(() =>
        taskService.reorderTasksInColumn(
          [taskA.id, '00000000-0000-0000-0000-000000000000'],
          'backlog',
        ),
      ).toThrowError(/Task non trovato/);
    });

    it('lancia errore se un task appartiene a una colonna diversa', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const backlogTask = taskService.createTask({ title: 'Backlog Task' });
      const inProgressTask = taskService.createTask({ title: 'In Progress Task', status: 'in-progress' });

      expect(() =>
        taskService.reorderTasksInColumn([backlogTask.id, inProgressTask.id], 'backlog'),
      ).toThrowError(/appartiene alla colonna/);
    });

    it('non modifica nulla se la validazione fallisce (nessun aggiornamento parziale)', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const taskA = taskService.createTask({ title: 'Task A' });
      const taskB = taskService.createTask({ title: 'Task B' });
      const originalPositionA = taskA.position;
      const originalPositionB = taskB.position;

      expect(() =>
        taskService.reorderTasksInColumn(
          [taskB.id, taskA.id, '00000000-0000-0000-0000-000000000000'],
          'backlog',
        ),
      ).toThrowError(/Task non trovato/);

      // Le posizioni originali non devono essere state modificate
      const unchangedA = taskService.getTaskById(taskA.id)!;
      const unchangedB = taskService.getTaskById(taskB.id)!;
      expect(unchangedA.position).toBe(originalPositionA);
      expect(unchangedB.position).toBe(originalPositionB);
      expect(unchangedA.updatedAt).toBeNull();
      expect(unchangedB.updatedAt).toBeNull();
    });

    it('riordina correttamente 5+ task e preserva ordine nelle query successive', () => {
      const { taskService } = createTemporaryProjectWithDatabase();

      const tasks = [];
      for (let index = 0; index < 6; index++) {
        tasks.push(taskService.createTask({ title: `Task ${index}` }));
      }

      // Riordina in ordine inverso
      const reversedIds = tasks.map((task) => task.id).reverse();
      taskService.reorderTasksInColumn(reversedIds, 'backlog');

      // Verifica con getTasksByStatus
      const reorderedByStatus = taskService.getTasksByStatus('backlog');
      expect(reorderedByStatus).toHaveLength(6);
      for (let index = 0; index < 6; index++) {
        expect(reorderedByStatus[index].id).toBe(reversedIds[index]);
        expect(reorderedByStatus[index].position).toBe(index);
      }

      // Verifica con getAllTasks
      const allTasks = taskService.getAllTasks();
      expect(allTasks).toHaveLength(6);
      for (let index = 0; index < 6; index++) {
        expect(allTasks[index].id).toBe(reversedIds[index]);
        expect(allTasks[index].position).toBe(index);
      }
    });
  });

  it('calcola posizioni indipendenti per colonna', () => {
    const { taskService } = createTemporaryProjectWithDatabase();

    const backlog1 = taskService.createTask({ title: 'BL1' });
    const inProgress1 = taskService.createTask({ title: 'IP1', status: 'in-progress' });
    const backlog2 = taskService.createTask({ title: 'BL2' });

    // Ogni colonna ha la sua numerazione posizione
    expect(backlog1.position).toBe(1);
    expect(inProgress1.position).toBe(1);
    expect(backlog2.position).toBe(2);
  });

  describe('dipendenze tra task', () => {
    describe('addDependency', () => {
      it('aggiunge una dipendenza tra due task', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const blockingTask = taskService.createTask({ title: 'Task bloccante' });
        const blockedTask = taskService.createTask({ title: 'Task bloccato' });

        taskService.addDependency(blockingTask.id, blockedTask.id);

        const blockers = taskService.getBlockingTasks(blockedTask.id);
        expect(blockers).toHaveLength(1);
        expect(blockers[0].id).toBe(blockingTask.id);
      });

      it('lancia errore per auto-dipendenza', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const task = taskService.createTask({ title: 'Task singolo' });

        expect(() => taskService.addDependency(task.id, task.id)).toThrowError(
          /non puo bloccare se stesso/,
        );
      });

      it('lancia errore se il task bloccante non esiste', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const task = taskService.createTask({ title: 'Task esistente' });

        expect(() =>
          taskService.addDependency('00000000-0000-0000-0000-000000000000', task.id),
        ).toThrowError(/Task bloccante non trovato/);
      });

      it('lancia errore se il task bloccato non esiste', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const task = taskService.createTask({ title: 'Task esistente' });

        expect(() =>
          taskService.addDependency(task.id, '00000000-0000-0000-0000-000000000000'),
        ).toThrowError(/Task bloccato non trovato/);
      });

      it('lancia errore per dipendenza duplicata', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const taskA = taskService.createTask({ title: 'Task A' });
        const taskB = taskService.createTask({ title: 'Task B' });

        taskService.addDependency(taskA.id, taskB.id);

        expect(() => taskService.addDependency(taskA.id, taskB.id)).toThrowError(
          /esiste gia/,
        );
      });
    });

    describe('removeDependency', () => {
      it('rimuove una dipendenza esistente', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const taskA = taskService.createTask({ title: 'Task A' });
        const taskB = taskService.createTask({ title: 'Task B' });

        taskService.addDependency(taskA.id, taskB.id);
        taskService.removeDependency(taskA.id, taskB.id);

        const blockers = taskService.getBlockingTasks(taskB.id);
        expect(blockers).toHaveLength(0);
      });

      it('lancia errore se la dipendenza non esiste', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const taskA = taskService.createTask({ title: 'Task A' });
        const taskB = taskService.createTask({ title: 'Task B' });

        expect(() => taskService.removeDependency(taskA.id, taskB.id)).toThrowError(
          /Dipendenza non trovata/,
        );
      });
    });

    describe('getBlockingTasks e getBlockedTasks', () => {
      it('restituisce i task bloccanti e bloccati correttamente', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const taskA = taskService.createTask({ title: 'Task A' });
        const taskB = taskService.createTask({ title: 'Task B' });
        const taskC = taskService.createTask({ title: 'Task C' });

        // A blocca B, A blocca C
        taskService.addDependency(taskA.id, taskB.id);
        taskService.addDependency(taskA.id, taskC.id);

        const blockedByA = taskService.getBlockedTasks(taskA.id);
        expect(blockedByA).toHaveLength(2);
        expect(blockedByA.map((t) => t.id)).toContain(taskB.id);
        expect(blockedByA.map((t) => t.id)).toContain(taskC.id);

        const blockersOfB = taskService.getBlockingTasks(taskB.id);
        expect(blockersOfB).toHaveLength(1);
        expect(blockersOfB[0].id).toBe(taskA.id);
      });

      it('restituisce array vuoto se non ci sono dipendenze', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const task = taskService.createTask({ title: 'Task solitario' });

        expect(taskService.getBlockingTasks(task.id)).toHaveLength(0);
        expect(taskService.getBlockedTasks(task.id)).toHaveLength(0);
      });
    });

    describe('getUncompletedBlockers e isTaskBlocked', () => {
      it('restituisce solo i bloccanti non completati', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const taskA = taskService.createTask({ title: 'Task A' });
        const taskB = taskService.createTask({ title: 'Task B' });
        const taskC = taskService.createTask({ title: 'Task C' });

        // A e B bloccano C
        taskService.addDependency(taskA.id, taskC.id);
        taskService.addDependency(taskB.id, taskC.id);

        // A e completato
        taskService.updateTask(taskA.id, { status: 'done' });

        const uncompleted = taskService.getUncompletedBlockers(taskC.id);
        expect(uncompleted).toHaveLength(1);
        expect(uncompleted[0].id).toBe(taskB.id);
        expect(taskService.isTaskBlocked(taskC.id)).toBe(true);
      });

      it('isTaskBlocked restituisce false se tutti i bloccanti sono done', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const taskA = taskService.createTask({ title: 'Task A' });
        const taskB = taskService.createTask({ title: 'Task B' });

        taskService.addDependency(taskA.id, taskB.id);
        taskService.updateTask(taskA.id, { status: 'done' });

        expect(taskService.isTaskBlocked(taskB.id)).toBe(false);
      });

      it('isTaskBlocked restituisce false se non ci sono dipendenze', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const task = taskService.createTask({ title: 'Task libero' });

        expect(taskService.isTaskBlocked(task.id)).toBe(false);
      });
    });

    describe('blocco spostamento in-progress', () => {
      it('impedisce lo spostamento a in-progress se il task e bloccato', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const blockingTask = taskService.createTask({ title: 'Task bloccante' });
        const blockedTask = taskService.createTask({ title: 'Task bloccato' });

        taskService.addDependency(blockingTask.id, blockedTask.id);

        expect(() =>
          taskService.updateTask(blockedTask.id, { status: 'in-progress' }),
        ).toThrowError(/bloccato dai seguenti task non completati/);
      });

      it('include i displayId dei bloccanti nel messaggio di errore', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const blockingTask = taskService.createTask({ title: 'Task bloccante' });
        const blockedTask = taskService.createTask({ title: 'Task bloccato' });

        taskService.addDependency(blockingTask.id, blockedTask.id);

        expect(() =>
          taskService.updateTask(blockedTask.id, { status: 'in-progress' }),
        ).toThrowError(new RegExp(blockingTask.displayId));
      });

      it('consente lo spostamento a in-progress se tutti i bloccanti sono done', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const blockingTask = taskService.createTask({ title: 'Task bloccante' });
        const blockedTask = taskService.createTask({ title: 'Task bloccato' });

        taskService.addDependency(blockingTask.id, blockedTask.id);
        taskService.updateTask(blockingTask.id, { status: 'done' });

        const movedTask = taskService.updateTask(blockedTask.id, { status: 'in-progress' });
        expect(movedTask.status).toBe('in-progress');
      });

      it('consente lo spostamento a done anche se il task e bloccato', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const blockingTask = taskService.createTask({ title: 'Task bloccante' });
        const blockedTask = taskService.createTask({ title: 'Task bloccato' });

        taskService.addDependency(blockingTask.id, blockedTask.id);

        // Spostamento diretto a done deve essere permesso (non e in-progress)
        const movedTask = taskService.updateTask(blockedTask.id, { status: 'done' });
        expect(movedTask.status).toBe('done');
      });

      it('non blocca se il task e gia in-progress e viene aggiornato con altri campi', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const blockingTask = taskService.createTask({ title: 'Task bloccante', status: 'done' });
        const blockedTask = taskService.createTask({ title: 'Task bloccato' });

        taskService.addDependency(blockingTask.id, blockedTask.id);
        taskService.updateTask(blockedTask.id, { status: 'in-progress' });

        // Ora il bloccante torna a backlog, ma il task e gia in-progress
        taskService.updateTask(blockingTask.id, { status: 'backlog' });

        // Aggiornare il titolo del task gia in-progress non deve lanciare errore
        const updatedTask = taskService.updateTask(blockedTask.id, { title: 'Nuovo titolo' });
        expect(updatedTask.title).toBe('Nuovo titolo');
      });
    });

    describe('cascade delete', () => {
      it('rimuove le dipendenze quando un task viene eliminato', () => {
        const { taskService } = createTemporaryProjectWithDatabase();
        const taskA = taskService.createTask({ title: 'Task A' });
        const taskB = taskService.createTask({ title: 'Task B' });
        const taskC = taskService.createTask({ title: 'Task C' });

        // A blocca B, B blocca C
        taskService.addDependency(taskA.id, taskB.id);
        taskService.addDependency(taskB.id, taskC.id);

        // Eliminare B rimuove entrambe le dipendenze
        taskService.deleteTask(taskB.id);

        expect(taskService.getBlockingTasks(taskB.id)).toHaveLength(0);
        expect(taskService.getBlockedTasks(taskA.id)).toHaveLength(0);
        expect(taskService.getBlockingTasks(taskC.id)).toHaveLength(0);
      });
    });
  });
});
