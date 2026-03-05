---
name: pnpm-monorepo-workspace
description: >
  Patterns and conventions for the Kanban Reloaded pnpm monorepo: workspace configuration,
  TypeScript project references, cross-package dependencies, and build scripts.
  Use this skill whenever working on root-level configuration files (pnpm-workspace.yaml,
  package.json, tsconfig.base.json, .gitignore), when adding or modifying dependencies
  between packages, when debugging cross-package import errors or workspace resolution
  issues, or when creating new packages in the monorepo. Also use when someone mentions
  build scripts, workspace setup, or monorepo infrastructure.
---

# pnpm Monorepo Workspace Patterns

This project is a pnpm monorepo with four packages under `packages/`. Every configuration
choice here exists to keep builds fast (TypeScript project references), dependencies
explicit (`workspace:*` protocol), and developer experience smooth (single root scripts
that orchestrate everything).

## Workspace Structure

```
kanban-reloaded/
├── pnpm-workspace.yaml        # Declares workspace packages
├── package.json               # Root scripts, shared devDependencies
├── tsconfig.base.json         # Shared TypeScript config
├── eslint.config.js           # Single ESLint flat config
├── .prettierrc                # Prettier rules
├── .gitignore
└── packages/
    ├── core/                  # @kanban-reloaded/core
    ├── server/                # @kanban-reloaded/server
    ├── dashboard/             # @kanban-reloaded/dashboard
    └── cli/                   # @kanban-reloaded/cli
```

## pnpm Workspace Configuration

`pnpm-workspace.yaml` — keep it minimal:

```yaml
packages:
  - 'packages/*'
```

## Root package.json Scripts

The root `package.json` orchestrates all packages through pnpm filters. These scripts
let you build, test, or lint the entire monorepo with a single command:

```json
{
  "private": true,
  "scripts": {
    "build": "pnpm -r run build",
    "dev": "pnpm -r --parallel run dev",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint",
    "clean": "pnpm -r run clean",
    "typecheck": "pnpm -r run typecheck"
  }
}
```

To target a single package, use `--filter`:
```bash
pnpm --filter @kanban-reloaded/core build
pnpm --filter @kanban-reloaded/dashboard dev
```

## Package Naming and Exports

Every package is scoped under `@kanban-reloaded/` and uses ESM:

```json
{
  "name": "@kanban-reloaded/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch",
    "clean": "rm -rf dist *.tsbuildinfo",
    "typecheck": "tsc --noEmit"
  }
}
```

The `exports` field must always point to actual build output paths. If the build
outputs to `dist/`, then exports point to `dist/`. Mismatched paths are a common
source of "module not found" errors.

## Inter-Package Dependencies

When one package depends on another, use the `workspace:*` protocol. This tells
pnpm to resolve the dependency from the local workspace instead of the registry:

```json
{
  "name": "@kanban-reloaded/server",
  "dependencies": {
    "@kanban-reloaded/core": "workspace:*"
  }
}
```

Never hardcode relative paths like `"file:../core"` — always use `workspace:*`.
This ensures proper dependency resolution and makes the monorepo publishable.

The dependency graph flows one way:
```
cli → server → core
dashboard (standalone, consumed by server as static files)
```

## TypeScript Configuration

### tsconfig.base.json (root)

Shared compiler options that all packages inherit:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

### Per-package tsconfig.json

Each package extends the base and adds project references for incremental builds:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }
  ]
}
```

`composite: true` is required for TypeScript project references to work. It enables
incremental compilation — only the packages that changed get rebuilt.

The dashboard package is special: it uses Vite's own TypeScript handling, so its
tsconfig focuses on type-checking rather than compilation. It does NOT need
`composite` or project references.

## ESLint and Prettier

Single ESLint flat config at root (`eslint.config.js`). Packages inherit automatically —
no per-package ESLint configs needed.

Prettier config at root (`.prettierrc`):
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

## .gitignore

```
node_modules/
dist/
*.tsbuildinfo
.kanban-reloaded/
```

The `.kanban-reloaded/` directory contains the SQLite database and config — it's
gitignored by default since it contains local runtime data.

## Common Pitfalls

1. **Using npm/yarn instead of pnpm** — This monorepo uses pnpm exclusively.
   Running `npm install` or `yarn` will create conflicting lock files and break
   workspace resolution.

2. **Hardcoding relative paths between packages** — Always import via package
   name (`import { TaskService } from '@kanban-reloaded/core'`), never via
   relative path (`import { TaskService } from '../../core/src'`).

3. **Mismatched exports field** — If you change the build output directory,
   update the `exports` field in package.json to match. A mismatch means
   other packages can't find the compiled code.

4. **Missing `workspace:*`** — If you add a new inter-package dependency and
   forget `workspace:*`, pnpm will try to fetch it from the npm registry
   (where it doesn't exist) and fail.

5. **Forgetting `composite: true`** — Without this flag in per-package
   tsconfig.json, TypeScript project references won't work and incremental
   builds break silently.
