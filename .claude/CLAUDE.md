# Kanban Reloaded — Project Instructions

## Documenti di riferimento

- **PRD:** `docs/PRD.md` — Requisiti funzionali, architettura, ADR, stack tecnologico
- **Backlog:** `docs/BACKLOG.md` — 31 user stories, 8 epic, criteri di accettazione
- **Mockup UI:** `docs/mockup/` — Prototipo React funzionante, fonte di verita per la UI

---

## Backlog

Quando lavori ad una user story del `docs/BACKLOG.md`, ricordati di segnarla come IN PROGRESS. Quando hai finito, metti check sui criteri di accettazione rispettati e mettila in status DONE

## Team di agenti

Quando crei dei team di agenti, includi sempre:
- Un tester che scriva i test automatici e verifichi i criteri di accettazione
- Un code reviewer che revisioni il codice e si assicuri che sia di elevata qualità, forzando gli altri agenti a risolvere i problemi principali

## Regola Mockup — Fonte di verita per la UI

La directory `docs/mockup/src/app/components/` contiene il mockup funzionante della dashboard. Ogni componente UI di produzione (`packages/dashboard/`) **DEVE** replicare il mockup corrispondente.

### Design System

Definito in `docs/mockup/src/styles/`:

- **Font primario:** Inter (400, 500, 600, 700)
- **Font mono:** SF Mono, Monaco, Inconsolata, Roboto Mono
- **Colori principali (light):**
  - Background: `#F8F9FA` | Foreground: `#1A1A2E`
  - Primary/Accent: `#E67E22` (arancione)
  - Secondary: `#2980B9` (blu)
  - Success: `#27AE60` | Info: `#2980B9` | Warning: `#E67E22` | Destructive: `#dc3545`
  - Card: `#FFFFFF` | Border/Muted: `#E9ECEF`
- **Colori principali (dark):**
  - Background: `#1A1A2E` | Foreground: `#F5F5F5`
  - Card: `#16213E` | Muted: `#16213E`
  - Success: `#2ECC71` | Info: `#3498DB`
- **Border radius:** `0.5rem` (base)
- **CSS variables:** Usare le variabili definite in `theme.css`, NON colori hardcoded
- **Colori colonne board:** Backlog `bg-info` (#3498DB), In Progress `bg-warning` (#E67E22), Done `bg-success` (#2ECC71)

### Priorita task (da TaskCard.tsx)

| Priorita | Label | Classe CSS |
|---|---|---|
| `high` | "Alta" | `bg-destructive text-destructive-foreground` |
| `medium` | "Media" | `bg-warning text-white` |
| `low` | "Bassa" | `bg-info text-white` |


### Modello dati Task (da TaskCard.tsx — campo `position` aggiunto per ordinamento)

```typescript
interface Task {
  id: string;
  displayId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: "high" | "medium" | "low";
  status: "backlog" | "in-progress" | "done";
  agentRunning: boolean;
  agentLog?: string;
  createdAt: string;
  executionTime?: number;
  position: number; // ordinamento dentro la colonna
}
```

---


## Convenzioni di codice

- **Nomi parlanti e chiari** per classi, variabili, tabelle, colonne — mai abbreviazioni criptiche
- **Mai `any`** in TypeScript — usare tipi espliciti o `unknown` con type guard
- **Dipendenze workspace:** usare `workspace:*` per riferimenti tra packages
- **Package naming:** `@kanban-reloaded/<package-name>`
- **Server binding:** solo `127.0.0.1` (mai `0.0.0.0`)
- **Sanitizzazione:** ogni input utente e comando agent deve essere sanitizzato
- **`@fastify/static`:** registrare sempre con `serve: false` per evitare conflitti nel radix tree di `find-my-way` con route parametriche nested (es. `/api/tasks/:id/subtasks`). Gestire i file statici e il fallback SPA nel `setNotFoundHandler`.
- **Dev mode:** `pnpm dev` alla root avvia server Fastify (:3000) via `tsx watch` e dashboard Vite (:5173) in parallelo, senza necessita di build. Il server si riavvia automaticamente ad ogni modifica dei sorgenti. La dashboard Vite ha proxy configurati per `/api` e `/ws` verso il server.
- **Riavvio server in produzione:** in produzione il server (`kanban-reloaded serve`) carica i moduli ESM in memoria all'avvio. Dopo un build che tocca `core`, `server` o `cli`, il processo va riavviato per caricare il nuovo codice.
- **Exports condizionali di core:** `packages/core/package.json` ha la condizione `"development": "./src/index.ts"` negli exports, che permette a `tsx` di risolvere direttamente i sorgenti TypeScript senza build. In produzione (Node.js standard), viene usato `"import": "./dist/index.js"`.
