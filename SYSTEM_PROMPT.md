## Mnemonic Memory System

No system prompt required. Mnemonic's tools are self-describing — each tool includes
"use when" / "do not use when" guidance, behavioral annotations, and typed schemas.

For on-demand workflow guidance, use the `mnemonic-workflow-hint` MCP prompt. It now acts
as a compact decision protocol: `recall` first, inspect with `get`, prefer `update` for
existing memories, use `remember` only when nothing matches, then organize with
`relate`, `consolidate`, or `move_memory`.
