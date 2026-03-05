import { useDrop } from "react-dnd";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { TaskCard, Task } from "./TaskCard";

interface KanbanColumnProps {
  title: string;
  status: "backlog" | "in-progress" | "done";
  tasks: Task[];
  dotColor: string;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: "backlog" | "in-progress" | "done") => void;
  onTaskDrop: (taskId: string, newStatus: "backlog" | "in-progress" | "done") => void;
}

export function KanbanColumn({
  title,
  status,
  tasks,
  dotColor,
  onTaskClick,
  onAddTask,
  onTaskDrop,
}: KanbanColumnProps) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: "TASK",
    drop: (item: { id: string; status: string }) => {
      if (item.status !== status) {
        onTaskDrop(item.id, status);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  return (
    <div
      ref={drop}
      className={`flex-1 min-w-[320px] bg-background rounded-lg border border-border transition-all duration-200 ${
        isOver ? "border-primary/50 bg-primary/5 scale-[1.02]" : ""
      }`}
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <h2 className="font-semibold">{title}</h2>
          <span className="text-sm text-muted-foreground">({tasks.length})</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onAddTask(status)}
          className="h-8 w-8"
          aria-label={`Add task to ${title}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-3 min-h-[200px]">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </div>
    </div>
  );
}
