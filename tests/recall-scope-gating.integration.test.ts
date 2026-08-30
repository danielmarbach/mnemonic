import { describe, expect, it } from "vitest";
import { mkdtemp, stat } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  execFileAsync,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";
import { RecallResultSchema } from "../src/structured-content.js";

// The fake embedding server returns a constant vector for every input, so all
// semantic similarities are ~1.0. A bar above 1 (minSimilarity 0.9 + 0.15)
// gates every unassociated global candidate; a bar below 1 admits everything.
const GATING_MIN_SIMILARITY = 0.9;

describe("recall-scope-gating", () => {
  async function setupProject(): Promise<{
    vaultDir: string;
    repoDir: string;
    embeddingServer: Awaited<ReturnType<typeof startFakeEmbeddingServer>>;
  }> {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], {
      cwd: repoDir,
    });

    const embeddingServer = await startFakeEmbeddingServer();
    return { vaultDir, repoDir, embeddingServer };
  }

  const local = (url: string) => ({ ollamaUrl: url, disableGit: false as const });

  it("derived default gates weak unassociated global candidates; project notes stay visible", async () => {
    const { vaultDir, repoDir, embeddingServer } = await setupProject();
    try {
      const projectNote = await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Zebra pipeline architecture",
          content: "How the zebra pipeline stages are wired for the release build.",
          tags: ["gating-project"],
          summary: "Create project note for gating test",
          cwd: repoDir,
          scope: "project",
        },
        local(embeddingServer.url),
      );
      expect(projectNote).toContain("Persistence: embedding written");

      // Global note without cwd: no project association, stored in the main vault.
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Orchid watering schedule",
          content: "Gardening note unrelated to any repository work.",
          tags: ["gating-global"],
          summary: "Create unassociated global note",
          scope: "global",
        },
        embeddingServer.url,
      );

      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "zebra pipeline architecture release build",
          cwd: repoDir,
          limit: 10,
          minSimilarity: GATING_MIN_SIMILARITY,
        },
        local(embeddingServer.url),
      );

      expect(recalled.structuredContent?.["scope"]).toBe("all");
      expect(recalled.text).toContain("Zebra pipeline architecture");
      expect(recalled.text).not.toContain("Orchid watering schedule");
      expect(recalled.text).toContain("weak global matches suppressed");
      const parsed = RecallResultSchema.safeParse(recalled.structuredContent);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.suppressedGlobalCount).toBeGreaterThan(0);
        expect(parsed.data.widenedScope).toBeUndefined();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});
describe("recall-scope-gating (more)", () => {
  async function setupProject(): Promise<{
    vaultDir: string;
    repoDir: string;
    embeddingServer: Awaited<ReturnType<typeof startFakeEmbeddingServer>>;
  }> {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], {
      cwd: repoDir,
    });

    const embeddingServer = await startFakeEmbeddingServer();
    return { vaultDir, repoDir, embeddingServer };
  }

  const local = (url: string) => ({ ollamaUrl: url, disableGit: false as const });

  it("exempts alwaysLoad-curated global candidates from derived gating", async () => {
    const { vaultDir, repoDir, embeddingServer } = await setupProject();
    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Anchor note",
          content: "Creates the project vault so the scenario is adopted.",
          tags: ["gating-adopt"],
          summary: "Adopt the project vault",
          cwd: repoDir,
          scope: "project",
        },
        local(embeddingServer.url),
      );

      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "House coding conventions",
          content: "Always prefer integration tests over unit-only coverage.",
          tags: ["gating-conventions"],
          summary: "Curated global convention note",
          scope: "global",
          alwaysLoad: true,
        },
        embeddingServer.url,
      );

      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "house coding conventions integration tests",
          cwd: repoDir,
          limit: 10,
          minSimilarity: GATING_MIN_SIMILARITY,
        },
        local(embeddingServer.url),
      );

      expect(recalled.text).toContain("House coding conventions");
      expect(recalled.text).not.toContain("weak global matches suppressed");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("explicit scope all runs fully ungated", async () => {
    const { vaultDir, repoDir, embeddingServer } = await setupProject();
    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Adoption anchor",
          content: "Adopts the project vault for the ungated check.",
          tags: ["gating-adopt"],
          summary: "Adopt project vault",
          cwd: repoDir,
          scope: "project",
        },
        local(embeddingServer.url),
      );
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Fern propagation notes",
          content: "Gardening note unrelated to repository work.",
          tags: ["gating-global"],
          summary: "Create unassociated global note",
          scope: "global",
        },
        embeddingServer.url,
      );

      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "adoption anchor unrelated content",
          cwd: repoDir,
          scope: "all",
          limit: 10,
          minSimilarity: GATING_MIN_SIMILARITY,
        },
        local(embeddingServer.url),
      );

      expect(recalled.text).toContain("Fern propagation notes");
      expect(recalled.text).not.toContain("suppressed");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});

describe("recall-scope-gating (lift + onboarding)", () => {
  it("empty-pool lift surfaces weak global matches and reports the widening", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], {
      cwd: repoDir,
    });

    const embeddingServer = await startFakeEmbeddingServer();
    try {
      // The only note is an unassociated main-vault note: derived gating holds
      // it back, the project has no matching notes, so the lift re-admits it.
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Photography exposure primer",
          content: "Aperture and shutter basics unrelated to repository work.",
          tags: ["gating-global"],
          summary: "Create global note for lift test",
          scope: "global",
        },
        embeddingServer.url,
      );

      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "quantum flux manifolds",
          cwd: repoDir,
          limit: 10,
          minSimilarity: GATING_MIN_SIMILARITY,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(recalled.text).toContain("Photography exposure primer");
      expect(recalled.text).toContain("no project-scoped matches; showing all matches");
      const liftParsed = RecallResultSchema.safeParse(recalled.structuredContent);
      expect(liftParsed.success).toBe(true);
      if (liftParsed.success) {
        expect(liftParsed.data.widenedScope).toBe(true);
        expect(liftParsed.data.suppressedGlobalCount).toBeUndefined();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("onboarding: unadopted project recall with cwd neither errors nor creates a vault", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], {
      cwd: repoDir,
    });

    const embeddingServer = await startFakeEmbeddingServer();
    try {
      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "anything at all",
          cwd: repoDir,
          limit: 5,
          minSimilarity: 0.3,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(recalled.text).toContain("No memories found matching that query.");
      await expect(stat(path.join(repoDir, ".mnemonic"))).rejects.toThrow();
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});

describe("recall-scope-gating (channels + hints)", () => {
  async function setupRepo(): Promise<{
    vaultDir: string;
    repoDir: string;
    embeddingServer: Awaited<ReturnType<typeof startFakeEmbeddingServer>>;
  }> {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], {
      cwd: repoDir,
    });

    const embeddingServer = await startFakeEmbeddingServer();
    return { vaultDir, repoDir, embeddingServer };
  }

  const local = (url: string) => ({ ollamaUrl: url, disableGit: false as const });

  it("exact-wording lexical matches override the derived bar", async () => {
    const { vaultDir, repoDir, embeddingServer } = await setupRepo();
    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Adoption anchor",
          content: "Adopts the project vault for the lexical check.",
          tags: ["gating-adopt"],
          summary: "Adopt project vault",
          cwd: repoDir,
          scope: "project",
        },
        local(embeddingServer.url),
      );
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "quartzflux indexing guide",
          content: "The quartzflux indexing step must run before compaction.",
          tags: ["gating-quartz"],
          summary: "Create lexical override note",
          scope: "global",
        },
        embeddingServer.url,
      );

      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "quartzflux indexing",
          cwd: repoDir,
          limit: 10,
          minSimilarity: GATING_MIN_SIMILARITY,
        },
        local(embeddingServer.url),
      );

      expect(recalled.text).toContain("quartzflux indexing guide");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});

describe("recall-scope-gating (hints)", () => {
  it("shows the missing-cwd hint on read tools and not-found responses without cwd", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-vault-"));
    tempDirs.push(vaultDir);

    const embeddingServer = await startFakeEmbeddingServer();
    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Global unassociated note",
          content: "Stored globally without any project context.",
          tags: ["gating-global"],
          summary: "Seed global note",
          scope: "global",
        },
        embeddingServer.url,
      );

      const recallNoCwd = await callLocalMcp(
        vaultDir,
        "recall",
        { query: "global unassociated note", limit: 5 },
        embeddingServer.url,
      );
      expect(recallNoCwd).toContain("no cwd was provided");

      const listNoCwd = await callLocalMcp(vaultDir, "list", {}, embeddingServer.url);
      expect(listNoCwd).toContain("no cwd was provided");

      const getNoCwd = await callLocalMcp(
        vaultDir,
        "get",
        { ids: ["does-not-exist-1234"] },
        embeddingServer.url,
      );
      expect(getNoCwd).toContain("Not found");
      expect(getNoCwd).toContain("no cwd was provided");

      const recentNoCwd = await callLocalMcp(vaultDir, "recent_memories", {}, embeddingServer.url);
      expect(recentNoCwd).toContain("no cwd was provided");

      const graphNoCwd = await callLocalMcp(vaultDir, "memory_graph", {}, embeddingServer.url);
      expect(graphNoCwd).toContain("no cwd was provided");

      const updateNoCwd = await callLocalMcp(
        vaultDir,
        "update",
        { id: "does-not-exist-1234", content: "Should not be written" },
        embeddingServer.url,
      );
      expect(updateNoCwd).toContain("no cwd was provided");

      const forgetNoCwd = await callLocalMcp(
        vaultDir,
        "forget",
        { id: "does-not-exist-1234" },
        embeddingServer.url,
      );
      expect(forgetNoCwd).toContain("no cwd was provided");

      const whereNoCwd = await callLocalMcp(
        vaultDir,
        "where_is_memory",
        { id: "does-not-exist-1234" },
        embeddingServer.url,
      );
      expect(whereNoCwd).toContain("no cwd was provided");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});

describe("recall-scope-gating (global alignment)", () => {
  async function setupAdoptedRepo(): Promise<{
    vaultDir: string;
    repoDir: string;
    embeddingServer: Awaited<ReturnType<typeof startFakeEmbeddingServer>>;
  }> {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-gating-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], {
      cwd: repoDir,
    });

    const embeddingServer = await startFakeEmbeddingServer();
    return { vaultDir, repoDir, embeddingServer };
  }

  it("global scope includes project-tagged main-vault notes via all channels", async () => {
    const { vaultDir, repoDir, embeddingServer } = await setupAdoptedRepo();
    try {
      // "Repo you don't own" case: personal note about this repo, stored in
      // the main vault WITH project association.
      const remembered = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "wombatile deploy runbook",
          content: "Personal deploy steps for the wombat service stored globally.",
          tags: ["gating-deploy"],
          summary: "Store personal deploy steps globally",
          scope: "global",
          cwd: repoDir,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );
      expect(remembered.structuredContent?.["action"]).toBe("remembered");

      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "wombatile deploy runbook steps",
          scope: "global",
          cwd: repoDir,
          limit: 10,
          minSimilarity: GATING_MIN_SIMILARITY,
          evidence: "compact",
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(recalled.text).toContain("wombatile deploy runbook");
      const parsed = RecallResultSchema.safeParse(recalled.structuredContent);
      expect(parsed.success).toBe(true);
      if (!parsed.success) {
        throw new Error(`RecallResultSchema parse failed: ${parsed.error.message}`);
      }
      const results = parsed.data.results;
      expect(results.length).toBeGreaterThan(0);
      // The lexical channel must rank the project-tagged main-vault note (the
      // old association-based filter would have excluded it from that channel).
      const lexicalEvidence = results.some(
        (r) => r.retrievalEvidence?.channels?.includes("lexical") === true,
      );
      expect(lexicalEvidence).toBe(true);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("keeps global-policy notes (project association, main vault) visible under derived scope", async () => {
    const { vaultDir, repoDir, embeddingServer } = await setupAdoptedRepo();
    try {
      await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Crateful release checklist",
          content: "Release steps stored privately with project association for recall.",
          tags: ["gating-release"],
          summary: "Create global-policy note",
          scope: "global",
          cwd: repoDir,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      const recalled = await callLocalMcpResponse(
        vaultDir,
        "recall",
        {
          query: "crateful release checklist steps",
          cwd: repoDir,
          limit: 10,
          minSimilarity: GATING_MIN_SIMILARITY,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(recalled.structuredContent?.["scope"]).toBe("all");
      expect(recalled.text).toContain("Crateful release checklist");
      expect(recalled.text).not.toContain("suppressed");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});
