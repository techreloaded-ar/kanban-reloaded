import { LayoutGrid, Settings, User } from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";

interface SidebarProps {
  currentView: "board" | "settings";
  onViewChange: (view: "board" | "settings") => void;
}

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <div className="w-16 bg-card border-r border-border flex flex-col items-center py-4 gap-2">
      <Button
        variant={currentView === "board" ? "default" : "ghost"}
        size="icon"
        onClick={() => onViewChange("board")}
        className={currentView === "board" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
        aria-label="Board view"
      >
        <LayoutGrid className="h-5 w-5" />
      </Button>
      
      <Button
        variant={currentView === "settings" ? "default" : "ghost"}
        size="icon"
        onClick={() => onViewChange("settings")}
        className={currentView === "settings" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
        aria-label="Settings"
      >
        <Settings className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-muted text-muted-foreground">
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
