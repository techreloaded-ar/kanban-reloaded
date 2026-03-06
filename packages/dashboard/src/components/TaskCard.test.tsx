import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TaskCard } from './TaskCard.js';
import { createTaskCardProps } from '../test-utils/propFactories.js';
import { createMockTask } from '../test-utils/mockHelpers.js';

vi.mock('@hello-pangea/dnd', () => ({
  Draggable: ({ children }: { children: (provided: unknown, snapshot: unknown) => React.ReactNode }) =>
    children(
      { innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} },
      { isDragging: false },
    ),
}));

describe('TaskCard', () => {
  describe('rendering', () => {
    it('renders task title and displayId', () => {
      const task = createMockTask({ title: 'Implement login', displayId: 'TASK-042' });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByText('TASK-042')).toBeInTheDocument();
      expect(screen.getByText('Implement login')).toBeInTheDocument();
    });

    it('renders task description', () => {
      const task = createMockTask({ description: 'Add OAuth support' });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByText('Add OAuth support')).toBeInTheDocument();
    });
  });

  describe('priority badge', () => {
    it('shows "Alta" for high priority', () => {
      const task = createMockTask({ priority: 'high' });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByText('Alta')).toBeInTheDocument();
    });

    it('shows "Media" for medium priority', () => {
      const task = createMockTask({ priority: 'medium' });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByText('Media')).toBeInTheDocument();
    });

    it('shows "Bassa" for low priority', () => {
      const task = createMockTask({ priority: 'low' });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByText('Bassa')).toBeInTheDocument();
    });

    it('cycles priority low -> medium -> high -> low on click', async () => {
      const user = userEvent.setup();
      const onUpdatePriority = vi.fn();
      const task = createMockTask({ id: 'task-1', priority: 'low' });
      render(<TaskCard {...createTaskCardProps({ task, onUpdatePriority })} />);

      await user.click(screen.getByText('Bassa'));
      expect(onUpdatePriority).toHaveBeenCalledWith('task-1', 'medium');
    });

    it('cycles priority medium -> high on click', async () => {
      const user = userEvent.setup();
      const onUpdatePriority = vi.fn();
      const task = createMockTask({ id: 'task-1', priority: 'medium' });
      render(<TaskCard {...createTaskCardProps({ task, onUpdatePriority })} />);

      await user.click(screen.getByText('Media'));
      expect(onUpdatePriority).toHaveBeenCalledWith('task-1', 'high');
    });

    it('cycles priority high -> low on click', async () => {
      const user = userEvent.setup();
      const onUpdatePriority = vi.fn();
      const task = createMockTask({ id: 'task-1', priority: 'high' });
      render(<TaskCard {...createTaskCardProps({ task, onUpdatePriority })} />);

      await user.click(screen.getByText('Alta'));
      expect(onUpdatePriority).toHaveBeenCalledWith('task-1', 'low');
    });
  });

  describe('delete button', () => {
    it('is hidden when agentRunning is true', () => {
      const task = createMockTask({ agentRunning: true });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.queryByLabelText(/Elimina task/)).not.toBeInTheDocument();
    });

    it('is visible when agentRunning is false and calls onDeleteTask', async () => {
      const user = userEvent.setup();
      const onDeleteTask = vi.fn();
      const task = createMockTask({ id: 'task-del', agentRunning: false, displayId: 'TASK-099' });
      render(<TaskCard {...createTaskCardProps({ task, onDeleteTask })} />);

      const deleteButton = screen.getByLabelText('Elimina task TASK-099');
      expect(deleteButton).toBeInTheDocument();
      await user.click(deleteButton);
      expect(onDeleteTask).toHaveBeenCalledWith('task-del');
    });
  });

  describe('agent status icons', () => {
    it('shows spinner when agentRunning is true', () => {
      const task = createMockTask({ agentRunning: true });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByLabelText('Agent in esecuzione')).toBeInTheDocument();
    });

    it('shows checkmark when done with executionTime', () => {
      const task = createMockTask({ status: 'done', agentRunning: false, executionTime: 1234, agentLog: null });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByLabelText('Agent completato')).toBeInTheDocument();
    });

    it('shows error icon when in-progress with agentLog and not running', () => {
      const task = createMockTask({
        status: 'in-progress',
        agentRunning: false,
        agentLog: 'some error output',
        executionTime: null,
      });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByLabelText('Agent terminato con errore')).toBeInTheDocument();
    });

    it('shows terminal icon when agentLog is present but task is not in-progress or done with time', () => {
      const task = createMockTask({
        status: 'backlog',
        agentRunning: false,
        agentLog: 'previous log',
        executionTime: null,
      });
      render(<TaskCard {...createTaskCardProps({ task })} />);

      expect(screen.getByLabelText('Log agent disponibile')).toBeInTheDocument();
    });
  });

  describe('subtask progress bar', () => {
    it('renders progress bar with correct width', () => {
      const task = createMockTask();
      const subtaskProgress = { completed: 3, total: 10 };
      render(<TaskCard {...createTaskCardProps({ task, subtaskProgress })} />);

      expect(screen.getByText('3/10')).toBeInTheDocument();
    });

    it('is hidden when total is 0', () => {
      const task = createMockTask();
      const subtaskProgress = { completed: 0, total: 0 };
      render(<TaskCard {...createTaskCardProps({ task, subtaskProgress })} />);

      expect(screen.queryByText('0/0')).not.toBeInTheDocument();
    });
  });

  describe('click and keyboard interactions', () => {
    it('calls onTaskClick when card is clicked', async () => {
      const user = userEvent.setup();
      const onTaskClick = vi.fn();
      const task = createMockTask({ displayId: 'TASK-010', title: 'Click me' });
      render(<TaskCard {...createTaskCardProps({ task, onTaskClick })} />);

      await user.click(screen.getByRole('button', { name: /Task TASK-010/ }));
      expect(onTaskClick).toHaveBeenCalledWith(task);
    });

    it('calls onTaskClick on Enter key press', async () => {
      const user = userEvent.setup();
      const onTaskClick = vi.fn();
      const task = createMockTask();
      render(<TaskCard {...createTaskCardProps({ task, onTaskClick })} />);

      const card = screen.getByRole('button', { name: /Task TASK-001/ });
      card.focus();
      await user.keyboard('{Enter}');
      expect(onTaskClick).toHaveBeenCalledWith(task);
    });

    it('calls onTaskClick on Space key press', async () => {
      const user = userEvent.setup();
      const onTaskClick = vi.fn();
      const task = createMockTask();
      render(<TaskCard {...createTaskCardProps({ task, onTaskClick })} />);

      const card = screen.getByRole('button', { name: /Task TASK-001/ });
      card.focus();
      await user.keyboard(' ');
      expect(onTaskClick).toHaveBeenCalledWith(task);
    });
  });

  describe('blocked state', () => {
    it('shows lock icon when isBlocked is true', () => {
      const task = createMockTask();
      render(<TaskCard {...createTaskCardProps({ task, isBlocked: true })} />);

      expect(screen.getByLabelText('Task bloccato da dipendenze')).toBeInTheDocument();
    });

    it('does not show lock icon when isBlocked is false', () => {
      const task = createMockTask();
      render(<TaskCard {...createTaskCardProps({ task, isBlocked: false })} />);

      expect(screen.queryByLabelText('Task bloccato da dipendenze')).not.toBeInTheDocument();
    });
  });
});
