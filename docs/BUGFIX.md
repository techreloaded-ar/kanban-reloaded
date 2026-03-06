# Kanban Reloaded — Bug Fix Tracker

Elenco dei bug verificati tramite test Playwright sulla dashboard.

---

## BUG-001: Eliminazione task senza conferma utente

**Gravita:** Alta
**Stato:** DONE
**Dove:** Pulsante "Elimina Task" nel pannello dettaglio + icona cestino on-hover sulle card

### Descrizione

Cliccando "Elimina Task" nel pannello dettaglio o l'icona cestino che appare al passaggio del mouse su una card, il task viene eliminato istantaneamente senza nessun dialog di conferma. Questo espone l'utente al rischio di eliminazioni accidentali e irreversibili.

### Comportamento atteso

Mostrare un dialog di conferma (es. "Sei sicuro di voler eliminare questo task? L'operazione non e reversibile.") con pulsanti "Annulla" / "Conferma". L'eliminazione deve procedere solo dopo conferma esplicita dell'utente.

### Soluzione applicata

Creato componente `ConfirmDeleteDialog.tsx` con dialog Radix UI (shadcn). Aggiunto stato `taskIdPendingDeletion` in `App.tsx` che funge da gate: la richiesta di eliminazione apre il dialog, e solo alla conferma esplicita viene eseguita la `deleteTask()`. Funziona sia dal cestino on-hover sulle card che dal pulsante "Elimina Task" nel pannello dettaglio.

### File coinvolti

- `packages/dashboard/src/App.tsx` — stato `taskIdPendingDeletion`, funzioni `requestDeleteTask`, `handleConfirmDelete`, `handleCancelDelete`
- `packages/dashboard/src/components/ConfirmDeleteDialog.tsx` — nuovo componente dialog di conferma
- `packages/dashboard/src/components/TaskDetailPanel.tsx` — rimosso `onClose()` dal click elimina (il dialog gestisce il flusso)

### Screenshot

`test-bug-001-confirm-dialog.png`

---

## BUG-002: Due pulsanti duplicati per creare un task

**Gravita:** Media
**Stato:** DONE
**Dove:** Header della dashboard

### Descrizione

Nella dashboard sono presenti due pulsanti distinti per la creazione di un task:

1. **"Nuovo Task"** — in alto a destra nella TopBar, arancione
2. **"Crea Task"** — sotto i filtri (Tutti / Backlog / In Progress / Done), arancione

Entrambi aprono lo stesso modal di creazione task, generando confusione nell'utente.

### Comportamento atteso

Rimuovere il pulsante "Nuovo Task" dalla TopBar. Mantenere solo "Crea Task" nella barra filtri, che e contestualmente piu appropriato e allineato alla board.

### Soluzione applicata

Rimosso il pulsante "Nuovo Task" e la prop `onNewTask` dal componente `TopBar`. La TopBar ora contiene solo il titolo, la barra di ricerca e il toggle tema. Il pulsante "Crea Task" nella barra filtri del `KanbanBoard` resta l'unico punto di accesso per la creazione task.

### File coinvolti

- `packages/dashboard/src/components/TopBar.tsx` — rimosso pulsante "Nuovo Task" e prop `onNewTask`
- `packages/dashboard/src/App.tsx` — rimossa prop `onNewTask` dal JSX di `TopBar`

### Screenshot

`test-bug-002-no-duplicate-button.png`

---

## BUG-003: Pulsante elimina task sovrapposto all'indicatore subtask sulla card

**Gravita:** Media
**Stato:** DONE
**Dove:** Card nella board, angolo in basso a destra, visibile on-hover

### Descrizione

Al passaggio del mouse su una card con sotto-attivita, l'icona cestino per eliminare il task appare nell'angolo in basso a destra, sovrapponendosi esattamente all'indicatore di progresso subtask (es. "0/2"). I due elementi diventano illeggibili e il click potrebbe colpire l'elemento sbagliato.

### Comportamento atteso

Riposizionare il pulsante elimina in modo che non si sovrapponga all'indicatore subtask.

### Soluzione applicata

Spostato il pulsante cestino da `absolute bottom-2 right-2` a `absolute top-2 right-2`. Il cestino ora appare nell'angolo in alto a destra della card, lontano dalla progress bar dei subtask in basso. Inoltre, il cestino viene nascosto quando l'agent AI e in esecuzione per evitare sovrapposizione con lo spinner.

### File coinvolti

- `packages/dashboard/src/components/TaskCard.tsx` — cambiata posizione da `bottom-2` a `top-2`, aggiunta condizione `!task.agentRunning`

### Screenshot

`test-bug-003-delete-position.png`

---

## BUG-004: Container colonna Kanban non contiene tutti i task

**Gravita:** Media
**Stato:** DONE
**Dove:** Colonne della board (Backlog, In Progress, Done)

### Descrizione

Quando una colonna contiene 4 o piu task, il bordo inferiore del container della colonna taglia a meta l'ultima card. Il container ha un'altezza insufficiente o un `overflow: hidden` che impedisce la visualizzazione completa di tutti i task.

### Comportamento atteso

Il container della colonna deve espandersi per contenere tutte le card, oppure avere uno scroll interno (`overflow-y: auto`) con il bordo visibile sotto l'ultima card.

### Soluzione applicata

Resa ogni colonna un flex column (`flex flex-col`) con la zona task impostata a `flex-1 overflow-y-auto`. Aggiunto `min-h-0` al container delle colonne nel `KanbanBoard` per consentire lo shrink in un flex context. Ogni colonna ora scrolla indipendentemente quando i task eccedono l'altezza disponibile.

### File coinvolti

- `packages/dashboard/src/components/KanbanColumn.tsx` — aggiunto `flex flex-col` al container colonna, `flex-1 overflow-y-auto` alla zona task
- `packages/dashboard/src/components/KanbanBoard.tsx` — aggiunto `min-h-0` al container colonne

### Screenshot

`test-bug-002-no-duplicate-button.png` (visibile scrollbar nella colonna Backlog con 7 task)

---

## BUG-005: Bordo focus arancione tagliato a sinistra sull'input "Nuova sotto-attivita"

**Gravita:** Bassa
**Stato:** DONE
**Dove:** Pannello dettaglio task, sezione Sotto-attivita, input "Nuova sotto-attivita..."

### Descrizione

Quando l'input per aggiungere una nuova sotto-attivita riceve il focus, il bordo arancione (`ring` / `outline`) viene tagliato sul lato sinistro. Il container padre ha un `overflow: hidden` o padding insufficiente che non lascia spazio al bordo di focus.

### Comportamento atteso

Il bordo di focus deve essere completamente visibile su tutti e 4 i lati.

### Soluzione applicata

Aggiunto `p-0.5 -m-0.5` al container dei subtask (`<div className="space-y-2">`). Il padding di 2px da spazio al ring di focus (che usa `box-shadow`, tagliato da `overflow: hidden` della `ScrollArea`), mentre il margine negativo compensa il padding per non alterare il layout visivo.

### File coinvolti

- `packages/dashboard/src/components/TaskDetailPanel.tsx` — aggiunto `p-0.5 -m-0.5` al container subtask

### Screenshot

`test-bug-005-focus-ring.png`

---

## BUG-006: Flash/refresh visibile durante drag and drop

**Gravita:** Media
**Stato:** DONE
**Dove:** Board Kanban, durante spostamento card tra colonne o riordinamento

### Descrizione

Quando si sposta una card in un'altra colonna o si cambia l'ordine tramite drag and drop, si verifica un flash visibile: la card torna brevemente alla posizione originale prima di riapparire nella nuova posizione. Questo accade perche:

1. `handleMoveTask` e `handleReorderTasks` in `App.tsx` fanno un aggiornamento ottimistico parziale, ma subito dopo chiamano `await fetchTasks()` che sovrascrive lo stato con i dati dal server
2. Il WebSocket handler `handleWebSocketTaskEvent` chiama anch'esso `fetchTasks()` per ogni evento task
3. Dopo un drag and drop si verificano quindi **due refresh consecutivi**: uno dal handler e uno dall'evento WebSocket

### Comportamento atteso

Implementare un aggiornamento ottimistico completo senza flash.

### Soluzione applicata

1. Rimosso `await fetchTasks()` dal percorso di successo di `handleMoveTask` e `handleReorderTasks` — l'aggiornamento ottimistico locale diventa la fonte di verita
2. Aggiunto ref `pendingLocalActionsCount` come semaforo: incrementato prima dell'API call, decrementato quando arriva l'evento WebSocket corrispondente
3. Il WebSocket handler filtra per tipo evento: solo `task:updated` e `task:reordered` vengono soppressi dal contatore, mentre `task:created` e `task:deleted` passano sempre per non perdere aggiornamenti esterni
4. Rollback allo stato precedente solo in caso di errore API
5. Aggiunto `.sort((a, b) => a.position - b.position)` in `tasksByStatus` nel `KanbanBoard` per garantire l'ordine corretto dopo aggiornamenti ottimistici

### File coinvolti

- `packages/dashboard/src/App.tsx` — `handleMoveTask`, `handleReorderTasks`, `handleWebSocketTaskEvent`, ref `pendingLocalActionsCount`
- `packages/dashboard/src/components/KanbanBoard.tsx` — aggiunto sort per position in `tasksByStatus`
