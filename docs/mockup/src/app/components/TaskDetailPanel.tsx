import { X, Trash2, Clock, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import { Task } from "./TaskCard";
import { motion } from "motion/react";

interface TaskDetailPanelProps {
  task: Task | null;
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, newStatus: "backlog" | "in-progress" | "done") => void;
}

const priorityConfig = {
  high: { label: "Alta", color: "bg-destructive text-destructive-foreground" },
  medium: { label: "Media", color: "bg-warning text-white" },
  low: { label: "Bassa", color: "bg-info text-white" },
};

const statusLabels = {
  backlog: "Backlog",
  "in-progress": "In Progress",
  done: "Done",
};

export function TaskDetailPanel({ task, onClose, onDelete, onMoveTask }: TaskDetailPanelProps) {
  if (!task) return null;

  const priorityStyle = priorityConfig[task.priority];

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 h-full w-[400px] bg-card border-l border-border shadow-2xl z-50"
    >
      <div className="flex flex-col h-full">
        <div className="p-6 border-b border-border">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-sm font-mono text-muted-foreground">{task.displayId}</span>
              <h2 className="font-semibold mt-1">{task.title}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className={priorityStyle.color}>{priorityStyle.label}</Badge>
            <Badge variant="outline">{statusLabels[task.status]}</Badge>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {new Date(task.createdAt).toLocaleDateString()}
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Descrizione</h3>
              <p className="text-sm text-muted-foreground">{task.description || "Nessuna descrizione"}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Criteri di Accettazione</h3>
              <p className="text-sm text-muted-foreground">
                {task.acceptanceCriteria || "Nessun criterio specificato"}
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Agent AI</h3>
                {task.agentRunning && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running
                  </div>
                )}
              </div>

              <div className="text-sm space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agent:</span>
                  <span>Claude Code</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span>{task.agentRunning ? "Running" : "Idle"}</span>
                </div>
                {task.executionTime && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tempo:</span>
                    <span>{task.executionTime}s</span>
                  </div>
                )}
              </div>

              {task.agentLog && (
                <div className="bg-background border border-border rounded-lg p-3 mt-3">
                  <div className="text-xs text-muted-foreground mb-2">Log Output:</div>
                  <ScrollArea className="h-32">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{task.agentLog}</pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 border-t border-border space-y-3">
          <div>
            <label className="text-sm font-medium mb-2 block">Sposta in</label>
            <Select value={task.status} onValueChange={(value) => onMoveTask(task.id, value as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              onDelete(task.id);
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina Task
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
