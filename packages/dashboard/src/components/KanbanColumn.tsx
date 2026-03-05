import { Droppable } from '@hello-pangea/dnd';
import type { Task, TaskPriority, TaskStatus } from '../types.js';
import { TaskCard } from './TaskCard.js';

interface KanbanColumnProps {
  title: string;
  status: TaskStatus;
  tasks: Task[];
  colorClass: string;
  onDeleteTask?: (taskId: string) => void;
  onUpdatePriority?: (taskId: string, priority: TaskPriority) => void;
}

const EMPTY_STATE_MESSAGES: Record<TaskStatus, string> = {
  backlog: 'Nessun task in backlog',
  'in-progress': 'Nessun task in corso',
  done: 'Nessun task completato',
};

export function KanbanColumn({ title, status, tasks, colorClass, onDeleteTask, onUpdatePriority }: KanbanColumnProps) {
  return (
    <div className="flex min-w-[300px] flex-1 flex-col rounded-lg bg-muted/50 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-block h-3 w-3 rounded-full ${colorClass}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex flex-col gap-2 min-h-[100px] ${snapshot.isDraggingOver ? 'bg-primary/5 rounded-lg' : ''}`}
          >
            {tasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {EMPTY_STATE_MESSAGES[status]}
              </p>
            ) : (
              tasks.map((task, index) => <TaskCard key={task.id} task={task} index={index} onDeleteTask={onDeleteTask} onUpdatePriority={onUpdatePriority} />)
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
