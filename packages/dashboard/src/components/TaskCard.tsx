import type { Task, TaskPriority } from '../types.js';

interface TaskCardProps {
  task: Task;
  onDeleteTask?: (taskId: string) => void;
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

export function TaskCard({ task, onDeleteTask }: TaskCardProps) {
  return (
    <div className="group relative rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          {task.displayId}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_CLASSES[task.priority]}`}
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
  );
}
