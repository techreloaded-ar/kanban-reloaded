import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskDetailPanel } from './TaskDetailPanel.js';
import { createTaskDetailPanelProps } from '../test-utils/propFactories.js';
import { createMockTask } from '../test-utils/mockHelpers.js';
import type { TaskDependencies, SubtaskListResponse } from '../api/taskApi.js';
import type { Task } from '../types.js';

// --- ResizeObserver polyfill (required by @radix-ui/react-scroll-area in jsdom) ---

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// --- Mock the API module ---

const mockGetTaskDependencies = vi.fn<(taskId: string) => Promise<TaskDependencies>>();
const mockAddTaskDependency = vi.fn<(blockedTaskId: string, blockingTaskId: string) => Promise<void>>();
const mockRemoveTaskDependency = vi.fn<(blockedTaskId: string, blockingTaskId: string) => Promise<void>>();
const mockGetTaskSubtasks = vi.fn<(taskId: string) => Promise<SubtaskListResponse>>();
const mockCreateSubtask = vi.fn<(taskId: string, text: string) => Promise<unknown>>();
const mockToggleSubtask = vi.fn<(subtaskId: string) => Promise<unknown>>();
const mockDeleteSubtask = vi.fn<(subtaskId: string) => Promise<void>>();

vi.mock('../api/taskApi.js', () => ({
  getTaskDependencies: (...args: unknown[]) => mockGetTaskDependencies(...(args as [string])),
  addTaskDependency: (...args: unknown[]) => mockAddTaskDependency(...(args as [string, string])),
  removeTaskDependency: (...args: unknown[]) => mockRemoveTaskDependency(...(args as [string, string])),
  getTaskSubtasks: (...args: unknown[]) => mockGetTaskSubtasks(...(args as [string])),
  createSubtask: (...args: unknown[]) => mockCreateSubtask(...(args as [string, string])),
  toggleSubtask: (...args: unknown[]) => mockToggleSubtask(...(args as [string])),
  deleteSubtask: (...args: unknown[]) => mockDeleteSubtask(...(args as [string])),
}));

// --- Helpers ---

const emptyDependencies: TaskDependencies = {
  blockingTasks: [],
  blockedByTasks: [],
};

const emptySubtasks: SubtaskListResponse = {
  subtasks: [],
  progress: { total: 0, completed: 0 },
};

function setupDefaultApiMocks(overrides?: {
  dependencies?: TaskDependencies;
  subtasks?: SubtaskListResponse;
}) {
  mockGetTaskDependencies.mockResolvedValue(overrides?.dependencies ?? emptyDependencies);
  mockGetTaskSubtasks.mockResolvedValue(overrides?.subtasks ?? emptySubtasks);
  mockAddTaskDependency.mockResolvedValue(undefined);
  mockRemoveTaskDependency.mockResolvedValue(undefined);
  mockCreateSubtask.mockResolvedValue({ id: 'sub-new', taskId: 'task-1', text: 'new', completed: false, position: 0 });
  mockToggleSubtask.mockResolvedValue({ id: 'sub-1', taskId: 'task-1', text: 'done', completed: true, position: 0 });
  mockDeleteSubtask.mockResolvedValue(undefined);
}

// --- Tests ---

describe('TaskDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultApiMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // General rendering
  // ═══════════════════════════════════════════════════════════

  describe('general rendering', () => {
    it('renders nothing when task is null', () => {
      const { container } = render(
        <TaskDetailPanel {...createTaskDetailPanelProps({ task: null })} />,
      );
      expect(container.innerHTML).toBe('');
    });

    it('displays task displayId, title, and priority badge', async () => {
      const task = createMockTask({
        displayId: 'TASK-042',
        title: 'Implement feature',
        priority: 'high',
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('TASK-042')).toBeInTheDocument();
      expect(screen.getByText('Implement feature')).toBeInTheDocument();
      expect(screen.getByText('Alta')).toBeInTheDocument();
    });

    it('displays description text or fallback', async () => {
      const task = createMockTask({ description: 'A detailed description' });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('A detailed description')).toBeInTheDocument();
    });

    it('shows fallback when description is empty', async () => {
      const task = createMockTask({ description: '' });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('Nessuna descrizione')).toBeInTheDocument();
    });

    it('displays acceptance criteria or fallback', async () => {
      const task = createMockTask({ acceptanceCriteria: '' });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('Nessun criterio specificato')).toBeInTheDocument();
    });

    it('close button calls onClose', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ onClose })} />);

      await user.click(screen.getByLabelText('Close panel'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Subtask section
  // ═══════════════════════════════════════════════════════════

  describe('subtask section', () => {
    it('shows list of subtasks after loading', async () => {
      setupDefaultApiMocks({
        subtasks: {
          subtasks: [
            { id: 'sub-1', taskId: 't1', text: 'Write tests', completed: false, position: 0 },
            { id: 'sub-2', taskId: 't1', text: 'Code review', completed: true, position: 1 },
          ],
          progress: { total: 2, completed: 1 },
        },
      });

      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('Write tests')).toBeInTheDocument();
        expect(screen.getByText('Code review')).toBeInTheDocument();
      });
    });

    it('shows empty state when no subtasks exist', async () => {
      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('Nessuna sotto-attivita')).toBeInTheDocument();
      });
    });

    it('shows progress count when subtasks exist', async () => {
      setupDefaultApiMocks({
        subtasks: {
          subtasks: [
            { id: 'sub-1', taskId: 't1', text: 'Task A', completed: true, position: 0 },
            { id: 'sub-2', taskId: 't1', text: 'Task B', completed: false, position: 1 },
          ],
          progress: { total: 2, completed: 1 },
        },
      });

      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('(1/2)')).toBeInTheDocument();
      });
    });

    it('adds a new subtask with trimmed text', async () => {
      const user = userEvent.setup();
      const task = createMockTask({ id: 'task-add-sub' });

      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Nuova sotto-attivita...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Nuova sotto-attivita...');
      await user.type(input, '  New subtask text  ');
      await user.click(screen.getByLabelText('Aggiungi sotto-attivita'));

      await waitFor(() => {
        expect(mockCreateSubtask).toHaveBeenCalledWith('task-add-sub', 'New subtask text');
      });
    });

    it('adds subtask on Enter key press', async () => {
      const user = userEvent.setup();
      const task = createMockTask({ id: 'task-enter' });

      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Nuova sotto-attivita...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Nuova sotto-attivita...');
      await user.type(input, 'Via Enter{Enter}');

      await waitFor(() => {
        expect(mockCreateSubtask).toHaveBeenCalledWith('task-enter', 'Via Enter');
      });
    });

    it('toggles subtask completion', async () => {
      const user = userEvent.setup();
      setupDefaultApiMocks({
        subtasks: {
          subtasks: [
            { id: 'sub-toggle', taskId: 't1', text: 'Toggle me', completed: false, position: 0 },
          ],
          progress: { total: 1, completed: 0 },
        },
      });

      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('Toggle me')).toBeInTheDocument();
      });

      const checkbox = screen.getByLabelText('Segna "Toggle me" come completata');
      await user.click(checkbox);

      await waitFor(() => {
        expect(mockToggleSubtask).toHaveBeenCalledWith('sub-toggle');
      });
    });

    it('deletes a subtask', async () => {
      const user = userEvent.setup();
      setupDefaultApiMocks({
        subtasks: {
          subtasks: [
            { id: 'sub-del', taskId: 't1', text: 'Delete me', completed: false, position: 0 },
          ],
          progress: { total: 1, completed: 0 },
        },
      });

      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('Delete me')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Elimina sotto-attivita "Delete me"'));

      await waitFor(() => {
        expect(mockDeleteSubtask).toHaveBeenCalledWith('sub-del');
      });
    });

    it('shows error message when subtask API fails', async () => {
      const user = userEvent.setup();
      mockCreateSubtask.mockRejectedValue(new Error('Network failure'));

      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Nuova sotto-attivita...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Nuova sotto-attivita...');
      await user.type(input, 'Will fail');
      await user.click(screen.getByLabelText('Aggiungi sotto-attivita'));

      await waitFor(() => {
        expect(screen.getByText('Network failure')).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Dependencies section
  // ═══════════════════════════════════════════════════════════

  describe('dependencies section', () => {
    it('shows blocking and blockedBy task lists', async () => {
      const blockingTask = createMockTask({ id: 'blocker', displayId: 'TASK-010', title: 'Blocker task' });
      const blockedTask = createMockTask({ id: 'blocked', displayId: 'TASK-020', title: 'Blocked task' });

      setupDefaultApiMocks({
        dependencies: {
          blockingTasks: [blockingTask],
          blockedByTasks: [blockedTask],
        },
      });

      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('TASK-010')).toBeInTheDocument();
        expect(screen.getByText('Blocker task')).toBeInTheDocument();
        expect(screen.getByText('TASK-020')).toBeInTheDocument();
        expect(screen.getByText('Blocked task')).toBeInTheDocument();
      });
    });

    it('shows empty state when no dependencies exist', async () => {
      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('Nessuna dipendenza')).toBeInTheDocument();
        expect(screen.getByText('Nessun task bloccato')).toBeInTheDocument();
      });
    });

    it('removes a blocking dependency', async () => {
      const user = userEvent.setup();
      const blockingTask = createMockTask({ id: 'blocker-rm', displayId: 'TASK-099', title: 'Remove me' });
      const mainTask = createMockTask({ id: 'main-task' });

      setupDefaultApiMocks({
        dependencies: {
          blockingTasks: [blockingTask],
          blockedByTasks: [],
        },
      });

      const onDependenciesChanged = vi.fn();
      render(
        <TaskDetailPanel
          {...createTaskDetailPanelProps({
            task: mainTask,
            onDependenciesChanged,
          })}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('TASK-099')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Rimuovi dipendenza da TASK-099'));

      await waitFor(() => {
        expect(mockRemoveTaskDependency).toHaveBeenCalledWith('main-task', 'blocker-rm');
      });
    });

    it('filters available tasks for dependency dropdown excluding self and already-linked', async () => {
      const mainTask = createMockTask({ id: 'self-task', displayId: 'TASK-001', title: 'Main' });
      const alreadyLinked = createMockTask({ id: 'linked', displayId: 'TASK-002', title: 'Already linked' });
      const available = createMockTask({ id: 'free-task', displayId: 'TASK-003', title: 'Available task' });

      setupDefaultApiMocks({
        dependencies: {
          blockingTasks: [alreadyLinked],
          blockedByTasks: [],
        },
      });

      render(
        <TaskDetailPanel
          {...createTaskDetailPanelProps({
            task: mainTask,
            allTasks: [mainTask, alreadyLinked, available],
          })}
        />,
      );

      // Wait for dependencies to load — the "Aggiungi dipendenza" select should appear
      // since there is at least one available task (TASK-003)
      await waitFor(() => {
        expect(screen.getByText('Aggiungi dipendenza')).toBeInTheDocument();
      });
    });

    it('hides add dependency section when no tasks are available', async () => {
      const mainTask = createMockTask({ id: 'only-task', displayId: 'TASK-001', title: 'Only one' });

      setupDefaultApiMocks({
        dependencies: emptyDependencies,
      });

      render(
        <TaskDetailPanel
          {...createTaskDetailPanelProps({
            task: mainTask,
            allTasks: [mainTask], // only self — nothing to add
          })}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Nessuna dipendenza')).toBeInTheDocument();
      });

      expect(screen.queryByText('Aggiungi dipendenza')).not.toBeInTheDocument();
    });

    it('shows dependency loading error', async () => {
      mockGetTaskDependencies.mockRejectedValue(new Error('Dependency fetch failed'));

      render(<TaskDetailPanel {...createTaskDetailPanelProps()} />);

      await waitFor(() => {
        expect(screen.getByText('Dependency fetch failed')).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Agent AI section
  // ═══════════════════════════════════════════════════════════

  describe('agent AI section', () => {
    it('shows "In esecuzione" indicators when agent is running', async () => {
      const task = createMockTask({ agentRunning: true });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      // "In esecuzione" appears both as header badge and status line value
      const matches = screen.getAllByText('In esecuzione');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('shows "Completato" when task is done with executionTime', async () => {
      const task = createMockTask({
        status: 'done',
        agentRunning: false,
        executionTime: 5000,
        agentLog: null,
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('Completato')).toBeInTheDocument();
    });

    it('shows "Errore" when in-progress with agentLog and not running', async () => {
      const task = createMockTask({
        status: 'in-progress',
        agentRunning: false,
        agentLog: 'error output here',
        executionTime: null,
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('Errore')).toBeInTheDocument();
    });

    it('shows no status indicator when agent is idle', async () => {
      const task = createMockTask({
        status: 'backlog',
        agentRunning: false,
        agentLog: null,
        executionTime: null,
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      // The status indicators should not be present
      expect(screen.queryByText('In esecuzione')).not.toBeInTheDocument();
      expect(screen.queryByText('Completato')).not.toBeInTheDocument();
      expect(screen.queryByText('Errore')).not.toBeInTheDocument();
    });

    it('shows "Rilancia Agent" button when in-progress with error log', async () => {
      const task = createMockTask({
        status: 'in-progress',
        agentRunning: false,
        agentLog: 'some error',
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('Rilancia Agent')).toBeInTheDocument();
    });

    it('shows "Avvia Agent" button when in-progress without prior log', async () => {
      const task = createMockTask({
        status: 'in-progress',
        agentRunning: false,
        agentLog: null,
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('Avvia Agent')).toBeInTheDocument();
    });

    it('calls onRetryAgentLaunch when retry button is clicked', async () => {
      const user = userEvent.setup();
      const onRetryAgentLaunch = vi.fn();
      const task = createMockTask({
        id: 'retry-task',
        status: 'in-progress',
        agentRunning: false,
        agentLog: 'previous error',
      });
      render(
        <TaskDetailPanel
          {...createTaskDetailPanelProps({ task, onRetryAgentLaunch })}
        />,
      );

      await user.click(screen.getByText('Rilancia Agent'));
      expect(onRetryAgentLaunch).toHaveBeenCalledWith('retry-task');
    });

    it('shows agent not configured message when hasAgentConfigured is false', () => {
      const task = createMockTask({ agentRunning: false });
      render(
        <TaskDetailPanel
          {...createTaskDetailPanelProps({ task, hasAgentConfigured: false })}
        />,
      );

      expect(screen.getByText(/Nessun agent configurato/)).toBeInTheDocument();
    });

    it('shows "Vai alle Impostazioni" when no agent configured and callback provided', async () => {
      const user = userEvent.setup();
      const onNavigateToSettings = vi.fn();
      const task = createMockTask({ agentRunning: false });
      render(
        <TaskDetailPanel
          {...createTaskDetailPanelProps({
            task,
            hasAgentConfigured: false,
            onNavigateToSettings,
          })}
        />,
      );

      await user.click(screen.getByText('Vai alle Impostazioni'));
      expect(onNavigateToSettings).toHaveBeenCalledOnce();
    });

    it('shows live output when agentLiveOutput is provided', () => {
      const task = createMockTask({ agentRunning: true });
      render(
        <TaskDetailPanel
          {...createTaskDetailPanelProps({
            task,
            agentLiveOutput: 'Running tests...\nAll passed!',
          })}
        />,
      );

      expect(screen.getByText('Output live:')).toBeInTheDocument();
      expect(screen.getByText(/Running tests/)).toBeInTheDocument();
    });

    it('shows saved agent log when agent is not running', () => {
      const task = createMockTask({
        agentRunning: false,
        agentLog: 'Completed successfully',
        status: 'done',
        executionTime: 3000,
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('Log Output:')).toBeInTheDocument();
      expect(screen.getByText('Completed successfully')).toBeInTheDocument();
    });

    it('displays execution time in seconds', () => {
      const task = createMockTask({
        status: 'done',
        agentRunning: false,
        executionTime: 12500,
        agentLog: null,
      });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      expect(screen.getByText('13s')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Status dropdown and delete
  // ═══════════════════════════════════════════════════════════

  describe('status change and delete', () => {
    it('shows current status in the move-to dropdown', () => {
      const task = createMockTask({ status: 'in-progress' });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task })} />);

      // The "Sposta in" label should be present
      expect(screen.getByText('Sposta in')).toBeInTheDocument();
    });

    it('delete button calls onDelete with task id', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      const task = createMockTask({ id: 'del-task-id' });
      render(<TaskDetailPanel {...createTaskDetailPanelProps({ task, onDelete })} />);

      await user.click(screen.getByText('Elimina Task'));
      expect(onDelete).toHaveBeenCalledWith('del-task-id');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // State reset on task change
  // ═══════════════════════════════════════════════════════════

  describe('state reset on task change', () => {
    it('fetches new dependencies and subtasks when task prop changes', async () => {
      const taskA = createMockTask({ id: 'task-a', displayId: 'TASK-A', title: 'Task A' });
      const taskB = createMockTask({ id: 'task-b', displayId: 'TASK-B', title: 'Task B' });

      const { rerender } = render(
        <TaskDetailPanel {...createTaskDetailPanelProps({ task: taskA })} />,
      );

      await waitFor(() => {
        expect(mockGetTaskDependencies).toHaveBeenCalledWith('task-a');
        expect(mockGetTaskSubtasks).toHaveBeenCalledWith('task-a');
      });

      rerender(
        <TaskDetailPanel {...createTaskDetailPanelProps({ task: taskB })} />,
      );

      await waitFor(() => {
        expect(mockGetTaskDependencies).toHaveBeenCalledWith('task-b');
        expect(mockGetTaskSubtasks).toHaveBeenCalledWith('task-b');
      });

      expect(screen.getByText('TASK-B')).toBeInTheDocument();
      expect(screen.getByText('Task B')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Display mode
  // ═══════════════════════════════════════════════════════════

  describe('display mode', () => {
    it('renders inline panel without motion animation wrapper', () => {
      const { container } = render(
        <TaskDetailPanel {...createTaskDetailPanelProps({ displayMode: 'inline' })} />,
      );

      // Inline mode renders a plain div with border-l, not a motion.div with fixed positioning
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.tagName).toBe('DIV');
      expect(wrapper.className).toContain('border-l');
      // Should NOT have fixed positioning (that's the drawer mode)
      expect(wrapper.className).not.toContain('fixed');
    });
  });
});
