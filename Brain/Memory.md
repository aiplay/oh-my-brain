---
title: Memory
aliases:
  - Memory
  - Agent Memory
tags:
  - brain/memory
date: 2026-04-03
---

# Memory — Agent Runtime Memory

%%
Persistent memory for the Oh-My-Brain Agent. Retained across sessions.

Write rules:
- Attach a date to every entry; append new entries at the end of the relevant section
- Mark superseded entries with ~~strikethrough~~ and note the reason; never delete directly
- This file is maintained autonomously by the Agent; the user may also edit it directly
%%

---

## User Preferences

<!-- Habits and preferences observed during interactions -->

| Preference | Observation | Recorded |
|------------|-------------|----------|
| | | |

---

## Lessons Learned

<!-- Pitfalls encountered during operations — avoid repeating mistakes -->

### 2026-04-03 · External Agents Plugin Development

- CSS class injection for coloring is unreliable in Obsidian; inline style manipulation is more stable
- npm commands on Windows require `shell=True`
- Electron dialog compatibility: `electron.remote?.dialog ?? electron.dialog`
- See [[devlog.md]] for details

---

## Decision Log

<!-- Architectural / organizational decisions and their rationale -->

### 2026-04-03 · Vault Directory Structure

- **Decision:** Establish a four-directory system — Brain / Clippings / Skills / Agents
- **Rationale:** Separate agent core (Brain), external input (Clippings), capabilities (Skills), and workspaces (Agents)
- **Related:** [[CLAUDE.md]]

---

## Agent Workspace Registry

<!-- Summary of registered sub-agents for quick task routing -->

| Alias | Repo Path | Role Summary | Registered |
|-------|-----------|--------------|------------|
| | | | |

---

## Observations

<!-- Emerging patterns not yet conclusive; promote to Lessons Learned or Decision Log when mature -->

-
