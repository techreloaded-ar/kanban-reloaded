import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DropResult } from '@hello-pangea/dnd';
import { KanbanBoard } from './KanbanBoard.js';
import { createMockTask } from '../test-utils/mockHelpers.js';
import { createKanbanBoardProps } from '../test-utils/propFactories.js';
import type { Task } from '../types.js';

// Capture the onDragEnd handler passed to DragDropContext so we can invoke it in tests
let capturedOnDragEnd: ((result: DropResult) => void) | undefined;

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (result: DropResult) => void }) => {
    capturedOnDragEnd = onDragEnd;
    return <div data-testid="drag-drop-context">{children}</div>;
  },
  Droppable: ({ children, droppableId }: { children: (provided: unknown, snapshot: unknown) => React.ReactNode; droppableId: string }) => {
    const provided = {
      innerRef: vi.fn(),
      droppableProps: { 'data-rfd-droppable-id': droppableId },
      placeholder: null,
    };
    const snapshot = { isDraggingOver: false };
    return <div data-testid={`droppable-${droppableId}`}>{children(provided, snapshot)}</div>;
  },
  Draggable: ({ children, draggableId }: { children: (provided: unknown, snapshot: unknown) => React.ReactNode; draggableId: string }) => {
    const provided = {
      innerRef: vi.fn(),
      draggableProps: { 'data-rfd-draggable-id': draggableId },
      dragHandleProps: {},
    };
    const snapshot = { isDragging: false };
    return <div data-testid={`draggable-${draggableId}`}>{children(provided, snapshot)}</div>;
  },
}));

function createSampleTasks(): Task[] {
  return [
    createMockTask({ id: 'task-1', displayId: 'TASK-001', title: 'Backlog task one', status: 'backlog', position: 0 }),
    createMockTask({ id: 'task-2', displayId: 'TASK-002', title: 'Backlog task two', status: 'backlog', position: 1 }),
    createMockTask({ id: 'task-3', displayId: 'TASK-003', title: 'In progress task', status: 'in-progress', position: 0 }),
    createMockTask({ id: 'task-4', displayId: 'TASK-004', title: 'Done task one', status: 'done', position: 0 }),
    createMockTask({ id: 'task-5', displayId: 'TASK-005', title: 'Done task two', status: 'done', position: 1 }),
  ];
}

describe('KanbanBoard', () => {
  beforeEach(() => {
    capturedOnDragEnd = undefined;
  });

  describe('column rendering', () => {
    it('renders three columns with tasks grouped by status', () => {
      const tasks = createSampleTasks();
      const props = createKanbanBoardProps({ tasks });

      render(<KanbanBoard {...props} />);

      // All three droppable columns should be rendered
      expect(screen.getByTestId('droppable-backlog')).toBeInTheDocument();
      expect(screen.getByTestId('droppable-in-progress')).toBeInTheDocument();
      expect(screen.getByTestId('droppable-done')).toBeInTheDocument();

      // Tasks appear grouped in their columns
      expect(screen.getByText('Backlog task one')).toBeInTheDocument();
      expect(screen.getByText('Backlog task two')).toBeInTheDocument();
      expect(screen.getByText('In progress task')).toBeInTheDocument();
      expect(screen.getByText('Done task one')).toBeInTheDocument();
      expect(screen.getByText('Done task two')).toBeInTheDocument();
    });

    it('displays task count per column', () => {
      const tasks = createSampleTasks();
      const props = createKanbanBoardProps({ tasks });

      render(<KanbanBoard {...props} />);

      // KanbanColumn renders count as "(N)" in a span — 2 backlog, 1 in-progress, 2 done
      const countElements = screen.getAllByText(/^\(\d+\)$/);
      const counts = countElements.map((element) => element.textContent);
      expect(counts).toEqual(['(2)', '(1)', '(2)']);
    });
  });

  describe('filter tabs', () => {
    it('shows all columns when filter is "all" (Tutti)', () => {
      const tasks = createSampleTasks();
      const props = createKanbanBoardProps({ tasks });

      render(<KanbanBoard {...props} />);

      // Default filter is "all" — all three columns visible
      expect(screen.getByTestId('droppable-backlog')).toBeInTheDocument();
      expect(screen.getByTestId('droppable-in-progress')).toBeInTheDocument();
      expect(screen.getByTestId('droppable-done')).toBeInTheDocument();
    });

    it('shows only backlog column when "Backlog" filter is selected', () => {
      const tasks = createSampleTasks();
      const props = createKanbanBoardProps({ tasks });

      render(<KanbanBoard {...props} />);

      // "Backlog" appears in both the filter tab and the column header — pick the first (filter tab)
      fireEvent.click(screen.getAllByText('Backlog')[0]);

      expect(screen.getByTestId('droppable-backlog')).toBeInTheDocument();
      expect(screen.queryByTestId('droppable-in-progress')).not.toBeInTheDocument();
      expect(screen.queryByTestId('droppable-done')).not.toBeInTheDocument();
    });

    it('shows only in-progress column when "In Progress" filter is selected', () => {
      const tasks = createSampleTasks();
      const props = createKanbanBoardProps({ tasks });

      render(<KanbanBoard {...props} />);

      // "In Progress" appears in both the filter tab and the column header
      fireEvent.click(screen.getAllByText('In Progress')[0]);

      expect(screen.queryByTestId('droppable-backlog')).not.toBeInTheDocument();
      expect(screen.getByTestId('droppable-in-progress')).toBeInTheDocument();
      expect(screen.queryByTestId('droppable-done')).not.toBeInTheDocument();
    });

    it('shows only done column when "Done" filter is selected', () => {
      const tasks = createSampleTasks();
      const props = createKanbanBoardProps({ tasks });

      render(<KanbanBoard {...props} />);

      // "Done" appears in both the filter tab and the column header
      fireEvent.click(screen.getAllByText('Done')[0]);

      expect(screen.queryByTestId('droppable-backlog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('droppable-in-progress')).not.toBeInTheDocument();
      expect(screen.getByTestId('droppable-done')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when tasks array is empty and filter is "all"', () => {
      const props = createKanbanBoardProps({ tasks: [] });

      render(<KanbanBoard {...props} />);

      expect(screen.getByText('Nessun task presente')).toBeInTheDocument();
      expect(screen.getByText(/Clicca.*Crea Task.*per iniziare/)).toBeInTheDocument();

      // No columns should be rendered in empty state
      expect(screen.queryByTestId('droppable-backlog')).not.toBeInTheDocument();
    });
  });

  describe('drag and drop (onDragEnd)', () => {
    it('calls onReorderTasks with reordered IDs on same-column reorder', () => {
      const tasks = createSampleTasks();
      const onReorderTasks = vi.fn();
      const props = createKanbanBoardProps({ tasks, onReorderTasks });

      render(<KanbanBoard {...props} />);

      expect(capturedOnDragEnd).toBeDefined();

      // Simulate dragging the first backlog task (index 0) to index 1
      const dropResult: DropResult = {
        draggableId: 'task-1',
        type: 'DEFAULT',
        source: { droppableId: 'backlog', index: 0 },
        destination: { droppableId: 'backlog', index: 1 },
        reason: 'DROP',
        mode: 'FLUID',
        combine: null,
      };

      capturedOnDragEnd!(dropResult);

      expect(onReorderTasks).toHaveBeenCalledTimes(1);
      // After moving task-1 from index 0 to index 1, the order becomes [task-2, task-1]
      expect(onReorderTasks).toHaveBeenCalledWith(['task-2', 'task-1'], 'backlog');
    });

    it('calls onMoveTask with taskId, newStatus, and newPosition on cross-column move', () => {
      const tasks = createSampleTasks();
      const onMoveTask = vi.fn();
      const props = createKanbanBoardProps({ tasks, onMoveTask });

      render(<KanbanBoard {...props} />);

      expect(capturedOnDragEnd).toBeDefined();

      // Simulate dragging task-1 from backlog to in-progress at index 0
      const dropResult: DropResult = {
        draggableId: 'task-1',
        type: 'DEFAULT',
        source: { droppableId: 'backlog', index: 0 },
        destination: { droppableId: 'in-progress', index: 0 },
        reason: 'DROP',
        mode: 'FLUID',
        combine: null,
      };

      capturedOnDragEnd!(dropResult);

      expect(onMoveTask).toHaveBeenCalledTimes(1);
      expect(onMoveTask).toHaveBeenCalledWith('task-1', 'in-progress', 0);
    });

    it('does not invoke any callback when destination is null (drag cancelled)', () => {
      const tasks = createSampleTasks();
      const onMoveTask = vi.fn();
      const onReorderTasks = vi.fn();
      const props = createKanbanBoardProps({ tasks, onMoveTask, onReorderTasks });

      render(<KanbanBoard {...props} />);

      expect(capturedOnDragEnd).toBeDefined();

      const dropResult: DropResult = {
        draggableId: 'task-1',
        type: 'DEFAULT',
        source: { droppableId: 'backlog', index: 0 },
        destination: null,
        reason: 'DROP',
        mode: 'FLUID',
        combine: null,
      };

      capturedOnDragEnd!(dropResult);

      expect(onMoveTask).not.toHaveBeenCalled();
      expect(onReorderTasks).not.toHaveBeenCalled();
    });

    it('does not invoke any callback when dropped in the same position', () => {
      const tasks = createSampleTasks();
      const onMoveTask = vi.fn();
      const onReorderTasks = vi.fn();
      const props = createKanbanBoardProps({ tasks, onMoveTask, onReorderTasks });

      render(<KanbanBoard {...props} />);

      const dropResult: DropResult = {
        draggableId: 'task-1',
        type: 'DEFAULT',
        source: { droppableId: 'backlog', index: 0 },
        destination: { droppableId: 'backlog', index: 0 },
        reason: 'DROP',
        mode: 'FLUID',
        combine: null,
      };

      capturedOnDragEnd!(dropResult);

      expect(onMoveTask).not.toHaveBeenCalled();
      expect(onReorderTasks).not.toHaveBeenCalled();
    });
  });

  describe('create task button', () => {
    it('calls onCreateTask when "Crea Task" button is clicked', () => {
      const tasks = createSampleTasks();
      const onCreateTask = vi.fn();
      const props = createKanbanBoardProps({ tasks, onCreateTask });

      render(<KanbanBoard {...props} />);

      fireEvent.click(screen.getByText('Crea Task'));

      expect(onCreateTask).toHaveBeenCalledTimes(1);
      expect(onCreateTask).toHaveBeenCalledWith();
    });
  });
});
