---
title: "GBrain.md"
source: "https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb"
author:
  - "[[garrytan]]"
  - "[[harshitgavita-07]]"
published:
created: 2026-04-06
description: "GBrain.md. GitHub Gist: instantly share code, notes, and snippets."
tags:
  - "clippings"
---
| title   | GBrain                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| type    | project                                                                                                                         |
| created | 2026-04-05                                                                                                                      |
| updated | 2026-04-05                                                                                                                      |
| tags    | \| open-source \| knowledge-base \| sqlite \| rag \| thin-harness \| fat-skills \| \| --- \| --- \| --- \| --- \| --- \| --- \| |
| sources | GStack-YC-Spring-2026-Talk-pptx                                                                                                 |

## GBrain

> Open-source personal knowledge brain. SQLite + FTS5 + vector embeddings in one file. Thin CLI harness, fat skill files. The knowledge layer to GStack's coding layer. Together: intelligence on tap.

## State

- **Status:** Spec complete — ready to build
- **What:** Personal knowledge base as a single SQLite database with full-text search, vector embeddings, and structured queries. Thin CLI, fat markdown skills. MCP-ready from day one.
- **Why:** Git doesn't scale past ~5K files. The current brain has 1,222 people dossiers, 7,471 markdown files, 2.3GB. Git is choking. The wiki brain pattern (Karpathy compiled truth + timeline) is right — it just needs a real database underneath.
- **Architecture:** Thin CLI harness, fat skills (same as GStack)
- **Repo:** github.com/garrytan/gbrain