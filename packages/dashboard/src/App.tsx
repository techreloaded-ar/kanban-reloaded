import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Task, TaskPriority, TaskStatus } from './types.js';
import { getAllTasks, createTask, updateTask, deleteTask, reorderTasks, getTaskDependencies, getTaskSubtasks } from './api/taskApi.js';
import type { SubtaskProgress } from './api/taskApi.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { KanbanBoard } from './components/KanbanBoard.js';
import { CreateTaskModal } from './components/CreateTaskModal.js';
import { ConnectionStatusIndicator } from './components/ConnectionStatusIndicator.js';
import { Sidebar } from './components/Sidebar.js';
import { TopBar } from './components/TopBar.js';
import { TaskDetailPanel } from './components/TaskDetailPanel.js';
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog.js';
import { SettingsPage } from './components/SettingsPage.js';
import { getConfiguration } from './api/configApi.js';
import { getAllAgents } from './api/agentApi.js';
import type { Agent } from './api/agentApi.js';

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
  const [blockedTaskIds, setBlockedTaskIds] = useState<Set<string>>(new Set());
  const [subtaskProgressMap, setSubtaskProgressMap] = useState<Map<string, SubtaskProgress>>(new Map());
  const [taskIdPendingDeletion, setTaskIdPendingDeletion] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [hasAgentConfigured, setHasAgentConfigured] = useState(true); // assume configured until loaded
  const [noAgentWarningVisible, setNoAgentWarningVisible] = useState(false);
  const lastDeleteTaskTitle = useRef('');

  // Counter to suppress WebSocket refreshes triggered by local drag-and-drop actions.
  // Incremented before an optimistic API call, decremented when the WebSocket event arrives.
  const pendingLocalActionsCount = useRef(0);

  // Derive selectedTask from tasks list — avoids stale state and infinite re-render loops
  const selectedTask = useMemo(() => {
    if (selectedTaskId === null) return null;
    return tasks.find(task => task.id === selectedTaskId) ?? null;
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('kanban-reloaded-dark-mode', String(isDarkMode));
  }, [isDarkMode]);

  const refreshBlockedTaskIds = useCallback(async (taskList: Task[]) => {
    const blocked = new Set<string>();
    // Fetch dependencies for each task in parallel; if an endpoint fails, skip silently
    const dependencyResults = await Promise.allSettled(
      taskList.map(async (task) => {
        const dependencies = await getTaskDependencies(task.id);
        return { taskId: task.id, blockingTasks: dependencies.blockingTasks };
      })
    );
    for (const result of dependencyResults) {
      if (result.status === 'fulfilled' && result.value.blockingTasks.length > 0) {
        blocked.add(result.value.taskId);
      }
    }
    setBlockedTaskIds(blocked);
  }, []);

  const refreshSubtaskProgress = useCallback(async (taskList: Task[]) => {
    const progressMap = new Map<string, SubtaskProgress>();
    const subtaskResults = await Promise.allSettled(
      taskList.map(async (task) => {
        const response = await getTaskSubtasks(task.id);
        return { taskId: task.id, progress: response.progress };
      })
    );
    for (const result of subtaskResults) {
      if (result.status === 'fulfilled' && result.value.progress.total > 0) {
        progressMap.set(result.value.taskId, result.value.progress);
      }
    }
    setSubtaskProgressMap(progressMap);
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const loadedTasks = await getAllTasks();
      setTasks(loadedTasks);
      setLoadingError(null);
      void refreshBlockedTaskIds(loadedTasks);
      void refreshSubtaskProgress(loadedTasks);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      setLoadingError(message);
    }
  }, [refreshBlockedTaskIds, refreshSubtaskProgress]);

  const refreshAvailableAgents = useCallback(async () => {
    try {
      const [config, agents] = await Promise.all([
        getConfiguration(),
        getAllAgents(),
      ]);
      setAvailableAgents(agents);
      const isAnyAgentConfigured = config.agentCommand !== null || agents.length > 0;
      setHasAgentConfigured(isAnyAgentConfigured);
    } catch {
      // Config/agent fetch failure is non-critical; agent list will be empty
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    void refreshAvailableAgents();
  }, [fetchTasks, refreshAvailableAgents]);

  const handleWebSocketTaskEvent = useCallback((event: { type: string }) => {
    // Only suppress WebSocket refreshes for event types that correspond
    // to local optimistic actions (move/reorder). Let other events
    // (task:created, task:deleted) through to avoid missing real updates.
    const isSuppressibleEventType = event.type === 'task:updated' || event.type === 'task:reordered';
    if (isSuppressibleEventType && pendingLocalActionsCount.current > 0) {
      pendingLocalActionsCount.current -= 1;
      return;
    }
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
    agentId?: string | null;
  }) => {
    await createTask({
      title: taskData.title,
      description: taskData.description || undefined,
      acceptanceCriteria: taskData.acceptanceCriteria || undefined,
      priority: taskData.priority,
      agentId: taskData.agentId || undefined,
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

  const requestDeleteTask = useCallback((taskId: string) => {
    const taskTitle = tasks.find(task => task.id === taskId)?.title ?? '';
    lastDeleteTaskTitle.current = taskTitle;
    setTaskIdPendingDeletion(taskId);
  }, [tasks]);

  const handleConfirmDelete = useCallback(async () => {
    if (taskIdPendingDeletion === null) return;
    const taskId = taskIdPendingDeletion;
    setTaskIdPendingDeletion(null);
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
  }, [fetchTasks, selectedTaskId, taskIdPendingDeletion]);

  const handleCancelDelete = useCallback(() => {
    setTaskIdPendingDeletion(null);
  }, []);

  const showNoAgentWarning = useCallback(() => {
    setNoAgentWarningVisible(true);
    setTimeout(() => setNoAgentWarningVisible(false), 5000);
  }, []);

  const handleMoveTask = useCallback(async (taskId: string, newStatus: TaskStatus, newPosition: number) => {
    if (newStatus === 'in-progress' && !hasAgentConfigured) {
      showNoAgentWarning();
    }

    let previousTasks: Task[] = [];
    setTasks(currentTasks => {
      previousTasks = currentTasks;
      return currentTasks.map(task =>
        task.id === taskId ? { ...task, status: newStatus, position: newPosition } : task
      );
    });

    pendingLocalActionsCount.current += 1;
    try {
      await updateTask(taskId, { status: newStatus, position: newPosition });
    } catch (error: unknown) {
      pendingLocalActionsCount.current = Math.max(0, pendingLocalActionsCount.current - 1);
      setTasks(previousTasks);
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nello spostamento del task: ${message}`);
    }
  }, []);

  const handleMoveTaskFromPanel = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    if (newStatus === 'in-progress' && !hasAgentConfigured) {
      showNoAgentWarning();
    }
    // Propagate the error so TaskDetailPanel can display blocking messages
    await updateTask(taskId, { status: newStatus });
    await fetchTasks();
  }, [fetchTasks, hasAgentConfigured, showNoAgentWarning]);

  const handleReorderTasks = useCallback(async (taskIds: string[], status: TaskStatus) => {
    let previousTasks: Task[] = [];
    setTasks(currentTasks => {
      previousTasks = currentTasks;
      return currentTasks.map(task => {
        const newIndex = taskIds.indexOf(task.id);
        if (newIndex !== -1) {
          return { ...task, position: newIndex };
        }
        return task;
      });
    });

    pendingLocalActionsCount.current += 1;
    try {
      await reorderTasks(taskIds, status);
    } catch (error: unknown) {
      pendingLocalActionsCount.current = Math.max(0, pendingLocalActionsCount.current - 1);
      setTasks(previousTasks);
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`Errore nel riordinamento: ${message}`);
    }
  }, []);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTaskId(task.id);
  }, []);

  const handleCloseDetailPanel = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleDependenciesChanged = useCallback(() => {
    void refreshBlockedTaskIds(tasks);
  }, [refreshBlockedTaskIds, tasks]);

  const handleSubtaskProgressChanged = useCallback((taskId: string, progress: SubtaskProgress) => {
    setSubtaskProgressMap(previousMap => {
      const updatedMap = new Map(previousMap);
      if (progress.total > 0) {
        updatedMap.set(taskId, progress);
      } else {
        updatedMap.delete(taskId);
      }
      return updatedMap;
    });
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
          isDarkMode={isDarkMode}
          onToggleTheme={handleToggleTheme}
        />

        <main className="flex-1 overflow-auto p-6">
          <ConnectionStatusIndicator connectionLost={connectionLost} />

          {noAgentWarningVisible && (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
              <p className="text-sm text-foreground">
                Nessun agent configurato. Configura un agent dalla{' '}
                <button
                  className="text-primary underline font-medium"
                  onClick={() => { setCurrentView('settings'); setNoAgentWarningVisible(false); }}
                >
                  pagina Impostazioni
                </button>
                {' '}per automatizzare lo sviluppo.
              </p>
              <button
                className="text-muted-foreground hover:text-foreground ml-3"
                onClick={() => setNoAgentWarningVisible(false)}
                aria-label="Chiudi avviso"
              >
                &times;
              </button>
            </div>
          )}

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
              blockedTaskIds={blockedTaskIds}
              subtaskProgressMap={subtaskProgressMap}
              onCreateTask={() => setIsCreateModalOpen(true)}
              onDeleteTask={requestDeleteTask}
              onUpdatePriority={(taskId, priority) => void handleUpdatePriority(taskId, priority)}
              onMoveTask={(taskId, newStatus, newPosition) => void handleMoveTask(taskId, newStatus, newPosition)}
              onReorderTasks={(taskIds, status) => void handleReorderTasks(taskIds, status)}
              onTaskClick={handleTaskClick}
            />
          ) : (
            <SettingsPage />
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
            allTasks={tasks}
            availableAgents={availableAgents}
            hasAgentConfigured={hasAgentConfigured}
            onClose={handleCloseDetailPanel}
            onDelete={requestDeleteTask}
            onMoveTask={handleMoveTaskFromPanel}
            onDependenciesChanged={handleDependenciesChanged}
            onSubtaskProgressChanged={handleSubtaskProgressChanged}
            onNavigateToSettings={() => { setSelectedTaskId(null); setCurrentView('settings'); }}
          />
        )}
      </AnimatePresence>

      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateTask={handleCreateTask}
        availableAgents={availableAgents}
      />

      <ConfirmDeleteDialog
        isOpen={taskIdPendingDeletion !== null}
        taskTitle={lastDeleteTaskTitle.current}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
