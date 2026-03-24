# Discover Tags Note-Oriented Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `discover_tags` so it suggests compact, note-specific canonical tags by default and align the code, tests, and docs with that behavior.

**Architecture:** Keep the existing tool name and vault-scan implementation, but change the contract from corpus inventory to note-oriented ranking. The tool should accept note context, compute per-tag statistics across visible notes, rank tags by note relevance plus canonicality signals, and return a bounded `recommendedTags` payload by default while still supporting explicit broad browsing.

**Tech Stack:** TypeScript, Zod, Vitest, MCP SDK, markdown docs

---

### Task 1: Lock down the new discover_tags contract in tests

**Files:**
- Modify: `tests/mcp.integration.test.ts`
- Modify: `src/structured-content.ts`

- [ ] **Step 1: Write the failing integration assertions for note-oriented tag suggestions**

Add a new `discover_tags` integration test that passes note context (`title` and `content`) and asserts:
- `recommendedTags` exists and is bounded
- relevant tags like `test-tag` and `discovery` are suggested
- irrelevant tags are not required to be present
- response text describes note-oriented suggestions, not a full corpus dump

Example assertion target:

```ts
expect(structured?.["recommendedTags"]).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ tag: "test-tag", usageCount: 2 }),
  ])
);
expect((structured?.["recommendedTags"] as unknown[]).length).toBeLessThanOrEqual(10);
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- tests/mcp.integration.test.ts`
Expected: FAIL because `discover_tags` does not yet accept note context or return `recommendedTags`

- [ ] **Step 3: Write the failing browse-mode contract test**

Add a second test that calls `discover_tags` with `mode: "browse"` and asserts the broad inventory output remains explicit and discoverable.

Example assertion target:

```ts
expect(structured?.["mode"]).toBe("browse");
expect(structured?.["tags"]).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ tag: "discovery" }),
  ])
);
```

- [ ] **Step 4: Run the targeted test file again and keep it red for the right reason**

Run: `npm test -- tests/mcp.integration.test.ts`
Expected: FAIL only on missing `discover_tags` behavior, not on test syntax or unrelated tooling

### Task 2: Implement note-oriented discover_tags behavior

**Files:**
- Modify: `src/index.ts`
- Modify: `src/structured-content.ts`

- [ ] **Step 1: Define the structured contract in code**

Implement a result shape with these expectations:
- default mode is `"suggest"`
- `recommendedTags` is required in suggest mode and bounded to a small list (target: 10 max)
- each recommended tag includes `tag`, `usageCount`, `lifecycleTypes`, `isTemporaryOnly`, and one compact evidence field (`example` or `reason`)
- summary counters remain available (`totalTags`, `totalNotes`, `durationMs`)
- explicit `mode: "browse"` returns the broader `tags` inventory payload

- [ ] **Step 2: Implement the minimal schema changes**

Move `src/structured-content.ts` to the new contract only after the tests are red.

- [ ] **Step 3: Extend the tool input schema**

Add note-oriented inputs such as:
- `title?: string`
- `content?: string`
- `query?: string`
- `candidateTags?: string[]`
- optional browse escape hatch such as `mode?: "suggest" | "browse"`

- [ ] **Step 4: Implement tag ranking from note context**

Build the minimal ranking logic that:
- computes existing per-tag stats from visible notes
- scores tags by textual relevance to note context first
- uses `usageCount` as a tie-breaker / boost
- demotes temp-only tags when the target note is not temporary

- [ ] **Step 5: Return compact structured output by default**

Update the result shape to expose bounded suggestions such as:
- `recommendedTags`
- optional compact metadata for why each was chosen
- summary counts for searched notes/tags

Avoid returning the full `tags` corpus by default in suggest mode.

- [ ] **Step 6: Preserve explicit broad browsing**

If `mode: "browse"` is supplied, continue to surface broader inventory data in a clearly opt-in shape.

- [ ] **Step 7: Run the targeted integration test and make it green**

Run: `npm test -- tests/mcp.integration.test.ts`
Expected: PASS

- [ ] **Step 8: Commit the code and test changes**

```bash
git add tests/mcp.integration.test.ts src/index.ts src/structured-content.ts
git commit -m "feat: make discover_tags note-oriented by default"
```

### Task 3: Tighten guidance and public docs

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: `AGENT.md`
- Modify: `docs/index.html`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update tool descriptions and workflow hint wording**

Describe `discover_tags` as a note-oriented canonical tag suggestion tool. Make broad inventory browsing explicitly optional.

- [ ] **Step 2: Update agent guidance**

Change `AGENT.md` so `discover_tags` is used when tag choice is ambiguous for a note, not as a blanket pre-step.

- [ ] **Step 3: Update reader-facing docs**

Refresh the tool tables and homepage copy so they no longer promise a full tag listing as the default workflow.

- [ ] **Step 4: Add a brief changelog entry**

Document the user-visible behavior shift in concise release-note language.

- [ ] **Step 5: Commit the documentation changes**

```bash
git add README.md AGENT.md docs/index.html CHANGELOG.md src/index.ts
git commit -m "docs: describe note-oriented discover_tags"
```

### Task 4: Verify end-to-end behavior

**Files:**
- Modify: `tests/mcp.integration.test.ts`

- [ ] **Step 1: Run targeted verification**

Run: `npm test -- tests/mcp.integration.test.ts`
Expected: PASS

- [ ] **Step 2: Run build verification**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Sanity-check local MCP metadata if needed**

Run: `npm run mcp:local`
Expected: tool metadata and docs wording reflect note-oriented `discover_tags`

- [ ] **Step 4: Dogfood the change through the local MCP flow**

Start the local server:

```bash
npm run mcp:local
```

Then call `tools/call` for `discover_tags` with note context using the same stdio JSON-RPC flow exercised in `tests/mcp.integration.test.ts`, for example with arguments shaped like:

```json
{
  "title": "Fix MCP prompt wording",
  "content": "Tighten workflow guidance for weaker models and avoid duplicate remember calls.",
  "scope": "project"
}
```

Expected pass criteria:
- the response reports `mode: "suggest"`
- `recommendedTags` is present and bounded
- it includes relevant tags such as `mcp`, `workflow`, or `prompt`
- it does not include a full broad `tags` inventory unless `mode: "browse"` is explicitly requested

- [ ] **Step 5: Summarize behavior changes and any follow-up migration concerns**

Call out whether clients depending on the old `tags` payload need explicit browse mode or compatibility handling.
