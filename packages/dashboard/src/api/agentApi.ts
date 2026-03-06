const API_BASE_URL = '/api';

export interface Agent {
  id: string;
  name: string;
  commandTemplate: string;
  workingDirectory: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateAgentPayload {
  name: string;
  commandTemplate: string;
  workingDirectory?: string | null;
}

export interface UpdateAgentPayload {
  name?: string;
  commandTemplate?: string;
  workingDirectory?: string | null;
}

export async function getAllAgents(): Promise<Agent[]> {
  const response = await fetch(`${API_BASE_URL}/agents`);
  if (!response.ok) {
    throw new Error('Errore nel caricamento degli agenti');
  }
  return response.json() as Promise<Agent[]>;
}

export async function createAgent(payload: CreateAgentPayload): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error: string };
    throw new Error(errorBody.error || 'Errore nella creazione dell\'agente');
  }
  return response.json() as Promise<Agent>;
}

export async function updateAgent(agentId: string, payload: UpdateAgentPayload): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error: string };
    throw new Error(errorBody.error || 'Errore nell\'aggiornamento dell\'agente');
  }
  return response.json() as Promise<Agent>;
}

export async function deleteAgent(agentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/agents/${agentId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error: string };
    throw new Error(errorBody.error || 'Errore nell\'eliminazione dell\'agente');
  }
}
