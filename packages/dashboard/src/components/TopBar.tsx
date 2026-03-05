import { Search, Plus, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";

interface TopBarProps {
  projectName: string;
  onNewTask: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export function TopBar({ projectName, onNewTask, isDarkMode, onToggleTheme }: TopBarProps) {
  return (
    <div className="h-16 bg-card border-b border-border px-6 flex items-center gap-4">
      <h1 className="text-lg font-semibold">{projectName}</h1>

      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search tasks..."
          className="pl-10 bg-background border-border"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
        >
          {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <Button onClick={onNewTask} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Task
        </Button>
      </div>
    </div>
  );
}
