import { describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpPrompt,
  callLocalMcpResponse,
  initTestRepo,
  listLocalMcpTools,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

import { DiscoverTagsResultSchema, ProjectSummaryResultSchema } from "../src/structured-content.js";

describe("tool-descriptions", () => {
  it("exposes workflow-hint prompt as an imperative decision protocol", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const promptText = await callLocalMcpPrompt(vaultDir, "mnemonic-workflow-hint");

    expect(promptText).toContain("Avoid duplicate memories.");
    expect(promptText).toContain("REQUIRES: Before `remember`, call `recall` or `list` first.");
    expect(promptText).toContain("If `recall` or `list` returns a plausible match, call `get` before deciding whether to `update` or `remember`.");
    expect(promptText).toContain("When unsure, prefer `recall` over `remember`.");
    expect(promptText).toContain("Bad: call `remember` immediately because the user said 'remember'.");
    expect(promptText).toContain("Roles are optional prioritization hints, not schema.");
    expect(promptText).toContain("Lifecycle still governs durability.");
    expect(promptText).toContain("When `lifecycle` is omitted, `remember` applies soft defaults based on role");
    expect(promptText).toContain("`research`, `plan`, and `review` default to `temporary`");
    expect(promptText).toContain("Inferred roles are internal hints only.");
    expect(promptText).toContain("Prioritization is language-independent by default.");
    expect(promptText).toContain("Call `project_memory_summary` first for orientation");
    expect(promptText).toContain("Recovery is a follow-on step, not a replacement for orientation");
    expect(promptText).not.toContain("strategy `supersedes`");
  }, 15000);

  it("exposes rpi-workflow prompt with stage protocol conventions", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const promptText = await callLocalMcpPrompt(vaultDir, "mnemonic-rpi-workflow");

    expect(promptText).toContain("## RPIR workflow: research → plan → implement → review");
    expect(promptText).toContain("mnemonic is the artifact store, not the runtime");
    expect(promptText).toContain("`role: context`");
    expect(promptText).toContain("`lifecycle: temporary`");
    expect(promptText).toContain("`tags: [\"workflow\", \"request\"]`");
    expect(promptText).toContain("### Stage 1 — Research");
    expect(promptText).toContain("### Stage 2 — Plan");
    expect(promptText).toContain("### Stage 3 — Implement");
    expect(promptText).toContain("### Stage 4 — Review");
    expect(promptText).toContain("### Stage 5 — Consolidate");
    expect(promptText).toContain("One current plan per request");
    expect(promptText).toContain("Subagent returns: updated apply note");
    expect(promptText).toContain("Three classes: memory (research/plan/review artifacts), work (code/test/docs), memory (consolidation/promotion)");
  }, 15000);

  it("keeps mnemonic-rpir-workflow as a compatibility alias", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const promptText = await callLocalMcpPrompt(vaultDir, "mnemonic-rpir-workflow");

    expect(promptText).toContain("## RPIR workflow: research → plan → implement → review");
    expect(promptText).toContain("### Stage 1 — Research");
    expect(promptText).toContain("### Stage 5 — Consolidate");
  }, 15000);

  it("surfaces prerequisite-first workflow wording in phase-aware tool descriptions", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const tools = await listLocalMcpTools(vaultDir);
    const byName = new Map(tools.map((tool) => [tool.name, tool.description ?? ""]));

    expect(byName.get("remember")).toContain("REQUIRES: Call `recall` or `list` first to check whether this memory already exists.");
    expect(byName.get("get")).toContain("Use after `recall`, `list`, or `recent_memories` when you need the full note content.");
    expect(byName.get("update")).toContain("Use after `recall` + `get` when an existing memory should be refined instead of creating a duplicate.");
    expect(byName.get("relate")).toContain("Use after you have identified the exact memories to connect.");
    expect(byName.get("consolidate")).toContain("Use after `recall`, `list`, or `memory_graph` shows overlap that should be merged or cleaned up.");
    expect(byName.get("move_memory")).toContain("Use `relate` if the moved memory connects to existing notes in the new vault.");
    expect(byName.get("discover_tags")).toContain("Suggest canonical tags for a specific note before `remember` when tag choice is ambiguous.");
  }, 15000);

  it("suggests note-oriented canonical tags by default", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      for (let i = 0; i < 4; i++) {
        await callLocalMcp(vaultDir, "remember", {
          title: `Broad design note ${i + 1}`,
          content: "Design guidance for discover tags workflow and architecture decisions.",
          tags: ["design", "architecture"],
          lifecycle: "permanent",
          scope: "global",
          summary: "Create broad design note for ranking pressure",
        }, embeddingServer.url);
      }

      await callLocalMcp(vaultDir, "remember", {
        title: "Tag discovery test note one",
        content: "First note for tag discovery with permanent lifecycle.",
        tags: ["test-tag", "permanent-only", "discovery", "discover_tags"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create first note for tag discovery test",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Tag discovery test note two",
        content: "Second note for tag discovery also using test-tag.",
        tags: ["test-tag", "mixed-lifecycle", "discovery", "discover_tags"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create second note for tag discovery test",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Temporary tag discovery note",
        content: "Temporary note with temp-only tag.",
        tags: ["temp-only", "discovery"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Create temporary note for tag discovery test",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "discover_tags", {
        title: "Tune discover_tags ranking",
        content: "Make discover_tags suggestions prefer specific tags over generic design tags.",
        scope: "global",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      expect(() => DiscoverTagsResultSchema.parse(structured)).not.toThrow();
      expect(structured?.["action"]).toBe("tags_discovered");
      expect(structured?.["mode"]).toBe("suggest");
      expect(structured?.["totalTags"]).toBeGreaterThan(0);
      expect(structured?.["totalNotes"]).toBe(7);

      const tags = structured?.["recommendedTags"] as Array<Record<string, unknown>>;
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.length).toBeLessThanOrEqual(10);
      expect(structured?.["tags"]).toBeUndefined();
      const rankedNames = tags.map((t) => String(t["tag"]));

      const testTag = tags.find((t) => t["tag"] === "test-tag");
      expect(testTag).toBeDefined();
      expect(Object.keys(testTag!).sort()).toEqual([
        "example",
        "isTemporaryOnly",
        "lifecycleTypes",
        "reason",
        "tag",
        "usageCount",
      ]);
      expect(testTag?.["usageCount"]).toBe(2);
      expect(typeof testTag?.["example"]).toBe("string");
      expect(testTag?.["isTemporaryOnly"]).toBe(false);
      expect((testTag?.["lifecycleTypes"] as string[])).toContain("permanent");

      const tempTag = tags.find((t) => t["tag"] === "temp-only");
      expect(tempTag).toBeDefined();
      expect(tempTag?.["isTemporaryOnly"]).toBe(true);
      expect((tempTag?.["lifecycleTypes"] as string[])).toContain("temporary");
      expect((tempTag?.["lifecycleTypes"] as string[])).not.toContain("permanent");

      const discoveryTag = tags.find((t) => t["tag"] === "discovery");
      expect(discoveryTag).toBeDefined();
      expect(discoveryTag?.["usageCount"]).toBe(3);
      expect(discoveryTag?.["isTemporaryOnly"]).toBe(false);
      expect((discoveryTag?.["lifecycleTypes"] as string[])).toContain("permanent");
      expect((discoveryTag?.["lifecycleTypes"] as string[])).toContain("temporary");
      expect(rankedNames.indexOf("test-tag")).toBeGreaterThanOrEqual(0);
      expect(rankedNames.indexOf("discover_tags")).toBeGreaterThanOrEqual(0);
      if (rankedNames.includes("design")) {
        expect(rankedNames.indexOf("discover_tags")).toBeLessThan(rankedNames.indexOf("design"));
      }
      if (rankedNames.includes("architecture")) {
        expect(rankedNames.indexOf("discover_tags")).toBeLessThan(rankedNames.indexOf("architecture"));
      }

      expect(response.text).toContain("Suggested tags");
      expect(response.text).toContain("test-tag");
      expect(response.text).toContain("discovery");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("supports explicit browse mode for broader tag inventory output", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Browse mode note one",
        content: "Contains browse-tag and discovery.",
        tags: ["browse-tag", "discovery"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create first browse mode note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Browse mode note two",
        content: "Contains browse-tag and temp-only.",
        tags: ["browse-tag", "temp-only"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Create second browse mode note",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "discover_tags", {
        mode: "browse",
        scope: "global",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      expect(() => DiscoverTagsResultSchema.parse(structured)).not.toThrow();
      expect(structured?.["action"]).toBe("tags_discovered");
      expect(structured?.["mode"]).toBe("browse");
      const tags = structured?.["tags"] as Array<Record<string, unknown>>;
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.find((t) => t["tag"] === "browse-tag")).toBeDefined();
      expect(tags.find((t) => t["tag"] === "temp-only")?.["isTemporaryOnly"]).toBe(true);
      expect(structured?.["recommendedTags"]).toBeUndefined();
      expect(response.text).toContain("Tags (scope: global)");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("keeps broad canonical tags near the top when the prompt is generic", async () => {
    // Timeout doubled: this test spawns 5 processes (4×remember + discover_tags), more than any
    // other test in this file. On slow CI the 15 s budget is too tight.
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Architecture decision record",
        content: "Design note about project structure and architecture guidance.",
        tags: ["design", "architecture"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create broad design note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Project workflow note",
        content: "Workflow guidance for organizing project knowledge.",
        tags: ["workflow", "design"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create workflow note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Temporary scratchpad",
        content: "Temporary working note with short-lived cleanup context.",
        tags: ["temporary-notes", "implemented"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Create temporary noise note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Implementation status",
        content: "A consolidated implemented note about finished work items.",
        tags: ["implemented", "consolidated"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create implementation status noise note",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "discover_tags", {
        title: "Improve project notes",
        content: "Make project knowledge easier to use across sessions.",
        scope: "global",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      expect(structured?.["mode"]).toBe("suggest");
      const rankedTags = structured?.["recommendedTags"] as Array<Record<string, unknown>>;
      expect(Array.isArray(rankedTags)).toBe(true);
      const rankedNames = rankedTags.map((tag) => String(tag["tag"]));
      expect(rankedNames.length).toBeGreaterThan(0);
      expect(["design", "architecture", "workflow"]).toContain(rankedNames[0]);
      if (rankedNames.includes("temporary-notes")) {
        expect(rankedNames.indexOf("design")).toBeLessThan(rankedNames.indexOf("temporary-notes"));
      }
      if (rankedNames.includes("implemented")) {
        expect(rankedNames.indexOf("design")).toBeLessThan(rankedNames.indexOf("implemented"));
      }
      if (rankedNames.includes("consolidated")) {
        expect(rankedNames.indexOf("design")).toBeLessThan(rankedNames.indexOf("consolidated"));
      }
      expect(structured?.["tags"]).toBeUndefined();
    } finally {
      await embeddingServer.close();
    }
  }, 30000);

  it("prefers an exact specific tag even when it only exists once", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      for (let i = 0; i < 4; i++) {
        await callLocalMcp(vaultDir, "remember", {
          title: `Broad design note ${i + 1}`,
          content: "General design and architecture guidance.",
          tags: ["design", "architecture"],
          lifecycle: "permanent",
          scope: "global",
          summary: "Create broad design baseline note",
        }, embeddingServer.url);
      }

      await callLocalMcp(vaultDir, "remember", {
        title: "Cache invalidation issue",
        content: "A focused note about cache invalidation behavior.",
        tags: ["cache-invalidation"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create one-off specific tag note",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "discover_tags", {
        title: "Fix cache-invalidation behavior",
        content: "Investigate cache-invalidation for stale project data.",
        scope: "global",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      expect(structured?.["mode"]).toBe("suggest");
      const rankedTags = structured?.["recommendedTags"] as Array<Record<string, unknown>>;
      expect(Array.isArray(rankedTags)).toBe(true);
      const rankedNames = rankedTags.map((tag) => String(tag["tag"]));
      expect(rankedNames.indexOf("cache-invalidation")).toBeGreaterThanOrEqual(0);
      if (rankedNames.includes("design")) {
        expect(rankedNames.indexOf("cache-invalidation")).toBeLessThan(rankedNames.indexOf("design"));
      }
      if (rankedNames.includes("architecture")) {
        expect(rankedNames.indexOf("cache-invalidation")).toBeLessThan(rankedNames.indexOf("architecture"));
      }
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("does not treat short tags as exact matches inside larger words", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Short tag note",
        content: "A note tagged with io.",
        tags: ["io"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create short tag note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Mnemonic design note",
        content: "A design note about mnemonic retrieval behavior.",
        tags: ["design", "mnemonic"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create mnemonic design note",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "discover_tags", {
        title: "Mnemonic retrieval plan",
        content: "Improve mnemonic recall behavior without changing the design.",
        scope: "global",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      expect(structured?.["mode"]).toBe("suggest");
      const rankedTags = structured?.["recommendedTags"] as Array<Record<string, unknown>>;
      expect(Array.isArray(rankedTags)).toBe(true);
      const rankedNames = rankedTags.map((tag) => String(tag["tag"]));
      expect(rankedNames.indexOf("design")).toBeGreaterThanOrEqual(0);
      expect(rankedNames.indexOf("mnemonic")).toBeGreaterThanOrEqual(0);
      if (rankedNames.includes("io")) {
        expect(rankedNames.indexOf("io")).toBeGreaterThan(rankedNames.indexOf("mnemonic"));
        expect(rankedNames.indexOf("io")).toBeGreaterThan(rankedNames.indexOf("design"));
      }
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("OrientationNoteSchema accepts provenance and confidence optional fields", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Schema audit orientation test",
        content: "Testing provenance and confidence in orientation.",
        tags: ["audit", "orientation"],
        lifecycle: "permanent",
        scope: "project",
        summary: "Seed note for orientation schema audit",
        cwd: repoDir,
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      expect(() => ProjectSummaryResultSchema.parse(summary.structuredContent)).not.toThrow();
      const parsed = ProjectSummaryResultSchema.parse(summary.structuredContent);
      expect(parsed.action).toBe("project_summary_shown");
      expect(parsed.orientation).toBeDefined();
      expect(parsed.orientation.primaryEntry).toBeDefined();
      expect(parsed.orientation.primaryEntry).toHaveProperty("id");
      expect(parsed.orientation.primaryEntry).toHaveProperty("title");
      expect(parsed.orientation.primaryEntry).toHaveProperty("rationale");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});
