import { useDrag } from "react-dnd";
import { Loader2 } from "lucide-react";
import { Badge } from "./ui/badge";

export type TaskPriority = "high" | "medium" | "low";

export interface Task {
  id: string;
  displayId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: TaskPriority;
  status: "backlog" | "in-progress" | "done";
  agentRunning: boolean;
  agentLog?: string;
  createdAt: string;
  executionTime?: number;
}

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

const priorityConfig = {
  high: { label: "Alta", color: "bg-destructive text-destructive-foreground" },
  medium: { label: "Media", color: "bg-warning text-white" },
  low: { label: "Bassa", color: "bg-info text-white" },
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "TASK",
    item: { id: task.id, status: task.status },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const priorityStyle = priorityConfig[task.priority];

  return (
    <div
      ref={drag}
      onClick={onClick}
      className={`bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-200 ${
        isDragging ? "opacity-50 rotate-2 scale-105" : ""
      }`}
      role="button"
      tabIndex={0}
      aria-label={`Task ${task.displayId}: ${task.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-mono text-muted-foreground">{task.displayId}</span>
        {task.agentRunning && (
          <Loader2 className="h-4 w-4 text-primary animate-spin" aria-label="Agent running" />
        )}
      </div>

      <h3 className="font-semibold mb-2 line-clamp-2">{task.title}</h3>

      <Badge className={`${priorityStyle.color} mb-3`}>{priorityStyle.label}</Badge>

      <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
    </div>
  );
}
