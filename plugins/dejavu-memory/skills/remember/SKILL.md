---
name: remember
description: Store durable memories, recall them later, and keep the DejaVu memory tree tidy. Use when the user asks you to remember something, when a decision or preference should outlive the conversation, or when prior context about a project, person, or recurring problem would change the answer.
---

# Remember with DejaVu

DejaVu stores memory as a tree of versioned nodes addressed by URI (`noc://agent`, `noc://agent/deploy_pipeline`). Read before you write: the tree is the source of truth, and writing blind creates duplicates the user has to clean up.

## Recall

Start with `search_memory` rather than browsing. Pass `mode="hybrid"` when keywords alone may miss the topic, since that also merges semantic hits.

When the user asks what you already know about a subject, search first and answer from the hits. Load `system://boot` only when the user asks for a full session briefing or you need the whole memory map; it is large.

Cite the URI of any memory you rely on so the user can inspect or correct it.

## Write

Before creating a node:

1. Search for an existing node on the topic.
2. If one exists, read it and update instead of creating a second node. Prefer `append` for new detail and `content` for a rewrite.
3. If none exists, `read_memory` on the intended parent, then `create_memory`.

Set `relation` on updates so the history stays legible:

- `enrich` when adding detail to a still-correct memory
- `confirm` when the new information agrees with the existing memory
- `replace` when the old content is superseded
- `challenge` when the new information contradicts the old memory

Keep `title` short and ASCII-ish; it becomes the URI path segment.

## What not to store

Skip information that is only useful in the current conversation: task progress, one-off facts, and anything the user is clearly thinking aloud about. Memory that fills with noise stops being useful.

Never store credentials, tokens, or other secrets.

## Prune

When the user asks to forget something, `read_memory` first. `delete_memory` cuts a path and refuses while children exist, so delete or reparent the children first, then confirm what was removed.
