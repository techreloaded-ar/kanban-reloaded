import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskPriority, TaskStatus } from './types.js';
import { getAllTasks, createTask, updateTask, deleteTask, reorderTasks } from './api/taskApi.js';
import { KanbanBoard } from './components/KanbanBoard.js';
import { CreateTaskModal } from './components/CreateTaskModal.js';

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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
      await fetchTasks();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nell'eliminazione del task: ${message}`);
    }
  }, [fetchTasks]);

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

  const handleReorderTasks = useCallback(async (taskIds: string[], status: TaskStatus) => {
    // Optimistic update
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

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">Kanban Reloaded</h1>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
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
        ) : (
          <KanbanBoard tasks={tasks} onCreateTask={() => setIsCreateModalOpen(true)} onDeleteTask={(taskId) => void handleDeleteTask(taskId)} onUpdatePriority={(taskId, priority) => void handleUpdatePriority(taskId, priority)} onMoveTask={(taskId, newStatus, newPosition) => void handleMoveTask(taskId, newStatus, newPosition)} onReorderTasks={(taskIds, status) => void handleReorderTasks(taskIds, status)} />
        )}
      </main>

      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateTask={handleCreateTask}
      />
    </div>
  );
}
