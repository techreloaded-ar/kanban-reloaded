import { useState, useCallback } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { Task, TaskPriority, TaskStatus } from '../types.js';
import { KanbanColumn } from './KanbanColumn.js';

interface KanbanBoardProps {
  tasks: Task[];
  onCreateTask: () => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdatePriority?: (taskId: string, priority: TaskPriority) => void;
  onMoveTask?: (taskId: string, newStatus: TaskStatus, newPosition: number) => void;
  onReorderTasks?: (taskIds: string[], status: TaskStatus) => void;
  onTaskClick?: (task: Task) => void;
}

type FilterOption = 'all' | TaskStatus;

const FILTER_TABS: { label: string; value: FilterOption }[] = [
  { label: 'Tutti', value: 'all' },
  { label: 'Backlog', value: 'backlog' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Done', value: 'done' },
];

const COLUMNS: { title: string; status: TaskStatus; colorClass: string }[] = [
  { title: 'Backlog', status: 'backlog', colorClass: 'bg-info' },
  { title: 'In Progress', status: 'in-progress', colorClass: 'bg-warning' },
  { title: 'Done', status: 'done', colorClass: 'bg-success' },
];

export function KanbanBoard({ tasks, onCreateTask, onDeleteTask, onUpdatePriority, onMoveTask, onReorderTasks, onTaskClick }: KanbanBoardProps) {
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');

  const handleDragEnd = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) {
      return;
    }

    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const sourceStatus = source.droppableId as TaskStatus;
    const destinationStatus = destination.droppableId as TaskStatus;

    if (sourceStatus === destinationStatus) {
      // Same-column reorder
      const columnTasks = tasks
        .filter(task => task.status === sourceStatus)
        .sort((a, b) => a.position - b.position);

      const reorderedTasks = [...columnTasks];
      const [movedTask] = reorderedTasks.splice(source.index, 1);
      reorderedTasks.splice(destination.index, 0, movedTask);

      const reorderedTaskIds = reorderedTasks.map(task => task.id);
      onReorderTasks?.(reorderedTaskIds, sourceStatus);
    } else {
      // Cross-column move
      onMoveTask?.(draggableId, destinationStatus, destination.index);
    }
  }, [tasks, onMoveTask, onReorderTasks]);

  const visibleColumns =
    activeFilter === 'all'
      ? COLUMNS
      : COLUMNS.filter((column) => column.status === activeFilter);

  const tasksByStatus = (status: TaskStatus): Task[] =>
    tasks.filter((task) => task.status === status);

  return (
    <div className="flex h-full flex-col">
      {/* Header con filtri e bottone creazione */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeFilter === tab.value
                  ? 'bg-card font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={onCreateTask}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Crea Task
        </button>
      </div>

      {/* Board con colonne */}
      {tasks.length === 0 && activeFilter === 'all' ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <svg
              className="mx-auto mb-3 text-muted-foreground"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <p className="text-lg font-medium text-muted-foreground">
              Nessun task presente
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clicca &quot;Crea Task&quot; per iniziare
            </p>
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex flex-1 gap-4 overflow-x-auto">
            {visibleColumns.map((column) => (
              <KanbanColumn
                key={column.status}
                title={column.title}
                status={column.status}
                tasks={tasksByStatus(column.status)}
                colorClass={column.colorClass}
                onDeleteTask={onDeleteTask}
                onUpdatePriority={onUpdatePriority}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
