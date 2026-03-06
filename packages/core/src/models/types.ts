export type TaskStatus = 'backlog' | 'in-progress' | 'done';

export type TaskPriority = 'high' | 'medium' | 'low';

export interface Agent {
  id: string;
  name: string;
  commandTemplate: string;
  workingDirectory: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateAgentInput {
  name: string;
  commandTemplate: string;
  workingDirectory?: string | null;
}

export interface UpdateAgentInput {
  name?: string;
  commandTemplate?: string;
  workingDirectory?: string | null;
}

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
  agentId: string | null;
  agentName: string | null;
  createdAt: string;
  updatedAt: string | null;
  executionTime: number | null;
  position: number;
}

export interface TaskDependency {
  blockingTaskId: string;
  blockedTaskId: string;
}

export interface TaskWithDependencies extends Task {
  /** Task che bloccano questo task (devono essere completati prima) */
  blockingTasks: Task[];
  /** Task che sono bloccati da questo task */
  blockedByTasks: Task[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  agentId?: string | null;
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
  agentId?: string | null;
  position?: number;
}

export interface Subtask {
  id: string;
  taskId: string;
  text: string;
  completed: boolean;
  position: number;
}

export interface CreateSubtaskInput {
  taskId: string;
  text: string;
}

export interface UpdateSubtaskInput {
  text?: string;
  completed?: boolean;
  position?: number;
}

export interface SubtaskProgress {
  total: number;
  completed: number;
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
  workingDirectory: string | null;
  agentEnvironmentVariables: Record<string, string>;
}

export interface ConfigurationFileError {
  filePath: string;
  message: string;
  lineNumber?: number;
  columnNumber?: number;
}
