import type { Task, TaskPriority } from '../types.js';

interface TaskCardProps {
  task: Task;
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

export function TaskCard({ task }: TaskCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
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
    </div>
  );
}
