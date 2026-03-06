import { useRef } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Loader2, Lock } from 'lucide-react';
import { Badge } from './ui/badge.js';
import type { Task, TaskPriority } from '../types.js';

const PRIORITY_CYCLE: Record<TaskPriority, TaskPriority> = {
  low: 'medium',
  medium: 'high',
  high: 'low',
};

interface TaskCardProps {
  task: Task;
  index: number;
  isBlocked?: boolean;
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

export function TaskCard({ task, index, isBlocked, onDeleteTask, onUpdatePriority, onTaskClick }: TaskCardProps) {
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
          className={`group relative bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-200 ${snapshot.isDragging ? 'opacity-50 rotate-2 scale-105' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`Task ${task.displayId}: ${task.title}`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onTaskClick?.(task);
            }
          }}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-muted-foreground">
                {task.displayId}
              </span>
              {isBlocked && (
                <Lock className="h-3.5 w-3.5 text-destructive" aria-label="Task bloccato da dipendenze" />
              )}
            </div>
            {task.agentRunning && (
              <Loader2 className="h-4 w-4 text-primary animate-spin" aria-label="Agent running" />
            )}
          </div>

          <h3 className="font-semibold mb-2 line-clamp-2">{task.title}</h3>

          <Badge
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
            className={`${PRIORITY_CLASSES[task.priority]} mb-3 cursor-pointer hover:opacity-80`}
            aria-label={`Cambia priorita task ${task.displayId} da ${PRIORITY_LABELS[task.priority]}`}
          >
            {PRIORITY_LABELS[task.priority]}
          </Badge>

          <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>

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
