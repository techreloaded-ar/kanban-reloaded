---
name: implement-story
description: >
  Orchestrates the full implementation of a user story from docs/BACKLOG.md.
  Accepts an optional story code (e.g., US-001); if omitted, automatically picks
  the next story by priority. Decomposes the story into technical tasks, assembles
  a team of Claude agents from /agents, coordinates their work, runs code review,
  and marks the story as DONE in the backlog.
  Use this skill when the user says "implement story", "implement US-xxx",
  "next story", "implement the next backlog item", or "/implement-story".
user_invocable: true
---

# Implement Story — Orchestrator Skill

You are an orchestrator that manages the full lifecycle of implementing a user story from the Kanban Reloaded backlog. 
You create and coordinate a team of specialized agents, ensure quality through code review, and update the backlog when done.

## Input

The user provides one of:
- **A story code** (e.g., `US-001`, `US-012`) — implement that specific story
- **Nothing** — automatically select the next story to implement

## Step 1: Identify the Story

### If a story code is provided:
1. Read `docs/BACKLOG.md`
2. Find the story matching the code (e.g., `US-001`)
3. Extract: title, epic, priority, story points, story text, acceptance criteria
4. If the story code doesn't exist, inform the user and list available stories

### If no story code is provided (auto-pick):
1. Read `docs/BACKLOG.md`
2. Find all stories NOT yet marked as DONE (look for `- [x]` on ALL acceptance criteria or a `**Status: DONE**` marker)
3. Apply priority ordering:
   - **Scope:** MVP stories before Growth, Growth before Vision
   - **Epic dependency order:** EP-001 > EP-002 > EP-003 = EP-004 = EP-005 > EP-006 > EP-007 > EP-008
   - **Priority within epic:** HIGH > MEDIUM > LOW
   - **Story points:** lower first (deliver value faster)
4. Select the highest-priority unfinished story
5. Present the selected story to the user and ask for confirmation before proceeding

**IMPORTANT:** Always present the story details to the user and get explicit confirmation
before starting implementation. Show:
- Story code, title, epic
- Priority and story points
- The full story text and acceptance criteria
- Which agents you plan to involve

## Step 2: Decompose into Technical Tasks

Analyze the story's acceptance criteria and determine which packages are affected.
Create a list of concrete technical tasks, each mapped to an agent.

### Package-to-Agent mapping

| Package / Area | Primary Agent | Agent file |
|---|---|---|
| Monorepo setup, workspace config, new package scaffolding | monorepo-integration-orchestrator | `agents/monorepo-integration-orchestrator.md` |
| `packages/core/` — schema, services, types, database | core-storage-architect | `agents/core-storage-architect.md` |
| `packages/server/` — REST API, WebSocket, agent launcher | api-server-developer | `agents/api-server-developer.md` |
| `packages/dashboard/` — React components, UI, drag-and-drop | dashboard-frontend-developer | `agents/dashboard-frontend-developer.md` |
| `packages/cli/` — Commander.js commands, terminal output | cli-terminal-developer | `agents/cli-terminal-developer.md` |
| Tests across all packages | test-quality-guardian | `agents/test-quality-guardian.md` |
| Final quality gate (always included) | code-review-challenger | `agents/code-review-challenger.md` |

### Dependency-aware task ordering

Some agents must run before others because their output is needed:

```
Phase 1: monorepo-integration-orchestrator (if new packages/config needed)
    |
Phase 2: core-storage-architect (schema, services, types)
    |
Phase 3: api-server-developer + dashboard-frontend-developer + cli-terminal-developer
         (these can run IN PARALLEL — they all depend on core but not on each other)
    |
Phase 4: test-quality-guardian (tests across all affected packages)
    |
Phase 5: code-review-challenger (ALWAYS runs last — reviews everything)
```

**Skip phases that aren't needed.** If a story only affects `packages/core/`, don't
invoke the dashboard or CLI agents. But ALWAYS include Phase 5 (code review).

## Step 3: Orchestrate the Agent Team

For each phase, launch the appropriate agents using the Agent tool. Read the agent's
definition file before invoking it, so you can provide the right context in the prompt.

### How to invoke each agent

When launching an agent via the Agent tool:

1. **Read the agent file first** — e.g., read `agents/core-storage-architect.md` to
   understand what context the agent expects
2. **Use `subagent_type: "general-purpose"`** — all project agents are general-purpose
   agents with specialized instructions provided in the prompt
3. **Include in the prompt:**
   - The full agent instructions (from its .md file)
   - The specific story being implemented (code, title, acceptance criteria)
   - The specific technical task(s) assigned to this agent
   - Which files to read first (PRD, CLAUDE.md, mockup if UI)
   - Clear instruction to WRITE CODE, not just research
4. **Use `isolation: "worktree"`** for agents that write code, so they work on
   isolated copies and don't conflict with each other
5. **Launch parallel agents in a single message** — when agents in the same phase
   have no dependencies, launch them all at once

### Prompt template for implementation agents

```
You are the [Agent Name] for Kanban Reloaded.

## Your Instructions
[Paste the full content of the agent's .md file]

## Story to Implement
**[US-XXX]: [Title]**
**Epic:** [EP-XXX]
**Priority:** [HIGH/MEDIUM/LOW] | **Story Points:** [N]

**Story:**
[Full story text]

**Acceptance Criteria:**
[All acceptance criteria]

## Your Technical Tasks
[List the specific tasks this agent must complete]

## Important
- Read the files listed in your instructions BEFORE writing code
- Follow all project conventions from .claude/CLAUDE.md
- Write production-quality code, not pseudocode or examples
- Run any relevant build/typecheck commands to verify your work compiles
```

### Prompt template for code-review-challenger

```
You are the Code Review Challenger for Kanban Reloaded.

## Your Instructions
[Paste the full content of agents/code-review-challenger.md]

## What to Review
Story **[US-XXX]: [Title]** has just been implemented.

The following files were created or modified:
[List all files changed by the implementation agents]

## Acceptance Criteria to Verify
[All acceptance criteria from the story]

## Your Task
1. Read every file that was created or modified
2. Run the full review checklist from your instructions
3. Verify each acceptance criterion is actually met by the code
4. Produce your structured review report (MUST FIX / SHOULD FIX / WELL DONE)
5. If there are MUST FIX issues, list the exact changes needed

IMPORTANT: You MUST write code to fix any MUST FIX issues you find.
Do not just report them — fix them directly.
```

## Step 4: Handle Review Results

After the code-review-challenger completes:

1. **If there are MUST FIX issues that weren't auto-fixed:**
   - Present the issues to the user
   - Ask if they want you to fix them (launch the appropriate implementation agent again)
   - After fixes, run code review again (second pass)

2. **If only SHOULD FIX or WELL DONE:**
   - Present the review summary to the user
   - Ask if they want the SHOULD FIX items addressed or if the implementation is acceptable

3. **Maximum 2 review cycles** — if after 2 rounds there are still MUST FIX issues,
   present them to the user and let them decide how to proceed

## Step 5: Update the Backlog

After the story is successfully implemented and reviewed:

1. Read `docs/BACKLOG.md`
2. Find the story section
3. Mark all acceptance criteria checkboxes as checked: `- [ ]` becomes `- [x]`
4. Add a status line after the acceptance criteria: `**Status: DONE**`
5. Show the user the changes before applying them
6. Ask for confirmation before modifying the backlog file

**IMPORTANT:** Never commit to git without the user's explicit consent. Only modify
the BACKLOG.md file — the git commit is the user's responsibility.

## Step 6: Summary Report

After everything is complete, present a summary:

```
## Implementation Complete: US-XXX — [Title]

### Agents Involved
- [Agent name]: [what they did, files created/modified]

### Files Changed
- [list of all files created or modified]

### Acceptance Criteria
- [x] [criterion 1] — implemented in [file:line]
- [x] [criterion 2] — implemented in [file:line]

### Code Review Result
- MUST FIX: [count] (all resolved)
- SHOULD FIX: [count] ([resolved/deferred])
- WELL DONE: [count]

### Next Steps
- [suggest the next story to implement based on priority]
```

## Rules

- **Always ask for user confirmation** before starting implementation of a story
- **Never commit to git** — the user controls git operations
- **Read agent files before invoking them** — the prompts must include the agent's full instructions
- **Parallel where possible** — server, dashboard, and CLI agents can run simultaneously
- **Code review is mandatory** — never skip the code-review-challenger
- **Be transparent** — show the user what's happening at each phase
- **Handle errors gracefully** — if an agent fails, report what happened and suggest alternatives
