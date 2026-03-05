---
name: vitest-monorepo-testing
description: >
  Patterns for testing the Kanban Reloaded monorepo with Vitest 3.x: workspace configuration,
  per-package test setup, factory functions, and testing strategies for each layer (core,
  server, dashboard, CLI). Use this skill when creating or modifying test files (*.test.ts,
  *.test.tsx), configuring Vitest, writing test utilities, setting up mock data, or
  debugging test failures. Also triggers when working on vitest.workspace.ts or any
  testing infrastructure.
---

# Vitest Monorepo Testing Patterns

Every package has its own test setup, but they share a common Vitest workspace
config at the root. Tests live alongside source files (colocated), not in a
separate `__tests__/` directory.

## Technology Stack

- **Vitest** 3.x — Test runner (compatible with Vite)
- **@testing-library/react** — React component testing
- **msw** 2.x — API mocking for frontend tests
- **light-my-request** (via `fastify.inject()`) — Server route testing

## Vitest Workspace

```typescript
// vitest.workspace.ts (root)
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core',
  'packages/server',
  'packages/dashboard',
  'packages/cli',
]);
```

Each package has its own `vitest.config.ts`:

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
```

For the dashboard (React):
```typescript
// packages/dashboard/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
```

## Test File Naming and Location

Tests live next to the source file they test:

```
packages/core/src/services/
  taskService.ts
  taskService.test.ts       # ← Right here
packages/dashboard/src/components/
  TaskCard.tsx
  TaskCard.test.tsx          # ← Right here
```

Use descriptive test names that read as specifications:

```typescript
describe('TaskService', () => {
  describe('createTask', () => {
    it('assigns a unique displayId with incrementing number', () => { ... });
    it('sets default status to backlog', () => { ... });
    it('throws when title is empty', () => { ... });
  });
});
```

## Testing Strategies by Package

### Core: In-memory SQLite

The core package tests business logic against a real SQLite database — but in
memory, so it's fast and isolated:

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../models/schema.js';

function createTestDatabase() {
  const sqliteConnection = new Database(':memory:');
  const database = drizzle(sqliteConnection, { schema });
  migrate(database, { migrationsFolder: './drizzle' });
  return database;
}

describe('TaskService', () => {
  let database: ReturnType<typeof drizzle>;
  let taskService: TaskService;

  beforeEach(() => {
    database = createTestDatabase();
    taskService = new TaskService(database);
  });

  it('creates a task with all fields populated', () => {
    const task = taskService.createTask({
      title: 'Implement login page',
      description: 'Create the login form with email and password',
      priority: 'high',
    });

    expect(task.id).toBeDefined();
    expect(task.displayId).toMatch(/^TASK-\d+$/);
    expect(task.status).toBe('backlog');
    expect(task.agentRunning).toBe(false);
  });
});
```

### Server: fastify.inject()

Test routes without starting the HTTP server — `inject()` simulates requests
in-process:

```typescript
import { createServer } from '../index.js';

describe('Task Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer({ databasePath: ':memory:' });
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /api/tasks creates a task and returns 201', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'Test task',
        priority: 'medium',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('Test task');
    expect(body.displayId).toBeDefined();
  });

  it('GET /api/tasks returns all tasks', async () => {
    // Create two tasks first
    await server.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Task 1' } });
    await server.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Task 2' } });

    const response = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
  });
});
```

### Dashboard: React Testing Library

Test components through accessibility queries (what the user sees), not
implementation details:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskCard } from './TaskCard';

const mockTask = createTestTask({
  displayId: 'TASK-001',
  title: 'Implement authentication',
  priority: 'high',
});

it('renders task display ID and title', () => {
  render(<TaskCard task={mockTask} index={0} />);

  expect(screen.getByText('TASK-001')).toBeInTheDocument();
  expect(screen.getByText('Implement authentication')).toBeInTheDocument();
});

it('shows priority badge with correct label', () => {
  render(<TaskCard task={mockTask} index={0} />);

  expect(screen.getByText('Alta')).toBeInTheDocument(); // Italian label
});

it('calls onClick when card is clicked', async () => {
  const handleClick = vi.fn();
  render(<TaskCard task={mockTask} index={0} onClick={handleClick} />);

  await userEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledOnce();
});
```

### Frontend API Mocking with msw

Use Mock Service Worker to intercept fetch calls in tests:

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const mockServer = setupServer(
  http.get('/api/tasks', () => {
    return HttpResponse.json([
      createTestTask({ displayId: 'TASK-001', title: 'Task One' }),
      createTestTask({ displayId: 'TASK-002', title: 'Task Two' }),
    ]);
  }),
);

beforeAll(() => mockServer.listen());
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());
```

## Factory Functions

Create reusable factory functions for test data. This avoids duplicating mock
data across tests and makes it easy to customize specific fields:

```typescript
// packages/core/src/test/factories.ts
import { randomUUID } from 'node:crypto';

let taskCounter = 0;

export function createTestTask(overrides: Partial<Task> = {}): Task {
  taskCounter++;
  return {
    id: randomUUID(),
    displayId: `TASK-${String(taskCounter).padStart(3, '0')}`,
    title: `Test Task ${taskCounter}`,
    description: 'A test task description',
    acceptanceCriteria: '',
    priority: 'medium',
    status: 'backlog',
    agentRunning: false,
    agentLog: undefined,
    createdAt: new Date().toISOString(),
    executionTime: undefined,
    position: taskCounter,
    ...overrides,
  };
}
```

## Key Rules

- **Colocate tests with source** — `foo.test.ts` next to `foo.ts`.
- **Use factory functions** — Never copy-paste mock data between tests.
- **Test behavior, not implementation** — "creates a task with correct status"
  is good. "calls database.insert with correct params" is brittle.
- **In-memory DB for core** — Fast, isolated, no cleanup needed.
- **`fastify.inject()` for server** — No HTTP overhead, deterministic.
- **Accessibility queries for React** — `getByRole`, `getByText`, not `querySelector`.
