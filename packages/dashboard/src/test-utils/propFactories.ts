import { vi } from 'vitest';
import type { Task, TaskPriority, TaskStatus } from '../types.js';
import type { SubtaskProgress } from '../api/taskApi.js';
import type { Agent } from '../api/agentApi.js';
import { createMockTask, createMockAgent } from './mockHelpers.js';

// ─── KanbanBoard ────────────────────────────────────────────

export interface KanbanBoardTestProps {
  tasks: Task[];
  blockedTaskIds?: Set<string>;
  subtaskProgressMap?: Map<string, SubtaskProgress>;
  onCreateTask: (status?: TaskStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdatePriority?: (taskId: string, priority: TaskPriority) => void;
  onMoveTask?: (taskId: string, newStatus: TaskStatus, newPosition: number) => void;
  onReorderTasks?: (taskIds: string[], status: TaskStatus) => void;
  onTaskClick?: (task: Task) => void;
}

export function createKanbanBoardProps(
  overrides: Partial<KanbanBoardTestProps> = {},
): KanbanBoardTestProps {
  return {
    tasks: [],
    onCreateTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onUpdatePriority: vi.fn(),
    onMoveTask: vi.fn(),
    onReorderTasks: vi.fn(),
    onTaskClick: vi.fn(),
    ...overrides,
  };
}

// ─── TaskCard ───────────────────────────────────────────────

export interface TaskCardTestProps {
  task: Task;
  index: number;
  isBlocked?: boolean;
  subtaskProgress?: SubtaskProgress;
  onDeleteTask?: (taskId: string) => void;
  onUpdatePriority?: (taskId: string, priority: TaskPriority) => void;
  onTaskClick?: (task: Task) => void;
}

export function createTaskCardProps(
  overrides: Partial<TaskCardTestProps> = {},
): TaskCardTestProps {
  return {
    task: createMockTask(),
    index: 0,
    onDeleteTask: vi.fn(),
    onUpdatePriority: vi.fn(),
    onTaskClick: vi.fn(),
    ...overrides,
  };
}

// ─── TaskDetailPanel ────────────────────────────────────────

export interface TaskDetailPanelTestProps {
  task: Task | null;
  allTasks: Task[];
  availableAgents?: Agent[];
  hasAgentConfigured?: boolean;
  agentLiveOutput?: string;
  displayMode?: 'drawer' | 'inline';
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onDependenciesChanged?: () => void;
  onSubtaskProgressChanged?: (taskId: string, progress: SubtaskProgress) => void;
  onNavigateToSettings?: () => void;
  onAgentAssigned?: (taskId: string, agentId: string | null) => void;
  onRetryAgentLaunch?: (taskId: string) => void;
}

export function createTaskDetailPanelProps(
  overrides: Partial<TaskDetailPanelTestProps> = {},
): TaskDetailPanelTestProps {
  return {
    task: createMockTask(),
    allTasks: [],
    availableAgents: [],
    hasAgentConfigured: true,
    displayMode: 'drawer',
    onClose: vi.fn(),
    onDelete: vi.fn(),
    onMoveTask: vi.fn(),
    onDependenciesChanged: vi.fn(),
    onSubtaskProgressChanged: vi.fn(),
    onNavigateToSettings: vi.fn(),
    onAgentAssigned: vi.fn(),
    onRetryAgentLaunch: vi.fn(),
    ...overrides,
  };
}

// ─── CreateTaskModal ────────────────────────────────────────

export interface CreateTaskModalTestProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (task: {
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: TaskPriority;
    agentId?: string | null;
  }) => Promise<void>;
  availableAgents?: Agent[];
}

export function createCreateTaskModalProps(
  overrides: Partial<CreateTaskModalTestProps> = {},
): CreateTaskModalTestProps {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onCreateTask: vi.fn().mockResolvedValue(undefined),
    availableAgents: [],
    ...overrides,
  };
}
