export type TaskStatus = 'backlog' | 'in-progress' | 'done';

export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  displayId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: TaskPriority;
  status: TaskStatus;
  agentRunning: boolean;
  agentLog: string | null;
  agent: string | null;
  createdAt: string;
  updatedAt: string | null;
  executionTime: number | null;
  position: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  agent?: string | null;
  position?: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  agentRunning?: boolean;
  agentLog?: string | null;
  executionTime?: number | null;
  agent?: string | null;
  position?: number;
}

/**
 * Mappa nome agent -> template comando.
 * Es. { "feature": "claude --prompt '{{title}}'", "bugfix": "aider --message '{{description}}'" }
 */
export type AgentConfiguration = Record<string, string>;

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

export interface ConfigurationFileError {
  filePath: string;
  message: string;
  lineNumber?: number;
  columnNumber?: number;
}
