import { useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { KanbanColumn } from "./KanbanColumn";
import { Task } from "./TaskCard";
import { Button } from "./ui/button";
import { FileText, Plus } from "lucide-react";
import { motion } from "motion/react";

interface KanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: "backlog" | "in-progress" | "done") => void;
  onTaskDrop: (taskId: string, newStatus: "backlog" | "in-progress" | "done") => void;
}

type FilterTab = "all" | "backlog" | "in-progress" | "done";

export function KanbanBoard({ tasks, onTaskClick, onAddTask, onTaskDrop }: KanbanBoardProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const backlogTasks = tasks.filter((t) => t.status === "backlog");
  const inProgressTasks = tasks.filter((t) => t.status === "in-progress");
  const doneTasks = tasks.filter((t) => t.status === "done");

  const filteredTasks = {
    backlog: activeFilter === "all" || activeFilter === "backlog" ? backlogTasks : [],
    "in-progress": activeFilter === "all" || activeFilter === "in-progress" ? inProgressTasks : [],
    done: activeFilter === "all" || activeFilter === "done" ? doneTasks : [],
  };

  const showEmptyState = tasks.length === 0;

  return (
    <DndProvider backend={HTML5Backend}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 overflow-auto p-6"
      >
        <div className="mb-6 flex items-center gap-2">
          <Button
            variant={activeFilter === "all" ? "default" : "outline"}
            onClick={() => setActiveFilter("all")}
            className={activeFilter === "all" ? "bg-primary hover:bg-primary/90" : ""}
          >
            Tutti
          </Button>
          <Button
            variant={activeFilter === "backlog" ? "default" : "outline"}
            onClick={() => setActiveFilter("backlog")}
            className={activeFilter === "backlog" ? "bg-primary hover:bg-primary/90" : ""}
          >
            Backlog
          </Button>
          <Button
            variant={activeFilter === "in-progress" ? "default" : "outline"}
            onClick={() => setActiveFilter("in-progress")}
            className={activeFilter === "in-progress" ? "bg-primary hover:bg-primary/90" : ""}
          >
            In Progress
          </Button>
          <Button
            variant={activeFilter === "done" ? "default" : "outline"}
            onClick={() => setActiveFilter("done")}
            className={activeFilter === "done" ? "bg-primary hover:bg-primary/90" : ""}
          >
            Done
          </Button>
        </div>

        {showEmptyState ? (
          <div className="flex flex-col items-center justify-center h-[500px] text-center">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="mb-2">Nessun task presente</h2>
            <p className="text-muted-foreground mb-6">Crea il tuo primo task per iniziare</p>
            <Button onClick={() => onAddTask("backlog")} className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Crea Task
            </Button>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            <KanbanColumn
              title="Backlog"
              status="backlog"
              tasks={filteredTasks.backlog}
              dotColor="bg-info"
              onTaskClick={onTaskClick}
              onAddTask={onAddTask}
              onTaskDrop={onTaskDrop}
            />
            <KanbanColumn
              title="In Progress"
              status="in-progress"
              tasks={filteredTasks["in-progress"]}
              dotColor="bg-warning"
              onTaskClick={onTaskClick}
              onAddTask={onAddTask}
              onTaskDrop={onTaskDrop}
            />
            <KanbanColumn
              title="Done"
              status="done"
              tasks={filteredTasks.done}
              dotColor="bg-success"
              onTaskClick={onTaskClick}
              onAddTask={onAddTask}
              onTaskDrop={onTaskDrop}
            />
          </div>
        )}
      </motion.div>
    </DndProvider>
  );
}
