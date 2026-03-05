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
  createdAt: string;
  executionTime: number | null;
  position: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
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
  position?: number;
}

export interface ColumnConfiguration {
  id: string;
  name: string;
  color: string;
}

export interface ProjectConfiguration {
  agentCommand: string | null;
  serverPort: number;
  columns: ColumnConfiguration[];
}

export interface ConfigurationFileError {
  filePath: string;
  message: string;
  lineNumber?: number;
  columnNumber?: number;
}
