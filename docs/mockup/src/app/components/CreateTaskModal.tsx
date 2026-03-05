import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { TaskPriority } from "./TaskCard";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (task: {
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: TaskPriority;
    status: "backlog" | "in-progress" | "done";
  }) => void;
  defaultStatus?: "backlog" | "in-progress" | "done";
}

export function CreateTaskModal({ isOpen, onClose, onCreateTask, defaultStatus = "backlog" }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onCreateTask({
      title,
      description,
      acceptanceCriteria,
      priority,
      status: defaultStatus,
    });

    // Reset form
    setTitle("");
    setDescription("");
    setAcceptanceCriteria("");
    setPriority("medium");
    onClose();
  };

  const handleClose = () => {
    setTitle("");
    setDescription("");
    setAcceptanceCriteria("");
    setPriority("medium");
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
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg"
              required
            />
          </div>

          <div>
            <Textarea
              placeholder="Descrivi cosa deve fare l'agent..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          <div>
            <Textarea
              placeholder="Criteri di accettazione..."
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              className="min-h-[80px] resize-none"
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
                className={priority === "medium" ? "bg-warning hover:bg-warning/90" : ""}
                style={priority === "medium" ? { backgroundColor: "#E67E22" } : {}}
              >
                Media
              </Button>
              <Button
                type="button"
                variant={priority === "low" ? "default" : "outline"}
                onClick={() => setPriority("low")}
                className={priority === "low" ? "bg-info hover:bg-info/90" : ""}
                style={priority === "low" ? { backgroundColor: "#3498DB" } : {}}
              >
                Bassa
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90">
              Crea Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
