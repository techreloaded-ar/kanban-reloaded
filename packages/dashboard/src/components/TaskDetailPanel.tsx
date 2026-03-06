import { useState, useEffect, useCallback, useRef } from "react";
import { X, Trash2, Clock, Loader2, Lock, Link, Unlink, Plus, ListChecks, Settings, RotateCcw, CheckCircle2, XCircle, Play, Maximize2, Minimize2, Terminal } from "lucide-react";
import { Button } from "./ui/button.js";
import { Badge } from "./ui/badge.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.js";
import { ScrollArea } from "./ui/scroll-area.js";
import type { Task, TaskStatus } from "../types.js";
import { motion } from "motion/react";
import { getTaskDependencies, addTaskDependency, removeTaskDependency, getTaskSubtasks, createSubtask, toggleSubtask, deleteSubtask } from "../api/taskApi.js";
import type { TaskDependencies, Subtask, SubtaskProgress } from "../api/taskApi.js";
import type { Agent } from "../api/agentApi.js";

interface TaskDetailPanelProps {
  task: Task | null;
  allTasks: Task[];
  availableAgents?: Agent[];
  hasAgentConfigured?: boolean;
  /** Output live dall'agent via WebSocket (undefined = nessun agent attivo con output) */
  agentLiveOutput?: string;
  /** Modalita di visualizzazione: drawer overlay (mobile) o pannello inline (desktop) */
  displayMode?: 'drawer' | 'inline';
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onDependenciesChanged?: () => void;
  onSubtaskProgressChanged?: (taskId: string, progress: SubtaskProgress) => void;
  onNavigateToSettings?: () => void;
  onAgentAssigned?: (taskId: string, agentId: string | null) => void;
  onRetryAgentLaunch?: (taskId: string) => void;
}

const priorityConfig = {
  high: { label: "Alta", color: "bg-destructive text-destructive-foreground" },
  medium: { label: "Media", color: "bg-warning text-white" },
  low: { label: "Bassa", color: "bg-info text-white" },
};

const statusLabels: Record<TaskStatus, string> = {
  backlog: "Backlog",
  "in-progress": "In Progress",
  done: "Done",
};

export function TaskDetailPanel({ task, allTasks, availableAgents = [], hasAgentConfigured = true, agentLiveOutput, displayMode = 'drawer', onClose, onDelete, onMoveTask, onDependenciesChanged, onSubtaskProgressChanged, onNavigateToSettings, onAgentAssigned, onRetryAgentLaunch }: TaskDetailPanelProps) {
  const [dependencies, setDependencies] = useState<TaskDependencies | null>(null);
  const [dependencyLoadingError, setDependencyLoadingError] = useState<string | null>(null);
  const [selectedBlockingTaskId, setSelectedBlockingTaskId] = useState<string>("");
  const [dependencyActionError, setDependencyActionError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Subtask state
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtaskProgress, setSubtaskProgress] = useState<SubtaskProgress>({ total: 0, completed: 0 });
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const newSubtaskInputRef = useRef<HTMLInputElement>(null);
  const agentLogEndRef = useRef<HTMLDivElement>(null);
  const agentSectionRef = useRef<HTMLDivElement>(null);

  const fetchDependencies = useCallback(async (taskId: string) => {
    try {
      const loadedDependencies = await getTaskDependencies(taskId);
      setDependencies(loadedDependencies);
      setDependencyLoadingError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setDependencyLoadingError(message);
    }
  }, []);

  const fetchSubtasks = useCallback(async (taskId: string) => {
    try {
      setSubtasksLoading(true);
      setSubtaskError(null);
      const response = await getTaskSubtasks(taskId);
      setSubtasks(response.subtasks);
      setSubtaskProgress(response.progress);
      onSubtaskProgressChanged?.(taskId, response.progress);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setSubtaskError(message);
    } finally {
      setSubtasksLoading(false);
    }
  }, [onSubtaskProgressChanged]);

  const handleAddSubtask = useCallback(async () => {
    if (!task || !newSubtaskText.trim()) return;
    try {
      setSubtaskError(null);
      await createSubtask(task.id, newSubtaskText.trim());
      setNewSubtaskText("");
      await fetchSubtasks(task.id);
      newSubtaskInputRef.current?.focus();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setSubtaskError(message);
    }
  }, [task, newSubtaskText, fetchSubtasks]);

  const handleToggleSubtask = useCallback(async (subtaskId: string) => {
    if (!task) return;
    try {
      setSubtaskError(null);
      await toggleSubtask(subtaskId);
      await fetchSubtasks(task.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setSubtaskError(message);
    }
  }, [task, fetchSubtasks]);

  const handleDeleteSubtask = useCallback(async (subtaskId: string) => {
    if (!task) return;
    try {
      setSubtaskError(null);
      await deleteSubtask(subtaskId);
      await fetchSubtasks(task.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setSubtaskError(message);
    }
  }, [task, fetchSubtasks]);

  // Auto-scroll del log quando arriva nuovo output dall'agent
  useEffect(() => {
    if (agentLiveOutput !== undefined && agentLogEndRef.current) {
      agentLogEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentLiveOutput]);

  const handleRetryAgent = useCallback(async () => {
    if (!task) return;
    try {
      setRetryError(null);
      setIsRetrying(true);
      onRetryAgentLaunch?.(task.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      setRetryError(message);
    } finally {
      setIsRetrying(false);
    }
  }, [task, onRetryAgentLaunch]);

  useEffect(() => {
    if (task) {
      setMoveError(null);
      setDependencyActionError(null);
      setRetryError(null);
      setSelectedBlockingTaskId("");
      setNewSubtaskText("");
      setSubtaskError(null);
      void fetchDependencies(task.id);
      void fetchSubtasks(task.id);
    } else {
      setDependencies(null);
      setSubtasks([]);
      setSubtaskProgress({ total: 0, completed: 0 });
    }
  }, [task, fetchDependencies, fetchSubtasks]);

  const handleAddDependency = useCallback(async () => {
    if (!task || !selectedBlockingTaskId) return;
    try {
      setDependencyActionError(null);
      await addTaskDependency(task.id, selectedBlockingTaskId);
      setSelectedBlockingTaskId("");
      await fetchDependencies(task.id);
      onDependenciesChanged?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setDependencyActionError(message);
    }
  }, [task, selectedBlockingTaskId, fetchDependencies, onDependenciesChanged]);

  const handleRemoveDependency = useCallback(async (blockingTaskId: string) => {
    if (!task) return;
    try {
      setDependencyActionError(null);
      await removeTaskDependency(task.id, blockingTaskId);
      await fetchDependencies(task.id);
      onDependenciesChanged?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setDependencyActionError(message);
    }
  }, [task, fetchDependencies, onDependenciesChanged]);

  const handleMoveTask = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    try {
      setMoveError(null);
      await onMoveTask(taskId, newStatus);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setMoveError(message);
    }
  }, [onMoveTask]);

  if (!task) return null;

  const priorityStyle = priorityConfig[task.priority];

  // Compute which tasks can be added as blocking dependencies
  const alreadyLinkedTaskIds = new Set<string>();
  if (dependencies) {
    for (const blockingTask of dependencies.blockingTasks) {
      alreadyLinkedTaskIds.add(blockingTask.id);
    }
    for (const blockedByTask of dependencies.blockedByTasks) {
      alreadyLinkedTaskIds.add(blockedByTask.id);
    }
  }
  const availableTasksForDependency = allTasks.filter(
    (candidateTask) => candidateTask.id !== task.id && !alreadyLinkedTaskIds.has(candidateTask.id)
  );

  const panelContent = (
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

        {/* Banner stato agent — sempre visibile in cima quando c'e attivita agent */}
        {(task.agentRunning || agentLiveOutput !== undefined || task.agentLog !== null) && (
          <button
            onClick={() => agentSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className={`mx-6 mt-3 mb-0 flex items-center justify-between rounded-lg px-4 py-2.5 text-sm cursor-pointer transition-colors ${
              task.agentRunning
                ? 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15'
                : task.status === 'done' && task.executionTime !== null
                  ? 'bg-success/10 border border-success/30 text-success hover:bg-success/15'
                  : task.status === 'in-progress' && task.agentLog !== null
                    ? 'bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/15'
                    : 'bg-muted/50 border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2">
              {task.agentRunning ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Agent in esecuzione...</>
              ) : task.status === 'done' && task.executionTime !== null ? (
                <><CheckCircle2 className="h-4 w-4" /> Agent completato in {Math.round(task.executionTime / 1000)}s</>
              ) : task.status === 'in-progress' && task.agentLog !== null ? (
                <><XCircle className="h-4 w-4" /> Agent terminato con errore</>
              ) : (
                <><Terminal className="h-4 w-4" /> Log agent disponibile</>
              )}
            </div>
            <span className="text-xs opacity-70">Vedi log ↓</span>
          </button>
        )}

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-6">
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

            <div ref={agentSectionRef} className="border-t border-border pt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Agent AI</h3>
                {task.agentRunning ? (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    In esecuzione
                  </div>
                ) : task.status === 'done' && task.executionTime !== null ? (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Completato
                  </div>
                ) : task.status === 'in-progress' && !task.agentRunning && task.agentLog !== null ? (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    Errore
                  </div>
                ) : null}
              </div>

              {!hasAgentConfigured && !task.agentRunning ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center space-y-2">
                  <Settings className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nessun agent configurato. Configura un comando agent per automatizzare lo sviluppo.
                  </p>
                  {onNavigateToSettings && (
                    <Button variant="outline" size="sm" onClick={onNavigateToSettings}>
                      Vai alle Impostazioni
                    </Button>
                  )}
                </div>
              ) : (
              <>
              <div className="text-sm space-y-2 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Agent:</span>
                  {!task.agentRunning && availableAgents.length > 0 ? (
                    <Select
                      value={task.agentId ?? "__default__"}
                      onValueChange={(value) => {
                        const newAgentId = value === "__default__" ? null : value;
                        onAgentAssigned?.(task.id, newAgentId);
                      }}
                    >
                      <SelectTrigger className="w-36 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Default</SelectItem>
                        {availableAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>{task.agentName || "Default"}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span>{task.agentRunning ? "In esecuzione" : task.status === 'in-progress' && task.agentLog !== null ? "Terminato con errore" : "Inattivo"}</span>
                </div>
                {task.executionTime !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tempo:</span>
                    <span>{Math.round(task.executionTime / 1000)}s</span>
                  </div>
                )}
              </div>

              {/* Pulsante Rilancia Agent — visibile solo se in-progress, agent non running, e c'e un agent configurato */}
              {task.status === 'in-progress' && !task.agentRunning && hasAgentConfigured && (
                <div className="mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isRetrying}
                    onClick={() => void handleRetryAgent()}
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : task.agentLog !== null ? (
                      <RotateCcw className="h-3.5 w-3.5 mr-2" />
                    ) : (
                      <Play className="h-3.5 w-3.5 mr-2" />
                    )}
                    {task.agentLog !== null ? "Rilancia Agent" : "Avvia Agent"}
                  </Button>
                  {retryError && (
                    <p className="text-xs text-destructive mt-1">{retryError}</p>
                  )}
                </div>
              )}

              {/* Log output — mostra live output durante esecuzione, oppure log salvato */}
              {(agentLiveOutput !== undefined || task.agentLog !== null) && (
                <div className={`border rounded-lg p-3 mt-3 ${task.agentRunning ? 'bg-primary/5 border-primary/30' : 'bg-background border-border'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {task.agentRunning && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>{task.agentRunning ? "Output live:" : "Log Output:"}</span>
                    </div>
                    <button
                      onClick={() => setIsLogExpanded(previous => !previous)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                      aria-label={isLogExpanded ? "Riduci log" : "Espandi log"}
                      title={isLogExpanded ? "Riduci" : "Espandi"}
                    >
                      {isLogExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <ScrollArea className={isLogExpanded ? "h-[60vh]" : "h-40"}>
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                      {agentLiveOutput !== undefined ? agentLiveOutput : task.agentLog}
                    </pre>
                    <div ref={agentLogEndRef} />
                  </ScrollArea>
                </div>
              )}
              </>
              )}
            </div>

            {/* Sotto-attivita */}
            <div className="border-t border-border pt-6">
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">
                  Sotto-attivita
                  {subtaskProgress.total > 0 && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      ({subtaskProgress.completed}/{subtaskProgress.total})
                    </span>
                  )}
                </h3>
              </div>

              {subtasksLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Caricamento sotto-attivita...
                </div>
              ) : (
                <div className="space-y-2 p-0.5 -m-0.5">
                  {subtaskProgress.total > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success rounded-full transition-all"
                          style={{ width: `${(subtaskProgress.completed / subtaskProgress.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {Math.round((subtaskProgress.completed / subtaskProgress.total) * 100)}%
                      </span>
                    </div>
                  )}

                  {subtasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessuna sotto-attivita</p>
                  ) : (
                    <ul className="space-y-1">
                      {subtasks.map((subtask) => (
                        <li
                          key={subtask.id}
                          className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 group/subtask"
                        >
                          <input
                            type="checkbox"
                            checked={subtask.completed}
                            onChange={() => void handleToggleSubtask(subtask.id)}
                            className="h-4 w-4 rounded border-border text-primary accent-primary cursor-pointer"
                            aria-label={`Segna "${subtask.text}" come ${subtask.completed ? 'non completata' : 'completata'}`}
                          />
                          <span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-muted-foreground' : ''}`}>
                            {subtask.text}
                          </span>
                          <button
                            onClick={() => void handleDeleteSubtask(subtask.id)}
                            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover/subtask:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
                            aria-label={`Elimina sotto-attivita "${subtask.text}"`}
                            title="Elimina sotto-attivita"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add new subtask */}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      ref={newSubtaskInputRef}
                      type="text"
                      value={newSubtaskText}
                      onChange={(event) => setNewSubtaskText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleAddSubtask();
                        }
                      }}
                      placeholder="Nuova sotto-attivita..."
                      className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!newSubtaskText.trim()}
                      onClick={() => void handleAddSubtask()}
                      aria-label="Aggiungi sotto-attivita"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {subtaskError && (
                    <p className="text-xs text-destructive">{subtaskError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Dipendenze */}
            <div className="border-t border-border pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Link className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">Dipendenze</h3>
              </div>

              {dependencyLoadingError ? (
                <p className="text-xs text-destructive">{dependencyLoadingError}</p>
              ) : dependencies === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Caricamento dipendenze...
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Bloccato da */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Bloccato da
                    </span>
                    {dependencies.blockingTasks.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">Nessuna dipendenza</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {dependencies.blockingTasks.map((blockingTask) => (
                          <li
                            key={blockingTask.id}
                            className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-mono text-muted-foreground shrink-0">
                                {blockingTask.displayId}
                              </span>
                              <span className="text-sm truncate">{blockingTask.title}</span>
                            </div>
                            <button
                              onClick={() => void handleRemoveDependency(blockingTask.id)}
                              className="ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Rimuovi dipendenza da ${blockingTask.displayId}`}
                              title="Rimuovi dipendenza"
                            >
                              <Unlink className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Blocca */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Blocca
                    </span>
                    {dependencies.blockedByTasks.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">Nessun task bloccato</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {dependencies.blockedByTasks.map((blockedTask) => (
                          <li
                            key={blockedTask.id}
                            className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5"
                          >
                            <span className="text-xs font-mono text-muted-foreground shrink-0">
                              {blockedTask.displayId}
                            </span>
                            <span className="text-sm truncate">{blockedTask.title}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Aggiungi dipendenza */}
                  {availableTasksForDependency.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Aggiungi dipendenza
                      </span>
                      <div className="mt-1 flex items-center gap-2">
                        <Select
                          value={selectedBlockingTaskId}
                          onValueChange={setSelectedBlockingTaskId}
                        >
                          <SelectTrigger className="flex-1 text-sm">
                            <SelectValue placeholder="Seleziona task bloccante..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableTasksForDependency.map((candidateTask) => (
                              <SelectItem key={candidateTask.id} value={candidateTask.id}>
                                {candidateTask.displayId} - {candidateTask.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!selectedBlockingTaskId}
                          onClick={() => void handleAddDependency()}
                          aria-label="Aggiungi dipendenza"
                        >
                          <Link className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {dependencyActionError && (
                    <p className="text-xs text-destructive">{dependencyActionError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 border-t border-border space-y-3">
          <div>
            <label className="text-sm font-medium mb-2 block">Sposta in</label>
            <Select value={task.status} onValueChange={(value) => void handleMoveTask(task.id, value as TaskStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            {moveError && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                <Lock className="h-3.5 w-3.5 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{moveError}</p>
              </div>
            )}
          </div>

          <Button
            variant="destructive"
            className="w-full"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina Task
          </Button>
        </div>
      </div>
  );

  if (displayMode === 'inline') {
    return (
      <div className="h-full w-[550px] xl:w-[650px] 2xl:w-[700px] shrink-0 bg-card border-l border-border">
        {panelContent}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 h-full w-[400px] bg-card border-l border-border shadow-2xl z-50"
    >
      {panelContent}
    </motion.div>
  );
}
