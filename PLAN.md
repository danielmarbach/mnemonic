# Plan

## Dynamic project context loading

Idea: add runtime support for loading and unloading active project context so mnemonic can stay simple at small scale while handling larger numbers of projects and memories more efficiently.

### Why

- Reduce recall noise when many projects exist.
- Improve latency by keeping only active project context hot.
- Preserve access to global memories without treating every project as equally active.
- Create a path to scale beyond the current "personal or small-team, low-thousands of memories" sweet spot.

### Possible approach

- Introduce the concept of an active project working set.
- Keep global memories always available, but load project memories on demand.
- Cache embeddings, summaries, and relationship neighborhoods for recently active projects.
- Unload inactive project caches with an LRU or idle-time policy.
- Expand from project-local memories to global memories only when similarity or relationships justify it.

### Potential MCP surface

- `activate_project_context`
- `deactivate_project_context`
- `list_active_contexts`
- optional automatic activation based on `cwd`

### Likely pressure points

- cache invalidation when notes change
- interaction with `recall` project boosting
- project-to-global relationship traversal
- sync/reindex behavior for loaded vs unloaded projects
- maintaining the current simple file-first architecture

### Success criteria

- Faster recall in multi-project setups
- Less irrelevant cross-project retrieval
- No loss of useful global memory recall
- No requirement for a dedicated database or always-on service
