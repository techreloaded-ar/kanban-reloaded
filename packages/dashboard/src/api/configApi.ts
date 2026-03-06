const API_BASE_URL = '/api';

export interface AgentConfiguration {
  [agentName: string]: string;
}

export interface ColumnConfiguration {
  id: string;
  name: string;
  color: string;
}

export interface ProjectConfiguration {
  agentCommand: string | null;
  agents: AgentConfiguration;
  serverPort: number;
  columns: ColumnConfiguration[];
}

export async function getConfiguration(): Promise<ProjectConfiguration> {
  const response = await fetch(`${API_BASE_URL}/config`);
  if (!response.ok) {
    throw new Error('Errore nel caricamento della configurazione');
  }
  return response.json() as Promise<ProjectConfiguration>;
}

export async function updateConfiguration(
  updatedFields: Partial<ProjectConfiguration>,
): Promise<ProjectConfiguration> {
  const response = await fetch(`${API_BASE_URL}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedFields),
  });
  if (!response.ok) {
    const errorBody = await response.json() as { error: string };
    throw new Error(errorBody.error || 'Errore nel salvataggio della configurazione');
  }
  return response.json() as Promise<ProjectConfiguration>;
}
