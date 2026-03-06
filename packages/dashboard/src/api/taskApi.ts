import type { Task, TaskPriority, TaskStatus } from '../types.js';

const API_BASE_URL = '/api';

export interface CreateTaskPayload {
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
}

export async function getAllTasks(): Promise<Task[]> {
  const response = await fetch(`${API_BASE_URL}/tasks`);
  if (!response.ok) {
    throw new Error(`Errore nel caricamento dei task: ${response.statusText}`);
  }
  return response.json() as Promise<Task[]>;
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const response = await fetch(`${API_BASE_URL}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Errore nella creazione del task: ${response.statusText}`);
  }
  return response.json() as Promise<Task>;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  position?: number;
}

export async function updateTask(taskId: string, payload: UpdateTaskPayload): Promise<Task> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error: string };
    throw new Error(errorBody.error || `Errore nell'aggiornamento del task: ${response.statusText}`);
  }
  return response.json() as Promise<Task>;
}

export async function reorderTasks(taskIds: string[], status: TaskStatus): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/tasks/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskIds, status }),
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error: string };
    throw new Error(errorBody.error || `Errore nel riordinamento: ${response.statusText}`);
  }
}

export async function deleteTask(taskId: string, force?: boolean): Promise<Task> {
  const queryString = force ? '?force=true' : '';
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}${queryString}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error: string };
    throw new Error(errorBody.error || `Errore nell'eliminazione del task: ${response.statusText}`);
  }
  return response.json() as Promise<Task>;
}

// --- Dependency API functions ---

export interface TaskDependencies {
  blockingTasks: Task[];
  blockedByTasks: Task[];
}

export async function getTaskDependencies(taskId: string): Promise<TaskDependencies> {
  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/dependencies`);
  if (!response.ok) {
    throw new Error('Errore nel recupero delle dipendenze');
  }
  return response.json() as Promise<TaskDependencies>;
}

export async function addTaskDependency(blockedTaskId: string, blockingTaskId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/tasks/${blockedTaskId}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockingTaskId }),
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error?: string };
    throw new Error(errorBody.error || "Errore nell'aggiunta della dipendenza");
  }
}

export async function removeTaskDependency(blockedTaskId: string, blockingTaskId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/tasks/${blockedTaskId}/dependencies/${blockingTaskId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Errore nella rimozione della dipendenza');
  }
}
