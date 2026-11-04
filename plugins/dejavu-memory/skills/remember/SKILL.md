---
name: remember
description: Store durable memories, recall them later, and keep the DejaVu memory tree tidy. Use when the user asks you to remember something, when a decision or preference should outlive the conversation, or when prior context about a project, person, or recurring problem would change the answer.
---

# Remember with DejaVu

DejaVu stores memory as a tree of versioned nodes addressed by URI (`dejavu://agent`, `dejavu://agent/deploy_pipeline`). Read before you write: the tree is the source of truth, and writing blind creates duplicates the user has to clean up.

## Recall

Start with `search_memory` rather than browsing. The default `mode="auto"` answers from keyword hits when they fill the request and only then adds semantic hits; pass `mode="fts"` when you want one cheap keyword query with no embedding call. Add `prefix` to stay inside one project subtree (`agent/work` covers `dejavu://agent/work` and below).

When the user asks what you already know about a subject, search first and answer from the hits. Load `system://boot` only when the user asks for a full session briefing or you need the whole memory map; it is large.

Cite the URI of any memory you rely on so the user can inspect or correct it.

## Write

Before creating a node:

1. Search for an existing node on the topic.
2. If one exists, read it and update instead of creating a second node. Prefer `append` for new detail and `content` for a rewrite.
3. If none exists, `read_memory` on the intended parent, then `create_memory`.

For a second entry point to the same memory use `create_memory` with `alias_of=<target_uri>`; it takes no content. Rename a path with `update_memory(new_name=…)` on its own. Both replace the former `add_alias` and `rename_memory` tools.

When a write may be retried, pass `idempotency_key` so the second call returns the first memory instead of a duplicate. Pass `embed: false` for transcripts and other bulk records whose cost should stay on keyword search.

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

`audit` lists recent changes; `audit(action="rollback", audit_id=…)` undoes one after a bad edit.
