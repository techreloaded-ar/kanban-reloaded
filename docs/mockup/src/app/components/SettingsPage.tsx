import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { GripVertical } from "lucide-react";
import { motion } from "motion/react";

interface SettingsPageProps {
  onSave: (settings: any) => void;
}

interface Column {
  id: string;
  name: string;
  color: string;
}

export function SettingsPage({ onSave }: SettingsPageProps) {
  const [agentPreset, setAgentPreset] = useState("claude-code");
  const [commandTemplate, setCommandTemplate] = useState('claude-code --task "{{task_description}}"');
  const [serverPort, setServerPort] = useState("3000");
  const [autoStart, setAutoStart] = useState(true);
  const [columns, setColumns] = useState<Column[]>([
    { id: "backlog", name: "Backlog", color: "#3498DB" },
    { id: "in-progress", name: "In Progress", color: "#E67E22" },
    { id: "done", name: "Done", color: "#2ECC71" },
  ]);

  const handleSave = () => {
    onSave({
      agentPreset,
      commandTemplate,
      serverPort,
      autoStart,
      columns,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex-1 overflow-auto"
    >
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="mb-8">Configurazione</h1>

        <div className="space-y-8">
          <section className="bg-card border border-border rounded-lg p-6">
            <h2 className="mb-4">Agent AI</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="agent-preset">Agent Preset</Label>
                <Select value={agentPreset} onValueChange={setAgentPreset}>
                  <SelectTrigger id="agent-preset" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-code">Claude Code</SelectItem>
                    <SelectItem value="cursor">Cursor</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="command-template">Comando Template</Label>
                <Input
                  id="command-template"
                  value={commandTemplate}
                  onChange={(e) => setCommandTemplate(e.target.value)}
                  className="mt-2 font-mono text-sm"
                  placeholder='es. claude-code --task "{{task_description}}"'
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Usa <code className="bg-muted px-1 py-0.5 rounded">{"{{task_description}}"}</code> per inserire la
                  descrizione del task
                </p>
              </div>
            </div>
          </section>

          <section className="bg-card border border-border rounded-lg p-6">
            <h2 className="mb-4">Server</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="server-port">Porta</Label>
                <Input
                  id="server-port"
                  type="number"
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value)}
                  className="mt-2"
                  placeholder="3000"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-start">Auto-start Server</Label>
                  <p className="text-xs text-muted-foreground mt-1">Avvia automaticamente il server all'apertura</p>
                </div>
                <Switch id="auto-start" checked={autoStart} onCheckedChange={setAutoStart} />
              </div>
            </div>
          </section>

          <section className="bg-card border border-border rounded-lg p-6">
            <h2 className="mb-4">Board</h2>
            
            <div>
              <Label>Colonne Custom</Label>
              <div className="space-y-2 mt-3">
                {columns.map((column, index) => (
                  <div key={column.id} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border">
                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                    <Input
                      value={column.name}
                      onChange={(e) => {
                        const newColumns = [...columns];
                        newColumns[index].name = e.target.value;
                        setColumns(newColumns);
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="color"
                      value={column.color}
                      onChange={(e) => {
                        const newColumns = [...columns];
                        newColumns[index].color = e.target.value;
                        setColumns(newColumns);
                      }}
                      className="w-16 h-10"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
              Salva Configurazione
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
