---
name: commander-cli-patterns
description: >
  Patterns for the Kanban Reloaded CLI using Commander.js 13.x: command structure,
  argument parsing, terminal output formatting, and project directory discovery.
  Use this skill when working on packages/cli/, creating or modifying CLI commands,
  formatting terminal output, implementing the project directory discovery logic,
  or debugging CLI-related issues. Also triggers when working on the binary entry
  point, exit codes, or the `kanban-reloaded serve` command.
---

# Commander.js CLI Patterns

The `@kanban-reloaded/cli` package provides the `kanban-reloaded` binary. It uses
Commander.js 13.x for argument parsing and imports services from `@kanban-reloaded/core`
for all business logic.

## Technology Stack

- **Commander.js** 13.x — Command parsing and help generation
- **picocolors** — Terminal colors (lighter alternative to chalk)
- **cli-table3** — Tabular output formatting

## Binary Entry Point

```json
// packages/cli/package.json
{
  "name": "@kanban-reloaded/cli",
  "bin": {
    "kanban-reloaded": "./dist/index.js"
  }
}
```

The entry file needs the Node.js shebang:
```typescript
#!/usr/bin/env node
// packages/cli/src/index.ts
import { Command } from 'commander';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { moveCommand } from './commands/move.js';
import { serveCommand } from './commands/serve.js';

const program = new Command();

program
  .name('kanban-reloaded')
  .description('Local-first Kanban board for AI-assisted development')
  .version('0.1.0');

program.addCommand(addCommand);
program.addCommand(listCommand);
program.addCommand(moveCommand);
program.addCommand(serveCommand);

program.parse();
```

## Command Structure

Each command lives in its own file under `src/commands/`. Use `.argument()` for
required positional args and `.option()` for flags:

```typescript
// packages/cli/src/commands/add.ts
import { Command } from 'commander';

export const addCommand = new Command('add')
  .description('Add a new task to the backlog')
  .argument('<title>', 'Task title')
  .option('-d, --description <text>', 'Task description', '')
  .option('-p, --priority <level>', 'Priority: high, medium, low', 'medium')
  .option('-a, --acceptance-criteria <text>', 'Acceptance criteria', '')
  .action(async (title, options) => {
    const projectPath = discoverProjectDirectory();
    const taskService = createTaskService(projectPath);
    const task = taskService.createTask({
      title,
      description: options.description,
      priority: options.priority,
      acceptanceCriteria: options.acceptanceCriteria,
    });
    console.log(pc.green(`Task created: ${task.displayId} — ${task.title}`));
  });
```

## Project Directory Discovery

The CLI finds the `.kanban-reloaded/` directory by walking up the directory tree,
similar to how Git finds `.git/`:

```typescript
// packages/cli/src/utils/discoverProjectDirectory.ts
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function discoverProjectDirectory(startFrom: string = process.cwd()): string {
  let currentDirectory = startFrom;

  while (true) {
    const candidatePath = join(currentDirectory, '.kanban-reloaded');
    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      // Reached filesystem root without finding .kanban-reloaded/
      throw new Error(
        'No .kanban-reloaded/ directory found. Run this command from within a Kanban Reloaded project, ' +
        'or initialize one with `kanban-reloaded init`.'
      );
    }
    currentDirectory = parentDirectory;
  }
}
```

## Output Formatting

### Tabular output for `list`

```typescript
import Table from 'cli-table3';
import pc from 'picocolors';

function formatTaskList(tasks: Task[]): string {
  const table = new Table({
    head: [
      pc.bold('ID'),
      pc.bold('Display ID'),
      pc.bold('Title'),
      pc.bold('Status'),
      pc.bold('Priority'),
    ],
    colWidths: [38, 12, 40, 14, 10],
  });

  for (const task of tasks) {
    table.push([
      pc.dim(task.id),
      pc.cyan(task.displayId),
      task.title.length > 37 ? task.title.slice(0, 37) + '...' : task.title,
      formatStatus(task.status),
      formatPriority(task.priority),
    ]);
  }

  return table.toString();
}
```

### Semantic colors

Use colors meaningfully — not decoratively:
- **Green** (`pc.green`) — Success, completion, "done" status
- **Yellow** (`pc.yellow`) — Warnings, "in-progress" status, medium priority
- **Red** (`pc.red`) — Errors, high priority
- **Blue** (`pc.blue`) — Info, "backlog" status, low priority
- **Dim** (`pc.dim`) — Secondary info (UUIDs, timestamps)
- **Bold** (`pc.bold`) — Headers, emphasis

## Exit Codes

Use correct exit codes so scripts and CI can rely on them:

```typescript
// 0 — Success (default)
// 1 — General error (command failed)
// 2 — Usage error (bad arguments)

process.exitCode = 1; // Prefer this over process.exit(1) to allow cleanup
```

## The `serve` Command

The `serve` command starts the Fastify server from `@kanban-reloaded/server`:

```typescript
export const serveCommand = new Command('serve')
  .description('Start the Kanban dashboard server')
  .option('-p, --port <number>', 'Server port', '3000')
  .action(async (options) => {
    const projectPath = discoverProjectDirectory();
    const { createServer } = await import('@kanban-reloaded/server');
    const server = await createServer({ projectPath, port: parseInt(options.port) });
    console.log(pc.green(`Dashboard running at http://127.0.0.1:${options.port}`));
  });
```

## The `move` Command and Agent Trigger

Moving a task to `in-progress` triggers the agent launcher — this is the core
workflow of the product:

```typescript
export const moveCommand = new Command('move')
  .description('Move a task to a new status')
  .argument('<task-id>', 'Task ID or display ID')
  .argument('<status>', 'New status: backlog, in-progress, done')
  .action(async (taskId, status) => {
    const task = taskService.moveTask(taskId, status);

    if (status === 'in-progress') {
      console.log(pc.yellow(`Agent launched for: ${task.displayId} — ${task.title}`));
      // Agent launcher is triggered by the server/core, not directly by CLI
    }

    console.log(pc.green(`Moved ${task.displayId} to ${status}`));
  });
```

## Key Rules

- **Always use `discoverProjectDirectory()`** to find the project root — never
  assume the current directory is correct.
- **Import business logic from `@kanban-reloaded/core`** — the CLI is a thin
  presentation layer, not a place for business logic.
- **Use descriptive error messages** — when something fails, tell the user what
  went wrong AND what they can do about it.
