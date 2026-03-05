---
name: react-kanban-dashboard
description: >
  Patterns for the Kanban Reloaded React dashboard: component structure, drag-and-drop
  with @hello-pangea/dnd, WebSocket real-time updates, state management, and Vite
  configuration. Use this skill when working on packages/dashboard/, creating or modifying
  React components, implementing drag-and-drop, connecting to the WebSocket server,
  managing frontend state, or styling with Tailwind CSS and shadcn/ui. Also triggers when
  working on the Vite dev proxy, frontend API calls, or any dashboard UI code.
---

# React Kanban Dashboard Patterns

The `@kanban-reloaded/dashboard` package is a React 19 SPA built with Vite 6,
styled with Tailwind CSS v4 and shadcn/ui components. The mockup in
`docs/mockup/src/app/components/` is the visual source of truth.

## Technology Stack

- **React** 19.x — UI framework
- **Vite** 6.x — Build tool and dev server
- **@hello-pangea/dnd** 17.x — Drag-and-drop (replaces react-dnd from mockup)
- **Tailwind CSS** v4 — Utility-first CSS
- **shadcn/ui** — Accessible component primitives (copied from mockup)
- **motion** (motion/react) — Animations
- **sonner** — Toast notifications

## Mockup Migration: react-dnd to @hello-pangea/dnd

The mockup uses `react-dnd` with `HTML5Backend`, but production uses
`@hello-pangea/dnd` (as specified in the PRD). The API is different:

### Mockup (react-dnd) — DO NOT use in production
```tsx
import { useDrag } from 'react-dnd';
import { useDrop } from 'react-dnd';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
```

### Production (@hello-pangea/dnd) — USE THIS
```tsx
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
```

Migration pattern:

```tsx
// KanbanBoard.tsx (production)
function KanbanBoard({ tasks, onTaskMove }: KanbanBoardProps) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return; // Dropped outside

    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;
    const newPosition = result.destination.index;

    onTaskMove(taskId, newStatus, newPosition);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        <KanbanColumn status="backlog" tasks={backlogTasks} />
        <KanbanColumn status="in-progress" tasks={inProgressTasks} />
        <KanbanColumn status="done" tasks={doneTasks} />
      </div>
    </DragDropContext>
  );
}

// KanbanColumn.tsx (production)
function KanbanColumn({ status, tasks }: KanbanColumnProps) {
  return (
    <Droppable droppableId={status}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={snapshot.isDraggingOver ? 'bg-accent/50' : ''}
        >
          {tasks.map((task, index) => (
            <TaskCard key={task.id} task={task} index={index} />
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

// TaskCard.tsx (production)
function TaskCard({ task, index }: TaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={snapshot.isDragging ? 'opacity-50 rotate-2 scale-105' : ''}
        >
          {/* Card content — copy structure from mockup */}
        </div>
      )}
    </Draggable>
  );
}
```

## Design System from Mockup

Copy these files directly from the mockup into the dashboard:

- `docs/mockup/src/styles/theme.css` → `packages/dashboard/src/styles/theme.css`
- `docs/mockup/src/styles/custom.css` → `packages/dashboard/src/styles/custom.css`
- `docs/mockup/src/styles/fonts.css` → `packages/dashboard/src/styles/fonts.css`
- `docs/mockup/src/app/components/ui/*` → `packages/dashboard/src/components/ui/*`

This ensures exact visual fidelity with the mockup.

## WebSocket Hook

The dashboard needs real-time updates from the server. Create a hook that
manages the WebSocket connection with automatic reconnection:

```tsx
// packages/dashboard/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

export function useWebSocket(
  url: string,
  onMessage: (message: WebSocketMessage) => void,
) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const socket = new WebSocket(url);

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as WebSocketMessage;
      onMessage(message);
    };

    socket.onclose = () => {
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    socket.onerror = () => {
      socket.close();
    };

    socketRef.current = socket;
  }, [url, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  return socketRef;
}
```

## State Management: Context + useReducer

For the board state, use React Context with `useReducer` — it's the right
level of complexity for this app (no external state library needed):

```tsx
type BoardAction =
  | { type: 'SET_TASKS'; tasks: Task[] }
  | { type: 'TASK_CREATED'; task: Task }
  | { type: 'TASK_UPDATED'; task: Task }
  | { type: 'TASK_DELETED'; taskId: string }
  | { type: 'TASK_MOVED'; task: Task };

function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'SET_TASKS':
      return { ...state, tasks: action.tasks };
    case 'TASK_CREATED':
      return { ...state, tasks: [...state.tasks, action.task] };
    case 'TASK_UPDATED':
      return {
        ...state,
        tasks: state.tasks.map(t => t.id === action.task.id ? action.task : t),
      };
    case 'TASK_DELETED':
      return {
        ...state,
        tasks: state.tasks.filter(t => t.id !== action.taskId),
      };
    default:
      return state;
  }
}
```

## Vite Configuration

```typescript
// packages/dashboard/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
```

The proxy routes `/api` and `/ws` requests to the Fastify server during
development. In production, the server serves the built dashboard as static files.

## API Client

Keep API calls in a dedicated module, not scattered across components:

```typescript
// packages/dashboard/src/api/taskApi.ts
const API_BASE = '/api';

export async function fetchTasks(status?: string): Promise<Task[]> {
  const params = status ? `?status=${status}` : '';
  const response = await fetch(`${API_BASE}/tasks${params}`);
  if (!response.ok) throw new Error(`Failed to fetch tasks: ${response.statusText}`);
  return response.json();
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Failed to create task: ${response.statusText}`);
  return response.json();
}
```

## Key Rules

- **Always read the mockup component before creating the production version** —
  copy the HTML structure, Tailwind classes, and layout exactly.
- **Use @hello-pangea/dnd, not react-dnd** — the mockup uses react-dnd but
  production must use @hello-pangea/dnd as specified in the PRD.
- **Copy shadcn/ui components from the mockup** — don't re-generate them.
- **Keep Italian labels** — the mockup uses Italian text ("Backlog", "Configurazione",
  "Crea Task", etc.). Maintain the same language.
