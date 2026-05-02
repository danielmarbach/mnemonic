import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  // ── mnemonic-workflow-hint prompt ─────────────────────────────────────────────
  server.registerPrompt(
    "mnemonic-workflow-hint",
    {
      title: "Mnemonic Workflow Hints",
      description: "Optional workflow hints for using the mnemonic memory tools effectively.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "## Mnemonic MCP workflow hints\n\n" +
              "Avoid duplicate memories. Prefer inspecting and updating existing memories before creating new ones.\n\n" +
              "- REQUIRES: Before `remember`, call `recall` or `list` first.\n" +
              "- If `recall` or `list` returns a plausible match, call `get` before deciding whether to `update` or `remember`.\n" +
              "- If an existing memory already covers the topic, use `update`, not `remember`.\n" +
              "- When unsure, prefer `recall` over `remember`.\n" +
              "- For repo-related tasks, pass `cwd` so mnemonic can route project memories correctly.\n\n" +
              "Workflow: `recall`/`list` -> `get` -> `update` or `remember` -> `relate`/`consolidate`/`move_memory`. Use `discover_tags` only when tag choice is ambiguous.\n\n" +
              "When a merge/prune decision is uncertain, use optional evidence enrichment: `recall` with `evidence: \"compact\"` and `consolidate` analysis strategies with `evidence: true`. Evidence improves confidence but is not required.\n\n" +
              "Roles are optional prioritization hints, not schema. Lifecycle still governs durability. When `lifecycle` is omitted, `remember` applies soft defaults based on role: `research`, `plan`, and `review` default to `temporary`; `decision`, `summary`, and `reference` default to `permanent`. Explicit `lifecycle` always overrides the role-based default. Inferred roles are internal hints only. Prioritization is language-independent by default.\n\n" +
              "### Working-state continuity\n\n" +
              "Preserve in-progress work as temporary notes when continuation value is high. Recovery happens after project orientation.\n\n" +
              "**Checkpoint note structure (temporary notes):**\n" +
              "- Title pattern: 'WIP: <topic>' or 'Checkpoint: <description>'\n" +
              "- Opening paragraph: current status and next immediate step\n" +
              "- Body: what was attempted, what worked, blockers, alternatives considered\n" +
              "- End with explicit next action and confidence level\n\n" +
              "**Checkpoint note guidance:**\n" +
              "- One checkpoint per active task or investigation thread\n" +
              "- Update the same checkpoint note as work progresses (don't create new ones)\n" +
              "- Link to related decisions: use `relate` to connect temporary checkpoints to permanent decisions\n" +
              "- Consolidate into a durable note when complete; let lifecycle defaults delete temporary scaffolding unless you intentionally need preserved history\n\n" +
              "**Recovery workflow:**\n" +
              "- Call `project_memory_summary` first for orientation (do not skip to recovery)\n" +
              "- Use `lifecycle: temporary` for active plans, WIP checkpoints, draft investigations, and unvalidated options\n" +
              "- Use `lifecycle: permanent` for decisions, discovered constraints, bug causes, and reusable lessons\n" +
              "- After orientation, recover working-state from temporary notes via `recall` with lifecycle filter\n" +
              "- Consolidate temporary notes into durable ones once knowledge stabilizes\n" +
              "- Recovery is a follow-on step, not a replacement for orientation\n\n" +
              "### Anti-patterns\n\n" +
              "- Bad: call `remember` immediately because the user said 'remember'.\n" +
              "- Good: `recall` or `list` first, then `get`, then `update` or `remember`.\n" +
              "- Bad: create another note when `recall` or `list` already found the same decision.\n" +
              "- Good: `update` the existing memory and relate it if needed.\n" +
              "- Bad: skip orientation and jump straight to working-state recovery.\n" +
              "- Good: `project_memory_summary` first, then recover temporary notes.\n\n" +
              "### Storage model\n\n" +
              "Memories can live in:\n" +
              "- `main-vault` for global knowledge\n" +
              "- `project-vault` as the broad project-level filter\n" +
              "- `sub-vault:<folder>` for a specific project sub-vault such as `sub-vault:.mnemonic-lib`\n\n" +
              "Passing `cwd` enables:\n" +
              "- project memory routing\n" +
              "- project-aware recall ranking\n" +
              "- project memory policy lookup\n\n" +
              "### Tiny examples\n\n" +
              "- Existing bug note found by `recall` -> inspect with `get` -> refine with `update`.\n" +
              "- No matching note found by `recall` -> optional `discover_tags` with note context -> create with `remember`.\n" +
              "- Two notes overlap heavily -> inspect -> clean up with `consolidate`.\n" +
              "- Unsure why a recall hit ranked high -> rerun `recall` with `evidence: \"compact\"`.\n" +
              "- Unsure whether to merge/prune -> run `consolidate` analysis with `evidence: true` before `execute-merge` or `prune-superseded`.\n" +
              "- Resume work: `project_memory_summary` -> `recall` (lifecycle: temporary) -> continue from temporary notes.\n\n" +
              "### semanticPatch format\n\n" +
              "When using `update` with `semanticPatch`:\n" +
              "- Each patch is an object with two keys: `selector` and `operation` (not flat `{op, value}` at top level).\n" +
              "- `selector` has exactly one key: `heading`, `headingStartsWith`, `nthChild`, or `lastChild`.\n" +
              "- `operation` has an `op` key plus `value` (except `remove` which has no value).\n" +
              "- The parameter must be a JSON array, NOT a string.\n" +
              "- Use `get` first to read exact heading text, then use those headings (without `##` prefix) as selector values.\n" +
              "- Common mistake: writing `{ \"op\": \"appendChild\", \"value\": \"...\" }` at the top level instead of nesting inside `operation`. Correct shape: `{ \"selector\": { \"heading\": \"Findings\" }, \"operation\": { \"op\": \"insertAfter\", \"value\": \"text\" } }`\n" +
              "- `appendChild`, `prependChild`, and `replaceChildren` do NOT work with `heading` selectors. To add content under a heading, use `insertAfter`. To replace a heading, use `replace`.",
          },
        },
      ],
    })
  );

  // ── mnemonic-rpi-workflow prompt ───────────────────────────────────────────────
  const rpiWorkflowPrompt = async () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text:
            "## RPIR workflow: research → plan → implement → review\n\n" +
            "mnemonic is the artifact store, not the runtime. Store workflow artifacts with correct roles and lifecycle; do not build orchestration in core.\n\n" +
            "### Request root note\n\n" +
            "For each RPIR workflow, create one request root note: `role: context`, `lifecycle: temporary`, `tags: [\"workflow\", \"request\"]`. All artifacts relate to it.\n\n" +
            "### Stage 1 — Research\n\n" +
            "- Create or update request root note.\n" +
            "- Create research notes: `role: research`, `lifecycle: temporary`.\n" +
            "- Distill a short research summary when findings are scattered.\n" +
            "- Link research `related-to` request root.\n" +
            "- Before creating research notes, call `recall` to check whether existing notes already cover the topic.\n\n" +
            "### Stage 2 — Plan\n\n" +
            "- Create or update one plan note: `role: plan`, `lifecycle: temporary`.\n" +
            "- Link plan `related-to` request root + key research notes.\n" +
            "- Keep plan concise and executable.\n" +
            "- REQUIRES: One current plan per request. Update or supersede when plan evolves.\n" +
            "- Material changes (architecture, scope, ordering, validation, assumptions): update plan note first, then continue.\n" +
            "- Non-material changes (wording, phrasing, detail): update inline without branching.\n\n" +
            "### Stage 3 — Implement\n\n" +
            "- Create temporary apply/task notes, tagged with `apply`.\n" +
            "- Use `role: plan` for executable steps. Use `role: context` for observations and checkpoints.\n" +
            "- Link apply notes `related-to` plan.\n" +
            "- For non-trivial work, hand narrow context to subagent: request note, current plan or relevant slice, key research notes, narrow file/task scope.\n" +
            "- Subagent returns: updated apply note, optional review note, recommendation (continue / block / update plan).\n\n" +
            "### Stage 4 — Review\n\n" +
            "- Create review notes: `role: review`, `lifecycle: temporary`.\n" +
            "- Link review `related-to` apply or plan.\n" +
            "- Fix directly or mark blockers.\n" +
            "- If review changes the plan materially, update plan note first.\n\n" +
            "### Stage 5 — Consolidate\n\n" +
            "At workflow end:\n" +
            "- Create decision note for resolved approaches (`lifecycle: permanent`).\n" +
            "- Create summary note for outcome recaps (`lifecycle: permanent`).\n" +
            "- Promote reusable facts and patterns into permanent reference notes.\n" +
            "- Let pure scaffolding and redundant checkpoints expire as temporary notes.\n\n" +
            "### Relationship conventions\n\n" +
            "Minimal set. Link to immediate upstream artifacts only. No dense cross-linking.\n" +
            "- research → request root\n" +
            "- plan → request root + key research notes\n" +
            "- apply/task → plan\n" +
            "- review → apply or plan\n" +
            "- outcome → plan (optionally request root)\n\n" +
            "### Commit discipline\n\n" +
            "Three classes: memory (research/plan/review artifacts), work (code/test/docs), memory (consolidation/promotion). When plan changes materially: update notes, commit memory, then continue work.\n\n" +
            "### Iterate?\n\n" +
            "Only when review or checks warrant it. Not the default.",
        },
      },
    ],
  });

  server.registerPrompt(
    "mnemonic-rpi-workflow",
    {
      title: "RPI Workflow: Research → Plan → Implement → Review",
      description: "Stage protocol and conventions for structured task workflows using mnemonic as artifact store.",
    },
    rpiWorkflowPrompt
  );
}
