# Kanban Reloaded

A **local-first Kanban dashboard** for AI-assisted development. Manage your backlog, visualize tasks on a drag-and-drop board, and trigger AI coding agents — all from within your repository, with zero external dependencies.

## Architecture

This is a **pnpm monorepo** with four packages:

| Package | Description |
|---|---|
| `packages/core` | Data models, Drizzle ORM schemas, SQLite storage layer |
| `packages/server` | Fastify REST API + WebSocket server for real-time updates |
| `packages/dashboard` | React SPA with drag-and-drop Kanban board (Vite + Tailwind) |
| `packages/cli` | Commander.js CLI (`kanban-reloaded` binary) |

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Node.js** | >= 22.0.0 | [nodejs.org](https://nodejs.org/) |
| **pnpm** | >= 9.0.0 | `corepack enable && corepack prepare pnpm@9.15.4 --activate` |

> **Tip:** Node.js 22+ ships with Corepack, so you can enable pnpm without a separate install.

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url>
cd kanban-reloaded

# 2. Install dependencies
pnpm install

# 3. Start the development environment (no build needed)
pnpm dev
```

This starts:
- **Server** on `http://127.0.0.1:3000` — Fastify API via `tsx watch` (auto-restart on changes)
- **Dashboard** on `http://localhost:5173` — Vite dev server with HMR and proxy to the API/WebSocket server

## Available Scripts

Run these from the **repository root**:

| Command | Description |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm build` | Build all packages (needed only for production/CLI) |
| `pnpm dev` | Start server (tsx watch, :3000) + dashboard (Vite, :5173) |
| `pnpm test` | Run tests across all packages (Vitest) |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Remove build artifacts |

## Project Data

Kanban Reloaded stores its data locally in a `.kanban-reloaded/` directory at the project root (SQLite database + config). This directory is gitignored — each developer gets their own local instance.

## Documentation

- **[Product Requirements](docs/PRD.md)** — Full PRD with architecture decisions and tech stack
- **[Backlog](docs/BACKLOG.md)** — User stories organized by epic
- **[UI Mockup](docs/mockup/)** — Functional React prototype (source of truth for the UI)
