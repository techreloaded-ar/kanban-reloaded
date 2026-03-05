import type { Task, TaskPriority } from '../types.js';

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
