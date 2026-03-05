import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const tasksTable = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  displayId: text('display_id').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  acceptanceCriteria: text('acceptance_criteria').notNull().default(''),
  priority: text('priority', { enum: ['high', 'medium', 'low'] }).notNull().default('medium'),
  status: text('status', { enum: ['backlog', 'in-progress', 'done'] }).notNull().default('backlog'),
  agentRunning: integer('agent_running', { mode: 'boolean' }).notNull().default(false),
  agentLog: text('agent_log'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
  executionTime: real('execution_time'),
  position: real('position').notNull().default(0),
});

export const configTable = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON-encoded
});
