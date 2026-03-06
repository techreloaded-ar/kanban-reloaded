// @kanban-reloaded/core — Entry point

// Schema (tabelle Drizzle)
export { tasksTable, taskDependenciesTable, subtasksTable, configTable } from './models/schema.js';

// Tipi TypeScript
export type {
  Task,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
  TaskDependency,
  TaskWithDependencies,
  Subtask,
  CreateSubtaskInput,
  UpdateSubtaskInput,
  SubtaskProgress,
  AgentConfiguration,
  AgentDetailedConfiguration,
  ColumnConfiguration,
  ProjectConfiguration,
  ConfigurationFileError,
} from './models/types.js';

// Costanti condivise
export { KANBAN_DIRECTORY_NAME, DATABASE_FILENAME, CONFIG_FILENAME } from './storage/constants.js';

// Storage e inizializzazione database
export { initializeDatabase, discoverProjectDirectory } from './storage/database.js';
export type { DatabaseInstance, DatabaseInitializationResult } from './storage/database.js';

// Servizi
export { TaskService } from './services/taskService.js';
export { ConfigService } from './services/configService.js';
export { ConfigRepository } from './services/configRepository.js';
