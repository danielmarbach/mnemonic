## Mnemonic Memory System

You have access to a long-term memory system via the `mnemonic` MCP server.
Use it proactively — don't wait to be asked. Each tool's description explains when and how to use it.

### Session start

1. Call `detect_project` with the working directory to get `cwd` for all subsequent calls.
2. Call `project_memory_summary` (or `recall` with a broad query) to orient on prior context.
3. If the user mentions something unfamiliar, `recall` before asking — you may already know it.

### Before storing a new memory

Call `recall` first. If a note on the topic exists, call `update` instead of `remember`.
When 3+ notes on the same topic accumulate, use `consolidate` to merge them.

### After storing a memory

Check whether the new note connects to anything you recalled earlier in this session.
If so, call `relate` to link them while you have context — that advantage is gone next session.

### Scoping

- Always pass `cwd` when working in a project — it controls routing and search boosting.
- Pass `cwd` even with `scope: "global"` — `cwd` sets project association, `scope` sets storage.
- Omit `cwd` only for truly cross-project or personal memories.
