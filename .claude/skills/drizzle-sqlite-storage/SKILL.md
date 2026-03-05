---
name: drizzle-sqlite-storage
description: >
  Patterns for the Kanban Reloaded persistence layer using Drizzle ORM with SQLite
  (better-sqlite3). Use this skill when working on packages/core/, defining or modifying
  database schemas, writing queries, creating storage services, handling database
  initialization, migrations, or any code that touches the SQLite database. Also triggers
  when debugging query issues, adding new fields to tasks, or working on the
  .kanban-reloaded/database.sqlite file.
---

# Drizzle ORM + SQLite Storage Patterns

The `@kanban-reloaded/core` package owns all database access. No other package should
import `better-sqlite3` or `drizzle-orm` directly — they consume typed services and
models exported by core.

## Technology Stack

- **Drizzle ORM** 0.38.x — Type-safe query builder, no runtime overhead
- **better-sqlite3** 11.x — Synchronous SQLite bindings for Node.js
- **drizzle-kit** — Schema migrations

## Database Location

The SQLite database lives at `.kanban-reloaded/database.sqlite` relative to the
project root. The directory is created automatically on first use. This path is
discovered by the CLI/server by walking up the directory tree until finding
`.kanban-reloaded/` (similar to how Git finds `.git/`).

## Schema Definition

Define schemas using `sqliteTable()` from `drizzle-orm/sqlite-core`. The schema
must match the Task interface from the mockup (`docs/mockup/src/app/components/TaskCard.tsx`):

```typescript
// packages/core/src/models/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const tasksTable = sqliteTable('tasks', {
  id: text('id').primaryKey(),                    // UUID
  displayId: text('display_id').notNull().unique(), // Human-readable ID like "TASK-001"
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  acceptanceCriteria: text('acceptance_criteria').notNull().default(''),
  priority: text('priority', { enum: ['high', 'medium', 'low'] }).notNull().default('medium'),
  status: text('status', { enum: ['backlog', 'in-progress', 'done'] }).notNull().default('backlog'),
  agentRunning: integer('agent_running', { mode: 'boolean' }).notNull().default(false),
  agentLog: text('agent_log'),
  createdAt: text('created_at').notNull(),        // ISO 8601 string
  executionTime: real('execution_time'),           // Seconds, nullable
  position: real('position').notNull().default(0), // Ordering within column
});

export const configTable = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),                 // JSON-encoded value
});
```

Column naming: use `snake_case` in the database, `camelCase` in TypeScript. Drizzle
handles the mapping via the column name argument (first param to `text()`/`integer()`).

Use descriptive table and column names — `acceptance_criteria` not `ac`,
`agent_running` not `running`, `display_id` not `did`.

## Database Connection (Singleton)

Create one connection per process and reuse it. SQLite handles concurrent reads
well, and better-sqlite3 is synchronous so there's no connection pool to manage:

```typescript
// packages/core/src/storage/database.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../models/schema.js';

let databaseInstance: ReturnType<typeof drizzle> | null = null;

export function getDatabase(databasePath: string) {
  if (!databaseInstance) {
    const sqliteConnection = new Database(databasePath);
    sqliteConnection.pragma('journal_mode = WAL');  // Better concurrent read performance
    sqliteConnection.pragma('foreign_keys = ON');
    databaseInstance = drizzle(sqliteConnection, { schema });
  }
  return databaseInstance;
}
```

`WAL` (Write-Ahead Logging) mode is important: it allows the dashboard to read
while the CLI or an agent is writing, without blocking.

## Migrations

Use `drizzle-kit` for schema migrations. The migration files live in
`packages/core/drizzle/` and are applied automatically at startup:

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function initializeDatabase(databasePath: string) {
  const database = getDatabase(databasePath);
  migrate(database, { migrationsFolder: './drizzle' });
  return database;
}
```

## Query Patterns

### Type-safe queries with Drizzle

```typescript
import { eq, and, asc } from 'drizzle-orm';
import { tasksTable } from '../models/schema.js';

// Find tasks by status, ordered by position
export function findTasksByStatus(database: Database, status: string) {
  return database
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.status, status))
    .orderBy(asc(tasksTable.position));
}

// Update a single field
export function updateTaskStatus(database: Database, taskId: string, newStatus: string) {
  return database
    .update(tasksTable)
    .set({ status: newStatus })
    .where(eq(tasksTable.id, taskId));
}
```

### Transactions

Use transactions for operations that modify multiple rows (e.g., reordering tasks):

```typescript
import { sql } from 'drizzle-orm';

export function reorderTasksInColumn(database: Database, taskPositions: Array<{ id: string; position: number }>) {
  database.transaction((transaction) => {
    for (const { id, position } of taskPositions) {
      transaction
        .update(tasksTable)
        .set({ position })
        .where(eq(tasksTable.id, id));
    }
  });
}
```

## Service Layer

Services encapsulate business logic and are the public API of the core package.
Other packages import services, not raw database queries:

```typescript
// packages/core/src/services/taskService.ts
export class TaskService {
  constructor(private database: Database) {}

  createTask(input: CreateTaskInput): Task { ... }
  getTaskById(taskId: string): Task | undefined { ... }
  listTasksByStatus(status: TaskStatus): Task[] { ... }
  updateTask(taskId: string, changes: Partial<Task>): Task { ... }
  deleteTask(taskId: string): void { ... }
  moveTask(taskId: string, newStatus: TaskStatus, position: number): Task { ... }
}
```

## Testing

For tests, use an in-memory SQLite database — it's fast and isolated:

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

function createTestDatabase() {
  const sqliteConnection = new Database(':memory:');
  const database = drizzle(sqliteConnection, { schema });
  migrate(database, { migrationsFolder: './drizzle' });
  return database;
}
```

## Key Rules

- **No `any` types** — Drizzle's inference provides full type safety. If you're
  reaching for `any`, you're probably fighting the API instead of using it.
- **All database access goes through core** — Server and CLI import from
  `@kanban-reloaded/core`, never from `better-sqlite3` directly.
- **Column names match the mockup** — The Task interface fields in the mockup
  are the source of truth for what the schema must contain.
- **Use descriptive names** — `acceptanceCriteria` not `ac`, `tasksTable` not `t`.
