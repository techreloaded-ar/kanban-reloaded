import { Droppable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import type { Task, TaskPriority, TaskStatus } from '../types.js';
import type { SubtaskProgress } from '../api/taskApi.js';
import { Button } from './ui/button.js';
import { TaskCard } from './TaskCard.js';

interface KanbanColumnProps {
  title: string;
  status: TaskStatus;
  tasks: Task[];
  colorClass: string;
  blockedTaskIds?: Set<string>;
  subtaskProgressMap?: Map<string, SubtaskProgress>;
  onDeleteTask?: (taskId: string) => void;
  onUpdatePriority?: (taskId: string, priority: TaskPriority) => void;
  onTaskClick?: (task: Task) => void;
  onCreateTask?: (status: TaskStatus) => void;
}

const EMPTY_STATE_MESSAGES: Record<TaskStatus, string> = {
  backlog: 'Nessun task in backlog',
  'in-progress': 'Nessun task in corso',
  done: 'Nessun task completato',
};

export function KanbanColumn({ title, status, tasks, colorClass, blockedTaskIds, subtaskProgressMap, onDeleteTask, onUpdatePriority, onTaskClick, onCreateTask }: KanbanColumnProps) {
  return (
    <Droppable droppableId={status}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`flex-1 min-w-[320px] flex flex-col bg-background rounded-lg border border-border transition-all duration-200 ${
            snapshot.isDraggingOver ? 'border-primary/50 bg-primary/5 scale-[1.02]' : ''
          }`}
        >
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${colorClass}`} />
              <h2 className="font-semibold">{title}</h2>
              <span className="text-sm text-muted-foreground">({tasks.length})</span>
            </div>
            {onCreateTask && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCreateTask(status)}
                className="h-8 w-8"
                aria-label={`Add task to ${title}`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="p-4 space-y-3 min-h-[200px] flex-1 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {EMPTY_STATE_MESSAGES[status]}
              </p>
            ) : (
              tasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  isBlocked={blockedTaskIds?.has(task.id)}
                  subtaskProgress={subtaskProgressMap?.get(task.id)}
                  onDeleteTask={onDeleteTask}
                  onUpdatePriority={onUpdatePriority}
                  onTaskClick={onTaskClick}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}
