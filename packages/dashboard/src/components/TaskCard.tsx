import { useRef } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import type { Task, TaskPriority } from '../types.js';

const PRIORITY_CYCLE: Record<TaskPriority, TaskPriority> = {
  low: 'medium',
  medium: 'high',
  high: 'low',
};

interface TaskCardProps {
  task: Task;
  index: number;
  onDeleteTask?: (taskId: string) => void;
  onUpdatePriority?: (taskId: string, priority: TaskPriority) => void;
  onTaskClick?: (task: Task) => void;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Bassa',
};

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-warning text-white',
  low: 'bg-info text-white',
};

const DRAG_THRESHOLD_PX = 5;

export function TaskCard({ task, index, onDeleteTask, onUpdatePriority, onTaskClick }: TaskCardProps) {
  const mouseDownPosition = useRef<{ x: number; y: number } | null>(null);

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onMouseDown={(event) => {
            mouseDownPosition.current = { x: event.clientX, y: event.clientY };
          }}
          onClick={(event) => {
            if (snapshot.isDragging) return;
            if (mouseDownPosition.current !== null) {
              const deltaX = Math.abs(event.clientX - mouseDownPosition.current.x);
              const deltaY = Math.abs(event.clientY - mouseDownPosition.current.y);
              if (deltaX > DRAG_THRESHOLD_PX || deltaY > DRAG_THRESHOLD_PX) return;
            }
            onTaskClick?.(task);
          }}
          className={`group relative cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50 hover:shadow-md ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              {task.displayId}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onUpdatePriority?.(task.id, PRIORITY_CYCLE[task.priority]);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.stopPropagation();
                  event.preventDefault();
                  onUpdatePriority?.(task.id, PRIORITY_CYCLE[task.priority]);
                }
              }}
              className={`cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-80 ${PRIORITY_CLASSES[task.priority]}`}
              aria-label={`Cambia priorita task ${task.displayId} da ${PRIORITY_LABELS[task.priority]}`}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
          </div>
          <p className="text-sm font-medium text-card-foreground">{task.title}</p>
          {onDeleteTask && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDeleteTask(task.id);
              }}
              className="absolute bottom-2 right-2 hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
              aria-label={`Elimina task ${task.displayId}`}
              title="Elimina task"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
        </div>
      )}
    </Draggable>
  );
}
