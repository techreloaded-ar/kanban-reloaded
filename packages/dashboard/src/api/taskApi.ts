import type { Task } from '../types.js';

const API_BASE_URL = '/api';

export async function getAllTasks(): Promise<Task[]> {
  const response = await fetch(`${API_BASE_URL}/tasks`);
  if (!response.ok) {
    throw new Error(`Errore nel caricamento dei task: ${response.statusText}`);
  }
  return response.json() as Promise<Task[]>;
}

export async function createTask(title: string): Promise<Task> {
  const response = await fetch(`${API_BASE_URL}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(`Errore nella creazione del task: ${response.statusText}`);
  }
  return response.json() as Promise<Task>;
}
