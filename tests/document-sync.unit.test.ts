import { beforeEach, describe, expect, it, vi } from "vitest";
import { simpleGit } from "simple-git";
import "../src/init-extractors.js";
import { clearAllGenerations, getCurrentGeneration } from "../src/generation-storage.js";
import { syncDocumentSource } from "../src/document-sync.js";
import type { DocumentSourceAttachmentConfig } from "../src/vault.js";
import type { ServerContext } from "../src/server-context.js";

vi.mock("simple-git", () => ({ simpleGit: vi.fn() }));

type GitMock = {
  fetch: ReturnType<typeof vi.fn>;
  raw: ReturnType<typeof vi.fn>;
};

const git = {
  fetch: vi.fn(),
  raw: vi.fn(),
} satisfies GitMock;

function makeConfig(attachmentId: string): DocumentSourceAttachmentConfig {
  return {
    kind: "document-source",
    attachmentId,
    projectSlug: "test-source" as DocumentSourceAttachmentConfig["projectSlug"],
    projectName: "test source",
    localPath: "/tmp/test-source",
    enabled: true,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    root: ".",
    include: ["**/*.md"],
    exclude: [],
    acceptedMediaTypes: ["text/markdown"],
  };
}

function makeContext(concurrency: number): ServerContext {
  return { config: { reindexEmbedConcurrency: concurrency } } as unknown as ServerContext;
}

function configureGit(
  paths: string[],
  delayMs: number,
  failurePath?: string,
): {
  showCalls: string[];
  getMaxActiveReads: () => number;
} {
  let activeReads = 0;
  let maxActiveReads = 0;
  const showCalls: string[] = [];
  git.fetch.mockResolvedValue(undefined);
  git.raw.mockImplementation(async (args: string[]) => {
    if (args[0] === "rev-parse") return "commit-1\n";
    if (args[0] === "ls-tree") return `${paths.join("\n")}\n`;
    if (args[0] === "show") {
      const filePath = args[1]?.split(":")[1] ?? "";
      showCalls.push(filePath);
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      activeReads -= 1;
      if (filePath === failurePath) throw new Error(`cannot read ${filePath}`);
      return `# ${filePath}\n\nDocument content.`;
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
  vi.mocked(simpleGit).mockReturnValue(git as never);
  return { showCalls, getMaxActiveReads: () => maxActiveReads };
}

function configureControlledGit(
  paths: string[],
  failurePath: string,
  blockedPath: string,
): {
  events: string[];
  waitForShowCalls: (count: number) => Promise<void>;
  releaseReads: () => void;
} {
  const events: string[] = [];
  const waiters: Array<{ count: number; resolve: () => void }> = [];
  let readsReleased = false;
  const blockedReads: Array<() => void> = [];

  const notifyWaiters = (): void => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter && events.filter((event) => event.startsWith("show:")).length >= waiter.count) {
        waiters.splice(index, 1);
        waiter.resolve();
      }
    }
  };

  git.fetch.mockResolvedValue(undefined);
  git.raw.mockImplementation(async (args: string[]) => {
    if (args[0] === "rev-parse") return "commit-1\n";
    if (args[0] === "ls-tree") return `${paths.join("\n")}\n`;
    if (args[0] === "show") {
      const filePath = args[1]?.split(":")[1] ?? "";
      events.push(`show:${filePath}`);
      notifyWaiters();
      if (filePath === failurePath) {
        throw new Error(`cannot read ${filePath}`);
      }
      if (filePath === blockedPath && !readsReleased) {
        await new Promise<void>((resolve) => blockedReads.push(resolve));
      }
      return `# ${filePath}\n\nDocument content.`;
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
  vi.mocked(simpleGit).mockReturnValue(git as never);

  return {
    events,
    waitForShowCalls: (count) => {
      const showCount = events.filter((event) => event.startsWith("show:")).length;
      if (showCount >= count) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push({ count, resolve }));
    },
    releaseReads: () => {
      readsReleased = true;
      events.push("release");
      for (const resolve of blockedReads.splice(0)) resolve();
    },
  };
}

describe("syncDocumentSource blob reads", () => {
  beforeEach(() => {
    clearAllGenerations();
    git.fetch.mockReset();
    git.raw.mockReset();
    vi.mocked(simpleGit).mockReset();
  });

  it("preserves blob order while bounding concurrent reads", async () => {
    const paths = ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md", "docs/e.md"];
    const reads = configureGit(paths, 10);

    const result = await syncDocumentSource(
      makeConfig("att-order"),
      makeContext(2),
      undefined,
      "project-1",
    );

    expect(result.status).toBe("indexed");
    expect(reads.showCalls).toHaveLength(paths.length);
    expect(reads.getMaxActiveReads()).toBe(2);
    const generation = getCurrentGeneration("project-1", "att-order");
    const documentPaths = generation
      ? [...generation.documents.values()].map((doc) => doc.sourcePath)
      : [];
    expect(documentPaths).toEqual(paths);
  });

  it("filters excluded files before scheduling blob reads", async () => {
    const paths = ["docs/included.md", "docs/ignored.txt", "README.md"];
    const reads = configureGit(paths, 1);
    const config = { ...makeConfig("att-filter"), include: ["docs/**/*.md"] };

    const result = await syncDocumentSource(config, makeContext(2), undefined, "project-1");

    expect(result.status).toBe("indexed");
    expect(reads.showCalls).toEqual(["docs/included.md"]);
    expect(result.documentCount).toBe(1);
  });

  it("stops scheduling after an early failure, drains reads, and orders the generation lock", async () => {
    const paths = ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md"];
    const reads = configureControlledGit(paths, "docs/a.md", "docs/b.md");
    const config = makeConfig("att-early-failure");

    const firstResultPromise = syncDocumentSource(config, makeContext(2), undefined, "project-1");
    await reads.waitForShowCalls(2);
    const secondResultPromise = syncDocumentSource(config, makeContext(2), undefined, "project-1");
    reads.releaseReads();

    const [firstResult, secondResult] = await Promise.all([
      firstResultPromise,
      secondResultPromise,
    ]);

    expect(firstResult.status).toBe("failed");
    expect(firstResult.errors[0]).toContain("cannot read docs/a.md");
    expect(secondResult.status).toBe("failed");
    expect(reads.events).toEqual([
      "show:docs/a.md",
      "show:docs/b.md",
      "release",
      "show:docs/a.md",
      "show:docs/b.md",
    ]);
    expect(getCurrentGeneration("project-1", "att-early-failure")).toBeNull();
  });

  it("stops scheduling after a middle failure while draining the sibling read", async () => {
    const paths = ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md", "docs/e.md"];
    const reads = configureControlledGit(paths, "docs/c.md", "docs/d.md");

    const resultPromise = syncDocumentSource(
      makeConfig("att-middle-failure"),
      makeContext(2),
      undefined,
      "project-1",
    );
    await reads.waitForShowCalls(4);
    reads.releaseReads();
    const result = await resultPromise;

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("cannot read docs/c.md");
    expect(reads.events).toEqual([
      "show:docs/a.md",
      "show:docs/b.md",
      "show:docs/c.md",
      "show:docs/d.md",
      "release",
    ]);
    expect(getCurrentGeneration("project-1", "att-middle-failure")).toBeNull();
  });

  it("preserves all-or-nothing enumeration failure semantics", async () => {
    const paths = ["docs/a.md", "docs/b.md", "docs/c.md"];
    configureGit(paths, 1, "docs/c.md");

    const result = await syncDocumentSource(
      makeConfig("att-failure"),
      makeContext(2),
      undefined,
      "project-1",
    );

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("enumerate-failed");
    expect(getCurrentGeneration("project-1", "att-failure")).toBeNull();
  });
});
