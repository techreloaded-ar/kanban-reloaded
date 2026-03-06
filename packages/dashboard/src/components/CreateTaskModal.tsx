import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import type { TaskPriority } from "../types.js";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (task: {
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: TaskPriority;
    agent?: string | null;
  }) => Promise<void>;
  availableAgentNames?: string[];
}

export function CreateTaskModal({ isOpen, onClose, onCreateTask, availableAgentNames = [] }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAcceptanceCriteria("");
    setPriority("medium");
    setSelectedAgent(null);
    setValidationError(null);
    setApiError(null);
    setSubmitting(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim()) {
      setValidationError("Il titolo è obbligatorio");
      return;
    }

    setValidationError(null);
    setApiError(null);
    setSubmitting(true);

    try {
      await onCreateTask({
        title: title.trim(),
        description,
        acceptanceCriteria,
        priority,
        agent: selectedAgent,
      });
      resetForm();
      onClose();
    } catch {
      setApiError("Errore durante la creazione del task");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nuovo Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              placeholder="Titolo del task"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (validationError) setValidationError(null);
              }}
              className="text-lg"
              aria-label="Titolo"
              aria-invalid={validationError !== null ? true : undefined}
              required
            />
            {validationError !== null && (
              <p className="mt-1 text-sm text-destructive">{validationError}</p>
            )}
          </div>

          <div>
            <Textarea
              placeholder="Descrivi cosa deve fare l'agent..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[100px] resize-none"
              aria-label="Descrizione"
            />
          </div>

          <div>
            <Textarea
              placeholder="Criteri di accettazione..."
              value={acceptanceCriteria}
              onChange={(event) => setAcceptanceCriteria(event.target.value)}
              className="min-h-[80px] resize-none"
              aria-label="Criteri di Accettazione"
            />
          </div>

          <div>
            <label className="block mb-2">Priorità</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={priority === "high" ? "default" : "outline"}
                onClick={() => setPriority("high")}
                className={priority === "high" ? "bg-destructive hover:bg-destructive/90" : ""}
              >
                Alta
              </Button>
              <Button
                type="button"
                variant={priority === "medium" ? "default" : "outline"}
                onClick={() => setPriority("medium")}
                className={priority === "medium" ? "bg-warning hover:bg-warning/90 text-white" : ""}
              >
                Media
              </Button>
              <Button
                type="button"
                variant={priority === "low" ? "default" : "outline"}
                onClick={() => setPriority("low")}
                className={priority === "low" ? "bg-info hover:bg-info/90 text-white" : ""}
              >
                Bassa
              </Button>
            </div>
          </div>

          {availableAgentNames.length > 0 && (
            <div>
              <label className="block mb-2">Agent</label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant={selectedAgent === null ? "default" : "outline"}
                  onClick={() => setSelectedAgent(null)}
                  size="sm"
                >
                  Default
                </Button>
                {availableAgentNames.map((agentName) => (
                  <Button
                    key={agentName}
                    type="button"
                    variant={selectedAgent === agentName ? "default" : "outline"}
                    onClick={() => setSelectedAgent(agentName)}
                    size="sm"
                  >
                    {agentName}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {apiError !== null && (
            <p className="text-sm text-destructive">{apiError}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={submitting}>
              {submitting ? "Creazione..." : "Crea Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
