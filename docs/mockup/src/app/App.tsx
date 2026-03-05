import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { KanbanBoard } from "./components/KanbanBoard";
import { CreateTaskModal } from "./components/CreateTaskModal";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { SettingsPage } from "./components/SettingsPage";
import { Task, TaskPriority } from "./components/TaskCard";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { AnimatePresence } from "motion/react";

function App() {
  const [currentView, setCurrentView] = useState<"board" | "settings">("board");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "1",
      displayId: "RB-1",
      title: "Implement user authentication",
      description: "Add JWT-based authentication with login and signup endpoints",
      acceptanceCriteria: "Users can register, login, and access protected routes",
      priority: "high",
      status: "in-progress",
      agentRunning: true,
      createdAt: new Date().toISOString(),
      agentLog: "Running authentication implementation...\nGenerating models...\nCreating API endpoints...",
      executionTime: 45,
    },
    {
      id: "2",
      displayId: "RB-2",
      title: "Design dashboard UI",
      description: "Create responsive dashboard with charts and metrics",
      acceptanceCriteria: "Dashboard displays key metrics and is mobile-responsive",
      priority: "medium",
      status: "backlog",
      agentRunning: false,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "3",
      displayId: "RB-3",
      title: "Setup CI/CD pipeline",
      description: "Configure GitHub Actions for automated testing and deployment",
      acceptanceCriteria: "Tests run on every PR, auto-deploy to staging on merge",
      priority: "high",
      status: "backlog",
      agentRunning: false,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: "4",
      displayId: "RB-4",
      title: "Add email notifications",
      description: "Implement email service for task updates and reminders",
      acceptanceCriteria: "Users receive emails for task assignments and deadlines",
      priority: "low",
      status: "done",
      agentRunning: false,
      createdAt: new Date(Date.now() - 259200000).toISOString(),
    },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<"backlog" | "in-progress" | "done">("backlog");
  const [taskCounter, setTaskCounter] = useState(5);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Keyboard shortcuts: Escape to close panels/modals, Cmd/Ctrl+K to create new task
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedTask) {
          setSelectedTask(null);
        } else if (isModalOpen) {
          setIsModalOpen(false);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModalDefaultStatus("backlog");
        setIsModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTask, isModalOpen]);

  const handleCreateTask = (taskData: {
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: TaskPriority;
    status: "backlog" | "in-progress" | "done";
  }) => {
    const newTask: Task = {
      id: String(taskCounter),
      displayId: `RB-${taskCounter}`,
      ...taskData,
      agentRunning: taskData.status === "in-progress",
      createdAt: new Date().toISOString(),
    };

    setTasks([...tasks, newTask]);
    setTaskCounter(taskCounter + 1);
    toast.success("Task creato con successo!");

    if (newTask.agentRunning) {
      setTimeout(() => {
        setTasks((prevTasks) =>
          prevTasks.map((t) =>
            t.id === newTask.id
              ? {
                  ...t,
                  agentLog: "Agent started...\nAnalyzing task requirements...\nGenerating code...",
                  executionTime: 0,
                }
              : t
          )
        );
      }, 1000);
    }
  };

  const handleTaskDrop = (taskId: string, newStatus: "backlog" | "in-progress" | "done") => {
    setTasks((prevTasks) =>
      prevTasks.map((task) => {
        if (task.id === taskId) {
          const shouldRunAgent = newStatus === "in-progress" && !task.agentRunning;
          
          if (shouldRunAgent) {
            setTimeout(() => {
              setTasks((currentTasks) =>
                currentTasks.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        agentLog: "Agent started...\nProcessing task...\nGenerating solution...",
                        executionTime: 0,
                      }
                    : t
                )
              );
            }, 500);
          }

          return {
            ...task,
            status: newStatus,
            agentRunning: shouldRunAgent || (newStatus === "in-progress" && task.agentRunning),
          };
        }
        return task;
      })
    );

    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    toast.success(`Task spostato in ${newStatus === "in-progress" ? "In Progress" : newStatus === "done" ? "Done" : "Backlog"}`);
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(tasks.filter((t) => t.id !== taskId));
    toast.success("Task eliminato");
  };

  const handleAddTask = (status: "backlog" | "in-progress" | "done") => {
    setModalDefaultStatus(status);
    setIsModalOpen(true);
  };

  const handleSaveSettings = (settings: any) => {
    console.log("Settings saved:", settings);
    toast.success("Configurazione salvata!");
  };

  return (
    <div className="h-screen flex bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          projectName="RepoBoard"
          onNewTask={() => {
            setModalDefaultStatus("backlog");
            setIsModalOpen(true);
          }}
          isDarkMode={isDarkMode}
          onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        />

        {currentView === "board" ? (
          <KanbanBoard
            tasks={tasks}
            onTaskClick={setSelectedTask}
            onAddTask={handleAddTask}
            onTaskDrop={handleTaskDrop}
          />
        ) : (
          <SettingsPage onSave={handleSaveSettings} />
        )}
      </div>

      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateTask={handleCreateTask}
        defaultStatus={modalDefaultStatus}
      />

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onDelete={handleDeleteTask}
            onMoveTask={handleTaskDrop}
          />
        )}
      </AnimatePresence>

      <Toaster position="top-right" />
    </div>
  );
}

export default App;
