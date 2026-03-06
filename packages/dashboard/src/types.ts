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
  agentId: string | null;
  agentName: string | null;
  createdAt: string;
  executionTime: number | null;
  position: number;
}
