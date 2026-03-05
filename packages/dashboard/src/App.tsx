import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Task, TaskPriority, TaskStatus } from './types.js';
import { getAllTasks, createTask, updateTask, deleteTask, reorderTasks } from './api/taskApi.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { KanbanBoard } from './components/KanbanBoard.js';
import { CreateTaskModal } from './components/CreateTaskModal.js';
import { ConnectionStatusIndicator } from './components/ConnectionStatusIndicator.js';
import { Sidebar } from './components/Sidebar.js';
import { TopBar } from './components/TopBar.js';
import { TaskDetailPanel } from './components/TaskDetailPanel.js';

function getInitialDarkMode(): boolean {
  const stored = localStorage.getItem('kanban-reloaded-dark-mode');
  if (stored !== null) {
    return stored === 'true';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'board' | 'settings'>('board');
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Derive selectedTask from tasks list — avoids stale state and infinite re-render loops
  const selectedTask = useMemo(() => {
    if (selectedTaskId === null) return null;
    return tasks.find(task => task.id === selectedTaskId) ?? null;
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('kanban-reloaded-dark-mode', String(isDarkMode));
  }, [isDarkMode]);

  const fetchTasks = useCallback(async () => {
    try {
      const loadedTasks = await getAllTasks();
      setTasks(loadedTasks);
      setLoadingError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      setLoadingError(message);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const handleWebSocketTaskEvent = useCallback(() => {
    // On any task event from WebSocket, refresh the full task list
    // to guarantee consistency with the server state
    void fetchTasks();
  }, [fetchTasks]);

  const handleWebSocketReconnect = useCallback(() => {
    // On reconnection, sync the board with current database state
    void fetchTasks();
  }, [fetchTasks]);

  const { connectionLost } = useWebSocket({
    onTaskEvent: handleWebSocketTaskEvent,
    onReconnect: handleWebSocketReconnect,
  });

  const handleCreateTask = useCallback(async (taskData: {
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: TaskPriority;
  }) => {
    await createTask({
      title: taskData.title,
      description: taskData.description || undefined,
      acceptanceCriteria: taskData.acceptanceCriteria || undefined,
      priority: taskData.priority,
    });
    await fetchTasks();
  }, [fetchTasks]);

  const handleUpdatePriority = useCallback(async (taskId: string, priority: TaskPriority) => {
    try {
      await updateTask(taskId, { priority });
      await fetchTasks();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nell'aggiornamento della priorita del task: ${message}`);
    }
  }, [fetchTasks]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await deleteTask(taskId);
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
      await fetchTasks();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nell'eliminazione del task: ${message}`);
    }
  }, [fetchTasks, selectedTaskId]);

  const handleMoveTask = useCallback(async (taskId: string, newStatus: TaskStatus, newPosition: number) => {
    const previousTasks = tasks;
    setTasks(currentTasks =>
      currentTasks.map(task =>
        task.id === taskId ? { ...task, status: newStatus, position: newPosition } : task
      )
    );

    try {
      await updateTask(taskId, { status: newStatus, position: newPosition });
      await fetchTasks();
    } catch (error: unknown) {
      setTasks(previousTasks);
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nello spostamento del task: ${message}`);
    }
  }, [tasks, fetchTasks]);

  const handleMoveTaskFromPanel = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    try {
      await updateTask(taskId, { status: newStatus });
      await fetchTasks();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nello spostamento del task: ${message}`);
    }
  }, [fetchTasks]);

  const handleReorderTasks = useCallback(async (taskIds: string[], status: TaskStatus) => {
    const previousTasks = tasks;
    setTasks(currentTasks => {
      return currentTasks.map(task => {
        const newIndex = taskIds.indexOf(task.id);
        if (newIndex !== -1) {
          return { ...task, position: newIndex };
        }
        return task;
      });
    });

    try {
      await reorderTasks(taskIds, status);
      await fetchTasks();
    } catch (error: unknown) {
      setTasks(previousTasks);
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nel riordinamento: ${message}`);
    }
  }, [tasks, fetchTasks]);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTaskId(task.id);
  }, []);

  const handleCloseDetailPanel = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setIsDarkMode(previous => !previous);
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <div className="flex flex-1 flex-col min-w-0">
        <TopBar
          projectName="Kanban Reloaded"
          onNewTask={() => setIsCreateModalOpen(true)}
          isDarkMode={isDarkMode}
          onToggleTheme={handleToggleTheme}
        />

        <main className="flex-1 overflow-auto p-6">
          <ConnectionStatusIndicator connectionLost={connectionLost} />

          {loadingError !== null ? (
            <div className="flex items-center justify-center p-8">
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center">
                <p className="text-sm font-medium text-destructive">
                  Errore di connessione
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{loadingError}</p>
                <button
                  onClick={() => void fetchTasks()}
                  className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  Riprova
                </button>
              </div>
            </div>
          ) : currentView === 'board' ? (
            <KanbanBoard
              tasks={tasks}
              onCreateTask={() => setIsCreateModalOpen(true)}
              onDeleteTask={(taskId) => void handleDeleteTask(taskId)}
              onUpdatePriority={(taskId, priority) => void handleUpdatePriority(taskId, priority)}
              onMoveTask={(taskId, newStatus, newPosition) => void handleMoveTask(taskId, newStatus, newPosition)}
              onReorderTasks={(taskIds, status) => void handleReorderTasks(taskIds, status)}
              onTaskClick={handleTaskClick}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Impostazioni (in arrivo)</p>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {selectedTask !== null && (
          <div
            key="task-detail-overlay"
            className="fixed inset-0 z-40 bg-black/20"
            onClick={handleCloseDetailPanel}
            aria-hidden="true"
          />
        )}
        {selectedTask !== null && (
          <TaskDetailPanel
            key="task-detail-panel"
            task={selectedTask}
            onClose={handleCloseDetailPanel}
            onDelete={(taskId) => void handleDeleteTask(taskId)}
            onMoveTask={handleMoveTaskFromPanel}
          />
        )}
      </AnimatePresence>

      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateTask={handleCreateTask}
      />
    </div>
  );
}
