// @kanban-reloaded/core — Entry point

// Schema (tabelle Drizzle)
export { tasksTable, configTable } from './models/schema.js';

// Tipi TypeScript
export type {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
  ColumnConfiguration,
  ProjectConfiguration,
} from './models/types.js';

// Storage e inizializzazione database
export { initializeDatabase, discoverProjectDirectory } from './storage/database.js';
export type { DatabaseInstance, DatabaseInitializationResult } from './storage/database.js';

// Servizi
export { TaskService } from './services/taskService.js';
export { ConfigService } from './services/configService.js';
