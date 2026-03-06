import { useState, useEffect, useCallback } from "react";
import { Save, Plus, Trash2, Terminal, Info } from "lucide-react";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Badge } from "./ui/badge.js";
import { getConfiguration, updateConfiguration } from "../api/configApi.js";
import type { ProjectConfiguration } from "../api/configApi.js";

interface AgentEntry {
  name: string;
  commandTemplate: string;
  workingDirectory: string;
}

const PLACEHOLDER_HELP_TEXT = "Placeholder disponibili: {{title}}, {{description}}, {{acceptanceCriteria}}";

const PRECONFIGURED_TEMPLATES = [
  {
    name: "Claude Code",
    command: "claude --prompt '{{title}}: {{description}}'",
  },
  {
    name: "Aider",
    command: "aider --message '{{title}}: {{description}}'",
  },
  {
    name: "Script Custom",
    command: "echo 'Task: {{title}} - {{description}} - Criteri: {{acceptanceCriteria}}'",
  },
];

export function SettingsPage() {
  const [configuration, setConfiguration] = useState<ProjectConfiguration | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editable form state
  const [defaultAgentCommand, setDefaultAgentCommand] = useState("");
  const [serverPort, setServerPort] = useState("");
  const [globalWorkingDirectory, setGlobalWorkingDirectory] = useState("");
  const [agentEntries, setAgentEntries] = useState<AgentEntry[]>([]);

  const loadConfiguration = useCallback(async () => {
    try {
      const loadedConfig = await getConfiguration();
      setConfiguration(loadedConfig);
      setDefaultAgentCommand(loadedConfig.agentCommand ?? "");
      setServerPort(String(loadedConfig.serverPort));
      setGlobalWorkingDirectory(loadedConfig.workingDirectory ?? "");
      setAgentEntries(
        Object.entries(loadedConfig.agents).map(([name, agentValue]) => ({
          name,
          commandTemplate: typeof agentValue === 'string' ? agentValue : agentValue.command,
          workingDirectory: typeof agentValue === 'string' ? '' : (agentValue.workingDirectory ?? ''),
        }))
      );
      setLoadingError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setLoadingError(message);
    }
  }, []);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const agentsMap: Record<string, string | { command: string; workingDirectory?: string }> = {};
      for (const entry of agentEntries) {
        const trimmedName = entry.name.trim();
        if (trimmedName && entry.commandTemplate.trim()) {
          if (entry.workingDirectory.trim()) {
            agentsMap[trimmedName] = {
              command: entry.commandTemplate,
              workingDirectory: entry.workingDirectory.trim(),
            };
          } else {
            agentsMap[trimmedName] = entry.commandTemplate;
          }
        }
      }

      const updatedConfig = await updateConfiguration({
        agentCommand: defaultAgentCommand.trim() || null,
        agents: agentsMap,
        serverPort: parseInt(serverPort, 10) || 3000,
        workingDirectory: globalWorkingDirectory.trim() || null,
      });

      setConfiguration(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [defaultAgentCommand, serverPort, agentEntries]);

  const handleAddAgent = useCallback(() => {
    setAgentEntries(previous => [...previous, { name: "", commandTemplate: "", workingDirectory: "" }]);
  }, []);

  const handleRemoveAgent = useCallback((indexToRemove: number) => {
    setAgentEntries(previous => previous.filter((_, index) => index !== indexToRemove));
  }, []);

  const handleUpdateAgentName = useCallback((index: number, newName: string) => {
    setAgentEntries(previous =>
      previous.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, name: newName } : entry
      )
    );
  }, []);

  const handleUpdateAgentCommand = useCallback((index: number, newCommand: string) => {
    setAgentEntries(previous =>
      previous.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, commandTemplate: newCommand } : entry
      )
    );
  }, []);

  const handleUpdateAgentWorkingDirectory = useCallback((index: number, newWorkingDirectory: string) => {
    setAgentEntries(previous =>
      previous.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, workingDirectory: newWorkingDirectory } : entry
      )
    );
  }, []);

  if (loadingError) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center">
          <p className="text-sm font-medium text-destructive">
            Errore nel caricamento della configurazione
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{loadingError}</p>
          <Button
            onClick={() => void loadConfiguration()}
            className="mt-3"
            size="sm"
          >
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  if (!configuration) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center p-8">
        <p className="text-muted-foreground">Caricamento configurazione...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configura il comando agent, la porta del server e gli agent multipli.
        </p>
      </div>

      {/* Comando Agent di Default */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Comando Agent di Default</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Il template del comando eseguito quando un task viene spostato in &quot;In Progress&quot;.
          Lascia vuoto per disabilitare il lancio automatico dell&apos;agent.
        </p>

        <Input
          value={defaultAgentCommand}
          onChange={(event) => setDefaultAgentCommand(event.target.value)}
          placeholder="es. claude --prompt '{{title}}: {{description}}'"
          className="font-mono text-sm"
        />

        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">{PLACEHOLDER_HELP_TEXT}</p>
        </div>

        {!defaultAgentCommand && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Template preconfigurati
            </p>
            <div className="grid gap-2">
              {PRECONFIGURED_TEMPLATES.map((template) => (
                <div
                  key={template.name}
                  className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{template.name}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate">{template.command}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-3 shrink-0"
                    onClick={() => setDefaultAgentCommand(template.command)}
                  >
                    Usa questo
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Porta Server */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Porta Server</h2>
        <p className="text-sm text-muted-foreground">
          La porta su cui il server HTTP ascolta le connessioni. Richiede riavvio del server.
        </p>
        <Input
          type="number"
          value={serverPort}
          onChange={(event) => setServerPort(event.target.value)}
          className="w-32"
          min={1}
          max={65535}
        />
      </section>

      {/* Directory di Lavoro */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Directory di Lavoro</h2>
        <p className="text-sm text-muted-foreground">
          La directory in cui vengono eseguiti i processi agent. Percorso assoluto o relativo alla root del progetto.
          Se vuoto, viene usata la directory del progetto.
        </p>
        <Input
          value={globalWorkingDirectory}
          onChange={(event) => setGlobalWorkingDirectory(event.target.value)}
          placeholder="es. ./src oppure /home/user/project"
          className="font-mono text-sm"
        />
      </section>

      {/* Mappa Agent */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Agent Configurati</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Definisci agent con nomi specifici e comandi personalizzati. Ogni task puo selezionare un agent dalla lista.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddAgent}>
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi Agent
          </Button>
        </div>

        {agentEntries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nessun agent configurato. Clicca &quot;Aggiungi Agent&quot; per definirne uno.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {agentEntries.map((entry, index) => (
              <div
                key={index}
                className="rounded-md border border-border bg-background p-4 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Nome Agent
                    </label>
                    <Input
                      value={entry.name}
                      onChange={(event) => handleUpdateAgentName(index, event.target.value)}
                      placeholder="es. feature, bugfix, review"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-5 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveAgent(index)}
                    aria-label={`Rimuovi agent ${entry.name || index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Template Comando
                  </label>
                  <Input
                    value={entry.commandTemplate}
                    onChange={(event) => handleUpdateAgentCommand(index, event.target.value)}
                    placeholder="es. claude --prompt '{{title}}: {{description}}'"
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Directory di Lavoro (opzionale, sovrascrive quella globale)
                  </label>
                  <Input
                    value={entry.workingDirectory}
                    onChange={(event) => handleUpdateAgentWorkingDirectory(index, event.target.value)}
                    placeholder="es. ./src oppure /home/user/project"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Save Button & Feedback */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          className="bg-primary hover:bg-primary/90"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvataggio..." : "Salva Configurazione"}
        </Button>

        {saveSuccess && (
          <Badge className="bg-success text-white">Configurazione salvata</Badge>
        )}

        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
      </div>
    </div>
  );
}
