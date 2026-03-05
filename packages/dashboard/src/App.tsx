import { useState, useEffect, useCallback } from 'react';
import type { Task } from './types.js';
import { getAllTasks, createTask } from './api/taskApi.js';
import { KanbanBoard } from './components/KanbanBoard.js';

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);

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

  const handleCreateTask = useCallback(async () => {
    const title = window.prompt('Inserisci il titolo del task:');
    if (title === null || title.trim().length === 0) {
      return;
    }
    try {
      await createTask(title.trim());
      await fetchTasks();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      window.alert(`Errore nella creazione: ${message}`);
    }
  }, [fetchTasks]);

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
          <KanbanBoard tasks={tasks} onCreateTask={() => void handleCreateTask()} />
        )}
      </main>
    </div>
  );
}
