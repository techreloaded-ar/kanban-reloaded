# Kanban Reloaded — Product Requirements Document

**Author:** AIRchetipo
**Date:** 2026-03-05
**Version:** 1.0

---

## Elevator Pitch

> For **sviluppatori che utilizzano AI coding agent**, che hanno il problema di **non avere un modo strutturato e locale per gestire il backlog e orchestrare il lavoro degli agent**, **Kanban Reloaded** is a **local-first Kanban dashboard** che **permette di visualizzare, gestire e triggerare agent AI direttamente da una board visuale nel proprio repository**. Unlike **Vibe Kanban e tool cloud-based come Jira/Linear**, our product **vive interamente nel repository, non richiede servizi esterni, e automatizza il lancio degli agent AI tramite drag-and-drop**.

---

## Vision

Rendere la gestione del lavoro AI-assistito naturale come fare un git commit: locale, veloce, integrata nel flusso di sviluppo. Ogni repository diventa un workspace autonomo dove il backlog, la board e gli agent convivono senza dipendenze esterne.

### Strategic Objectives

1. **Zero-config setup** — Installare e partire in meno di 30 secondi, senza account o servizi cloud
2. **Agent-first workflow** — Il drag-and-drop su "In Progress" è il trigger naturale per avviare lo sviluppo AI-assistito
3. **Repository as single source of truth** — Il backlog vive nel repo, versionato con il codice
4. **Multi-agent support** — Supportare diversi AI agent (Claude Code, Cursor, Aider, comandi shell custom)
5. **Developer experience eccellente** — Dashboard intuitiva, CLI potente, API per automazioni

### Long-Term Impact

Trasformare il modo in cui i developer interagiscono con gli AI agent: da un workflow manuale e frammentato (aprire terminale, copiare task, lanciare agent) a un'orchestrazione visuale e automatizzata. Kanban Reloaded diventa il "control center" per lo sviluppo AI-assistito, rendendo ogni sviluppatore produttivo come un piccolo team.

---

## User Personas

### Persona 1: Marco

**Role:** Sviluppatore Indie / Freelance
**Age:** 32 | **Background:** Full-stack developer con 8 anni di esperienza, lavora su progetti personali e freelance. Ha abbracciato gli AI coding agent da un anno e li usa quotidianamente.

**Goals:**
- Organizzare il lavoro sui propri progetti senza overhead di tool complessi
- Delegare task ripetitivi o ben definiti agli AI agent in modo efficiente
- Avere visibilita immediata sullo stato del progetto
- Mantenere tutto nel repository senza dipendenze esterne

**Pain Points:**
- Tiene il backlog in file markdown sparsi o nella propria testa
- Deve copiare manualmente la descrizione del task e passarla all'agent
- Non ha un modo rapido per vedere cosa e stato fatto e cosa resta
- I tool di project management sono troppo pesanti per un progetto individuale

**Behaviors & Tools:**
- Usa VS Code o un terminale come ambiente principale
- Lavora con Claude Code e occasionalmente Cursor
- Preferisce tool CLI-first con interfaccia web opzionale
- Fa commit frequenti, lavora su branch feature

**Motivations:** Velocita e semplicita. Vuole massimizzare l'output senza burocrazia.
**Tech Savviness:** Alto — a suo agio con terminale, CLI, configurazione manuale

#### Customer Journey — Marco

| Phase | Action | Thought | Emotion | Opportunity |
|---|---|---|---|---|
| Awareness | Vede Kanban Reloaded menzionato in un thread su X/Reddit | "Un altro tool? Vediamo se risolve il mio problema di gestione task con gli agent" | Curiosita scettica | Messaging chiaro: "Kanban locale per AI agent" |
| Consideration | Legge il README, vede il demo GIF | "Si installa con npm, backlog locale, drag-and-drop lancia l'agent... interessante" | Interesse crescente | README con quick-start in 3 step |
| First Use | Installa, lancia la dashboard, crea 5 task | "Wow, ci ho messo 2 minuti. Trascino il primo task in Progress e parte Claude Code" | Entusiasmo | Onboarding zero-friction |
| Regular Use | Ogni mattina apre la board, trascina 2-3 task in Progress | "Questo e il mio workflow standard ora. Non potrei tornare indietro" | Soddisfazione | Template di task, shortcut |
| Advocacy | Condivide il tool con altri dev indie | "Dovete provare Kanban Reloaded, ha cambiato il mio modo di lavorare con gli AI agent" | Orgoglio | Sharing facile, star su GitHub |

---

### Persona 2: Sara

**Role:** Tech Lead in una startup (team di 4 sviluppatori)
**Age:** 38 | **Background:** 12 anni di esperienza, guida un team che sta adottando AI agent per accelerare lo sviluppo. Cerca un modo per coordinare chi fa cosa, inclusi gli agent.

**Goals:**
- Avere visibilita su cosa stanno facendo gli agent e cosa e stato completato
- Coordinare il lavoro tra sviluppatori umani e agent AI
- Mantenere il backlog allineato con il codice senza tool separati
- Ridurre il context-switching tra IDE, terminale e project management

**Pain Points:**
- Il team usa Jira ma non e integrato con gli AI agent
- Non sa se un agent ha completato un task finche non controlla manualmente
- Il backlog su Jira e quello che gli agent vedono sono spesso disallineati
- Troppi tool separati: IDE + terminale + Jira + Slack

**Behaviors & Tools:**
- Usa VS Code, gestisce il progetto con Git
- Il team sta sperimentando Claude Code e Cursor
- Fa code review, definisce architettura e priorita
- Preferisce tool che si integrano con il workflow Git esistente

**Motivations:** Controllo e visibilita. Vuole sapere cosa succede senza micromanagement.
**Tech Savviness:** Alto — background da sviluppatore, ora piu orientata alla gestione

#### Customer Journey — Sara

| Phase | Action | Thought | Emotion | Opportunity |
|---|---|---|---|---|
| Awareness | Un membro del team le mostra Kanban Reloaded | "Potrebbe risolvere il problema di coordinamento agent-team" | Interesse cauto | Use case per team piccoli |
| Consideration | Prova su un progetto secondario | "Il backlog nel repo e geniale, tutti vedono lo stesso stato con git pull" | Sorpresa positiva | Documentazione per team workflow |
| First Use | Configura Kanban Reloaded sul progetto principale del team | "Ok, funziona. Vedo i task degli agent aggiornarsi in tempo reale" | Sollievo | Setup guide per team |
| Regular Use | Usa la board nel daily standup per vedere lo stato | "La board e il nostro single source of truth ora" | Fiducia | Dashboard read-only per review |
| Advocacy | Propone Kanban Reloaded al CTO per altri team | "Dovremmo adottarlo su tutti i progetti, semplifica tutto" | Convinzione | Case study / metriche |

---

## Goals & Success Metrics

| Metric | Target MVP | Target 6 mesi |
|---|---|---|
| Tempo di setup (install → primo task) | < 60 secondi | < 30 secondi |
| Task creati per progetto (media) | 10+ | 30+ |
| % task completati via agent trigger | > 50% | > 70% |
| Soddisfazione utente (NPS) | > 30 | > 50 |
| Progetti attivi (installazioni con uso settimanale) | 100 | 1.000 |

### Business KPIs

- **Adozione:** Numero di installazioni npm settimanali
- **Retention:** % di utenti che usano Kanban Reloaded per piu di 4 settimane consecutive
- **Engagement:** Numero medio di task mossi in "In Progress" per settimana per progetto
- **Community:** Star GitHub, contributor attivi, issue aperte

---

## Product Scope

### MVP — Minimum Viable Product

1. **Backlog locale** — Storage in SQLite nel repository (`.kanban-reloaded/database.sqlite`)
2. **Dashboard Kanban** — Interfaccia web locale con 3 colonne: Backlog, In Progress, Done
3. **Drag-and-drop** — Spostamento card tra colonne con feedback visuale immediato
4. **Agent trigger automatico** — Spostare una card in "In Progress" lancia l'agent AI configurato
5. **CRUD task** — Creare, modificare, eliminare task dalla dashboard
6. **CLI base** — Comandi per add, list, move, update task dal terminale
7. **API REST** — Endpoint per gli agent per aggiornare lo stato dei task
8. **Configurazione agent** — File di configurazione per definire quale agent usare e come invocarlo
9. **Stato real-time** — La dashboard si aggiorna quando un agent modifica un task

### Growth Features (Post-MVP)

- **Task dependencies** — Definire relazioni tra task (blocca/e bloccato da)
- **History e audit log** — Storico completo delle modifiche a ogni task
- **Subtask** — Scomposizione di task in sotto-attivita
- **Label e filtri** — Categorizzazione e ricerca avanzata
- **Template di task** — Modelli riutilizzabili per task comuni
- **Import/Export markdown** — Interoperabilita con file BACKLOG.md esistenti
- **Notifiche desktop** — Avviso quando un agent completa un task
- **Multiple board** — Piu board per diversi aspetti del progetto (feature, bug, tech debt)

### Vision (Future)

- **AI task decomposition** — L'agent analizza un epic e lo scompone automaticamente in task
- **Multi-repo dashboard** — Vista aggregata su piu repository
- **Plugin system** — Estensioni per integrazioni custom (Slack, Discord, webhook)
- **IDE extension** — Panel nativo in VS Code / JetBrains
- **Metriche e analytics** — Velocity, lead time, throughput con grafici
- **Collaborative mode** — Sincronizzazione real-time per team (opzionale, via Git o P2P)

---

## Technical Architecture

> **Proposed by:** Leonardo (Architect)

### System Architecture

Kanban Reloaded segue un'architettura **monolitica modulare local-first**. Un singolo processo Node.js serve sia l'API REST che la dashboard statica. Il database SQLite vive nel repository. La CLI e un entry point separato che interagisce con lo stesso database.

**Architectural Pattern:** Monolite modulare local-first

**Main Components:**
1. **Core** — Modelli dati, logica di business, accesso al database
2. **API Server** — Server HTTP con endpoint REST per CRUD task e WebSocket per aggiornamenti real-time
3. **Dashboard** — Single Page Application React servita staticamente dal server
4. **CLI** — Interfaccia a riga di comando per operazioni rapide
5. **Agent Launcher** — Modulo che gestisce il lancio e il monitoraggio degli agent AI

```
┌─────────────────────────────────────────────────┐
│                   Developer                      │
│         ┌──────────┐  ┌──────────┐              │
│         │ Browser  │  │ Terminal │              │
│         └────┬─────┘  └────┬─────┘              │
│              │              │                    │
│         ┌────▼─────┐  ┌────▼─────┐              │
│         │Dashboard │  │   CLI    │              │
│         │ (React)  │  │          │              │
│         └────┬─────┘  └────┬─────┘              │
│              │              │                    │
│         ┌────▼──────────────▼─────┐              │
│         │    API Server (HTTP)    │              │
│         │    + WebSocket          │              │
│         └────┬──────────────┬─────┘              │
│              │              │                    │
│    ┌─────────▼───┐   ┌─────▼──────────┐         │
│    │    Core     │   │ Agent Launcher │         │
│    │  (SQLite)   │   │  (subprocess)  │         │
│    └─────────────┘   └────────────────┘         │
│                                                  │
│    .kanban-reloaded/                                   │
│    ├── database.sqlite                           │
│    └── config.json                               │
└─────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Language | TypeScript | 5.x | Type safety, ottimo ecosistema, standard per tool developer |
| Runtime | Node.js | 22.x LTS | Stabile, diffuso, nativo per tool CLI e server |
| Backend Framework | Fastify | 5.x | Leggero, veloce, supporto WebSocket nativo, plugin ecosystem |
| Frontend Framework | React | 19.x | Standard de facto, ottimo ecosistema per drag-and-drop |
| Drag & Drop | @hello-pangea/dnd | 17.x | Fork mantenuto di react-beautiful-dnd, API intuitiva |
| Build Frontend | Vite | 6.x | Build veloce, ottimo DX, standard moderno |
| Database | SQLite | 3.x | Local-first, zero-config, file-based, perfetto per dati nel repo |
| SQLite Binding | better-sqlite3 | 11.x | Sincrono, veloce, API pulita per Node.js |
| ORM/Query Builder | Drizzle ORM | 0.38.x | Leggero, type-safe, ottimo supporto SQLite |
| CLI Framework | Commander.js | 13.x | Standard per CLI Node.js, API semplice e documentata |
| WebSocket | @fastify/websocket | 11.x | Integrazione nativa con Fastify per real-time updates |
| Testing | Vitest | 3.x | Veloce, compatibile con Vite, API moderna |

### Project Structure

**Organizational pattern:** Monorepo con workspace, separazione per responsabilita

```
kanban-reloaded/
├── packages/
│   ├── core/                      # Logica di business e accesso dati
│   │   ├── src/
│   │   │   ├── models/            # Modelli dati (Task, Board, Config)
│   │   │   ├── storage/           # Layer di accesso SQLite
│   │   │   ├── services/          # Logica di business
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── server/                    # API HTTP + WebSocket
│   │   ├── src/
│   │   │   ├── routes/            # Endpoint REST
│   │   │   ├── websocket/         # Handler WebSocket
│   │   │   ├── agent-launcher/    # Lancio e monitoraggio agent
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── dashboard/                 # Frontend React
│   │   ├── src/
│   │   │   ├── components/        # Componenti UI (Board, Card, Column)
│   │   │   ├── hooks/             # Custom hooks (useWebSocket, useDragDrop)
│   │   │   ├── stores/            # State management
│   │   │   ├── styles/            # CSS/Tailwind
│   │   │   └── App.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── cli/                       # Interfaccia a riga di comando
│       ├── src/
│       │   ├── commands/          # Comandi (add, list, move, start)
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                   # Root workspace
├── tsconfig.base.json
├── .kanban-reloaded/                    # Dati locali (gitignored opzionalmente)
│   ├── database.sqlite
│   └── config.json
└── README.md
```

### Development Environment

Ambiente di sviluppo standard Node.js con workspace npm/pnpm.

**Required tools:**
- Node.js 22.x LTS
- pnpm 9.x (package manager, workspace support nativo)
- Git

### CI/CD & Deployment

**Build tool:** Vite (frontend) + tsc (backend packages)

**Pipeline:**
1. Lint (ESLint + Prettier)
2. Type check (tsc --noEmit)
3. Unit test (Vitest)
4. Build (tutti i packages)
5. Integration test
6. Publish su npm

**Deployment:** Distribuzione come pacchetto npm globale (`npm install -g kanban-reloaded`). Nessun server da deployare — tutto gira in locale sulla macchina dello sviluppatore.

**Target infrastructure:** Macchina locale dello sviluppatore (macOS, Linux, Windows). Nessuna infrastruttura cloud richiesta.

### Architecture Decision Records (ADR)

**ADR-001: SQLite come storage locale**
- *Contesto:* Serve un database locale che viva nel repository
- *Decisione:* SQLite con better-sqlite3
- *Motivazione:* Zero-config, file singolo, performante, supporto nativo per concurrency in lettura. JSON sarebbe troppo fragile per operazioni concorrenti (CLI + server + agent). SQLite gestisce il locking automaticamente.

**ADR-002: Monolite modulare vs microservizi**
- *Contesto:* Il sistema ha piu componenti (API, dashboard, CLI)
- *Decisione:* Monolite modulare con workspace
- *Motivazione:* Per un tool locale, un singolo processo e la scelta naturale. Meno complessita operativa, deploy semplice (un pacchetto npm). La modularita interna tramite workspace garantisce separazione delle responsabilita.

**ADR-003: WebSocket per aggiornamenti real-time**
- *Contesto:* La dashboard deve aggiornarsi quando un agent modifica un task
- *Decisione:* WebSocket tramite @fastify/websocket
- *Motivazione:* Polling sarebbe inefficiente e introdurrebbe latenza percepibile. I WebSocket forniscono aggiornamenti istantanei con overhead minimo. Essendo tutto locale, non ci sono problemi di scalabilita.

**ADR-004: Subprocess per lancio agent**
- *Contesto:* Quando un task va in "In Progress", deve partire un agent AI
- *Decisione:* Lancio tramite child_process.spawn con configurazione in config.json
- *Motivazione:* Massima flessibilita — qualsiasi agent che accetti un prompt via CLI puo essere integrato. Il config.json definisce il comando template (es. `claude-code --task "{{task_description}}"`).

---

## Functional Requirements

### Area: Gestione Task

| ID | Requisito | Priorita |
|---|---|---|
| FR1 | Il sistema deve permettere di creare un task con titolo, descrizione e criteri di accettazione | Must |
| FR2 | Il sistema deve permettere di modificare titolo, descrizione e criteri di accettazione di un task esistente | Must |
| FR3 | Il sistema deve permettere di eliminare un task | Must |
| FR4 | Il sistema deve assegnare automaticamente un identificativo univoco incrementale a ogni task | Must |
| FR5 | Il sistema deve permettere di assegnare una priorita a ogni task (alta, media, bassa) | Should |

### Area: Kanban Board

| ID | Requisito | Priorita |
|---|---|---|
| FR6 | La dashboard deve visualizzare i task in una board Kanban con colonne: Backlog, In Progress, Done | Must |
| FR7 | L'utente deve poter spostare i task tra le colonne tramite drag-and-drop | Must |
| FR8 | L'utente deve poter riordinare i task all'interno di una colonna tramite drag-and-drop | Should |
| FR9 | La board deve aggiornarsi in tempo reale quando lo stato di un task cambia (via WebSocket) | Must |
| FR10 | La dashboard deve mostrare il numero di task per colonna | Should |

### Area: Agent Integration

| ID | Requisito | Priorita |
|---|---|---|
| FR11 | Spostare un task nella colonna "In Progress" deve lanciare automaticamente l'agent AI configurato | Must |
| FR12 | Il comando dell'agent deve ricevere come parametro il titolo e la descrizione del task | Must |
| FR13 | Il sistema deve esporre un'API REST che permetta all'agent di aggiornare lo stato del task (es. completarlo, aggiungere note) | Must |
| FR14 | Il sistema deve permettere di configurare il comando dell'agent tramite file di configurazione (`.kanban-reloaded/config.json`) | Must |
| FR15 | Il sistema deve supportare la configurazione di agent multipli (es. uno per feature, uno per bugfix) | Could |

### Area: CLI

| ID | Requisito | Priorita |
|---|---|---|
| FR16 | La CLI deve permettere di aggiungere un task (`kanban-reloaded add "titolo" --description "desc"`) | Must |
| FR17 | La CLI deve permettere di listare i task con filtro per stato (`kanban-reloaded list --status backlog`) | Must |
| FR18 | La CLI deve permettere di spostare un task tra stati (`kanban-reloaded move <id> in-progress`) | Must |
| FR19 | La CLI deve permettere di avviare il server della dashboard (`kanban-reloaded serve`) | Must |

### Area: Storage e Configurazione

| ID | Requisito | Priorita |
|---|---|---|
| FR20 | Il backlog deve essere salvato in un file SQLite locale nella directory `.kanban-reloaded/` del repository | Must |
| FR21 | Il sistema deve creare automaticamente il database e la struttura delle tabelle al primo utilizzo | Must |
| FR22 | Il file di configurazione deve permettere di specificare: comando agent, porta del server, colonne custom | Must |

---

## Non-Functional Requirements

### Performance

| ID | Requisito | Target |
|---|---|---|
| NFR1 | La dashboard deve caricarsi in meno di 1 secondo su localhost | < 1s |
| NFR2 | L'operazione di drag-and-drop deve avere feedback visuale istantaneo (< 100ms) | < 100ms |
| NFR3 | Le operazioni CRUD via API devono rispondere in meno di 50ms | < 50ms |
| NFR4 | Il sistema deve gestire fino a 500 task per board senza degrado percepibile | 500 task |

### Security

| ID | Requisito |
|---|---|
| NFR5 | Il server deve ascoltare solo su localhost (127.0.0.1), non esposto sulla rete |
| NFR6 | L'esecuzione di comandi agent deve essere sanitizzata per prevenire command injection |
| NFR7 | Il file di configurazione non deve contenere credenziali — gli agent usano le proprie configurazioni di autenticazione |

### Scalability

| ID | Requisito |
|---|---|
| NFR8 | L'architettura deve supportare l'aggiunta di nuove colonne senza modifiche al database schema |
| NFR9 | Il sistema di plugin/agent deve essere estensibile senza modifiche al core |

### Accessibility

| ID | Requisito |
|---|---|
| NFR10 | La board Kanban deve essere navigabile da tastiera (Tab per card, Enter per dettaglio, frecce per spostamento) |
| NFR11 | Le card devono avere attributi ARIA appropriati per screen reader |

### Integrations

| ID | Requisito |
|---|---|
| NFR12 | Supporto per Claude Code come agent (template comando preconfigurato) |
| NFR13 | Supporto per comandi shell generici come agent (massima flessibilita) |
| NFR14 | API REST documentata con OpenAPI spec per integrazioni di terze parti |

---

## Next Steps

1. **UX Design** — Definire i wireframe dettagliati della dashboard Kanban e il flusso drag-and-drop → agent launch
2. **Detailed Architecture** — Approfondire lo schema del database, il protocollo WebSocket e il formato di configurazione agent
3. **Backlog** — Scomporre i requisiti funzionali in epic e user story con criteri di accettazione
4. **Validation** — Prototipo rapido del flusso core (drag → agent launch) per validare la fattibilita tecnica

---

_PRD generated via AIRchetipo Product Inception — 2026-03-05_
_Session conducted by: Developer with the AIRchetipo team_
