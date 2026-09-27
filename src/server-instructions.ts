import type { Toolset } from "./toolset.js";

const CORE_INSTRUCTIONS = [
  "mnemonic stores long-lived project and personal memory as markdown notes.",
  "- Always pass `cwd` (the repository path) for repo work so notes are routed and ranked per project.",
  "- Start a task with `project_memory_summary` or `recall` to load relevant context.",
  "- Before `remember`, check with `recall` or `list` that the note does not exist yet; prefer `update` over a near-duplicate.",
  "- `recall` shows summaries and matching passages; call `get` with the ids for full content before quoting or updating a note.",
  "- Right after `remember`, call `relate` if the note connects to something you recalled.",
  "- Keep one topic per note and merge overlapping notes with `consolidate`.",
  "- `sync` pulls and pushes shared memory.",
];

/**
 * Sent in the MCP initialize result; most clients add it to the model's context
 * automatically. Only names core tools, so it holds for every toolset.
 */
export function buildServerInstructions(toolset: Toolset): string {
  const lines =
    toolset === "core"
      ? [
          ...CORE_INSTRUCTIONS,
          "- This server runs the core toolset. Other tools that descriptions mention (attachments, project identity, migrations, maintenance such as `forget` or `recent_memories`) need MNEMONIC_TOOLSET=full.",
        ]
      : CORE_INSTRUCTIONS;
  return lines.join("\n");
}
