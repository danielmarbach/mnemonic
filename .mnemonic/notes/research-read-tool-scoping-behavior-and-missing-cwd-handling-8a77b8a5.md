---
title: 'Research: read-tool scoping behavior and missing-cwd handling'
tags:
  - workflow
  - research
  - recall
  - scope
  - policy
lifecycle: temporary
createdAt: '2026-08-29T10:53:29.651Z'
updatedAt: '2026-08-29T20:34:25.594Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Verified against code at HEAD 1ff136a. Request root: `rpir-request-smarter-default-scoping-for-recall-and-read-too-7ffd0632`.

## Current behavior (facts)

- All read tools hard-default `scope: "all"`: recall (`src/tools/recall.ts:159-167`), list (`src/tools/list.ts:36`), recent\_memories (`src/tools/recent-memories.ts:37`), memory\_graph (`src/tools/memory-graph.ts:31`). The zod `.default("all")` means the server never sees "caller did not choose".
- `resolveWriteScope` (policy-aware) is used ONLY by `remember` (`src/tools/remember.ts:21,295`). Read tools never consult the project memory policy. `defaultScope` policy governs write location, not reads.
- cwd omitted → `resolveProject` returns undefined (`src/helpers/project.ts:25-28`) → `searchOrder` appends only the main vault (`src/vault.ts:217-232`). Project vault is INVISIBLE to recall/list/recent/graph. Id-based tools (`get`/`update`/`forget`/`where_is_memory` → `findNote`) also cannot resolve project-vault notes without cwd.
- `project_memory_summary` REQUIRES cwd and errors when unresolvable (`src/tools/project-memory-summary.ts:201-236`).
- With cwd + scope "all", project notes get only a tiny bounded prior: `PROJECT_SCOPE_BOOST = 0.005` (`src/tools/recall-helpers.ts:60`) vs RRF fusion scale \~0.15 (`src/recall.ts`). Prior RRF plan note `plan-one-shot-bounded-rrf-hybrid-recall-alignment-7aa73aaa` explicitly rejected hard project-first RANKING within fused "all" results — but choosing the default candidate SET (scope) is a different lever and does not contradict it.
- Pre-existing inconsistency inside recall for explicit scope `"global"`: semantic channel filters by VAULT LOCATION (main vault, includes project-tagged notes, `recall.ts:400-407`); lexical channel and graph filter by PROJECT ASSOCIATION (exclude project-tagged notes, `recall-helpers.ts` collectLexicalCandidates, `recall.ts:557-558`). Test `tests/vault-routing.integration.test.ts:379` ("scope: global returns project-tagged notes stored in the main vault") documents the location-based semantic as INTENTIONAL — the "repo you don't own" case: personal notes about a foreign repo stored globally but project-tagged must stay reachable. So lexical/graph deviate from the documented intent; the recall scope param description and README:406 ("only memories with no project association") are also inaccurate.
- `list`-family funnel `collectVisibleNotes` (`src/helpers/vault.ts:58-129`): "global" = location-based (main vault, regardless of project tag) — consistent with the test intent. `list` sorts current-project notes first under "all".
- `scope: "project"` + cwd resolves a project = current-project-associated notes (wherever stored) + attached vault notes. This covers notes written under BOTH write policies (project policy → project vault; global policy → main vault WITH project association, still `isCurrentProject`). So a derived read default of "project" finds everything the project wrote, regardless of the write policy.

## Constraints discovered

- MCP `listRoots` (server→client roots request) is DEPRECATED as of protocol 2026-07-28 (SEP-2577) — replacement is "passing paths via tool parameters, resource URIs, or configuration" (`@modelcontextprotocol/server` 2.x `.d.cts` listRoots deprecation notice). Server-side cwd auto-detection via roots is not viable long-term.
- Env-var cwd pinning breaks multi-project use (one server serves many projects). Rejected.
- Guessing a project from history (e.g. branch-tracker state) risks cross-project contamination. Rejected.
- Unadopted-project principle: reads must not create `.mnemonic/` (recall only uses `getProjectVaultIfExists` — safe).
- Document chunks are collected when `scope === "all" || scope === "project"` (`recall.ts:641` area) — a derived "project" default keeps chunk retrieval working.
- `recallScopeNoteCount` + effectiveLimit shrink (≤25 visible notes → shrink limit) currently count ALL vaults in searchOrder regardless of scope filter — a derived default makes the count semantics worth revisiting (minor).

## Failure modes confirmed

1. Missing cwd: project memories invisible across ALL read tools and id-based tools; recall output header claims "Recall results (global)" — no hint that passing cwd would unlock project memories. LLMs cannot self-correct because nothing tells them.
2. Default "all" with broad queries: project + global candidates compete in one fused list; project prior is tiny; global noise crowds out project results and bloats context.

## Solution-space assessment

## Verification against existing design notes (addendum)

## User-confirmed design constraint (decides direction)

## Refined direction: project-anchored precision for the derived default

Keep the derived default scope `all`, but gate SEMANTIC-channel admission of main-vault global notes when cwd resolves a project and scope was NOT explicitly passed: globals are admitted only if curated (`alwaysLoad: true` explicit, or `importance: 'high'`) or strongly matching (`rawScore >= minSimilarity + GLOBAL_BAR_DELTA`, proposed +0.15, code constant). Project notes (current-project-associated, wherever stored) and attached-vault notes keep the normal `minSimilarity`. Lexical and graph channels unchanged — exact token matches and relationship-linked global notes still weave in. Document chunks unchanged.

Empty-pool lift: if admitted notes AND document chunks are both empty, sub-bar global candidates rejoin (bar lifts) — no dead ends, single pass, no rerun. Explicit `scope: 'all'` (caller-passed string) = today's ungated behavior; requires removing the zod `.default('all')` so undefined (derived) vs explicit is distinguishable. Transparency: when gating suppressed globals, append one header line with the count and how to disable (pass explicit scope all). Applies to recall only; list/recent\_memories/memory\_graph keep current defaults plus missing-cwd hints.

This preserves the weaving guarantee for exactly the notes the goal is about (curated anchors, strong matches, relationship-linked, exact lexical matches) while removing weakly-matching global noise from the default top-K — addressing both displacement misses and bloat.

The weaving goal is explicit user intent, not just note prose: the main/global vault holds common rules and design knowledge that must get woven into project context. A hard default `scope: 'project'` contradicts this goal and is rejected by the user.

- `mnemonic-key-design-decisions-3f2a6273` (permanent summary): "**Similarity boost, not hard filter:** `recall` gives project notes +0.15 cosine similarity boost rather than excluding global notes. Global memories (user prefs, cross-project patterns) remain accessible in project context." — The `all` default is a DOCUMENTED decision with rationale. A derived `project` default would exclude global memories from default recall (except via zero-result widening), so it is a SUPERSESSION of this decision, not a bug fix. Note: the +0.15 figure is stale — the RRF rework replaced it with the bounded +0.005 `PROJECT_SCOPE_BOOST` — but the accessibility intent still governs the current default.
- `vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691` (permanent): key invariant — passing cwd for context/lookup must never trigger vault creation. All read paths route through `getProjectVaultIfExists` — the proposed changes preserve this invariant (no `getOrCreateProjectVault` in any read path).
- `project-memory-policy-defaults-storage-location-f563f634` (permanent): "`scope: \"global\"` stores a private note in the main vault while keeping project association for recall and relationships" — CONFIRMS the derived read scope `project` (association-based) finds global-policy notes. Supports the derivation design.
- `move-memory-rewrites-project-association-on-project-vault-in-b9823cd8` (permanent): dogfooding incident where a note created without `cwd` landed in the main vault as a global note and needed relocation — corroborates that missing cwd also misroutes writes; strengthens the case for in-band missing-cwd hints.

Design tension to resolve at plan handoff: derived-default proposal supersedes a documented decision. Alternatives that preserve it: (a) hints-only (no default change), (b) opt-in read-scope setting (per-project policy field or vault config default, keeping `all` until configured).

- Server cannot know the client's cwd reliably (roots deprecated, env wrong, guessing unsafe) → in-band hints + consequence-oriented param descriptions are the honest fix for missing cwd.
- Derived default scope: when scope omitted AND cwd resolves a project → effective scope "project" (symmetric with write default for adopted projects); otherwise current behavior. Explicit scope always wins. Policy consultation is unnecessary: read "project" finds project-relevant notes under both write policies.
- Zero-result widening (recall only): derived "project" returns no notes and no document chunks → transparently rerun with "all", header states widening. Preserves recall ability; no bloat in the common case; browse tools (list/recent/graph) get NO widening (listing the whole global vault would be bloat).
- "global" channel alignment: align recall lexical + graph filters to the location-based semantic (matches semantic channel, list behavior, and test :379 intent); fix scope param description + README wording. Small, separable.

Scouted by subagent (ollama/glm-5.3-flash:cloud) + orchestrator verification of key code paths.
