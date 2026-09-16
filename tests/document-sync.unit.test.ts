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

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function configureControlledGit(
  paths: string[],
  failures: Map<string, unknown>,
  blockedPath: string,
): {
  events: string[];
  showCalls: string[];
  waitForShowCalls: (count: number) => Promise<void>;
  waitForFailure: (filePath: string) => Promise<void>;
  releaseReads: () => void;
} {
  const events: string[] = [];
  const showCalls: string[] = [];
  const showWaiters: Array<{ count: number; resolve: () => void }> = [];
  const failureWaiters = new Map<string, Array<() => void>>();
  let readsReleased = false;
  const blockedReads: Array<() => void> = [];

  const notifyShowWaiters = (): void => {
    for (let index = showWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = showWaiters[index];
      if (waiter && showCalls.length >= waiter.count) {
        showWaiters.splice(index, 1);
        waiter.resolve();
      }
    }
  };

  const notifyFailureWaiters = (filePath: string): void => {
    for (const resolve of failureWaiters.get(filePath) ?? []) resolve();
    failureWaiters.delete(filePath);
  };

  git.fetch.mockResolvedValue(undefined);
  git.raw.mockImplementation(async (args: string[]) => {
    if (args[0] === "rev-parse") return "commit-1\n";
    if (args[0] === "ls-tree") return `${paths.join("\n")}\n`;
    if (args[0] === "show") {
      const filePath = args[1]?.split(":")[1] ?? "";
      showCalls.push(filePath);
      events.push(`show:${filePath}`);
      notifyShowWaiters();
      if (filePath === blockedPath && !readsReleased) {
        await new Promise<void>((resolve) => blockedReads.push(resolve));
      }
      events.push(`complete:${filePath}`);
      if (failures.has(filePath)) {
        events.push(`failure:${filePath}`);
        notifyFailureWaiters(filePath);
        throw failures.get(filePath);
      }
      return `# ${filePath}\n\nDocument content.`;
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
  vi.mocked(simpleGit).mockReturnValue(git as never);

  return {
    events,
    showCalls,
    waitForShowCalls: (count) => {
      if (showCalls.length >= count) return Promise.resolve();
      return new Promise<void>((resolve) => showWaiters.push({ count, resolve }));
    },
    waitForFailure: (filePath) => {
      if (events.includes(`failure:${filePath}`)) return Promise.resolve();
      const waiters = failureWaiters.get(filePath) ?? [];
      failureWaiters.set(filePath, waiters);
      return new Promise<void>((resolve) => waiters.push(resolve));
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
    const reads = configureControlledGit(
      paths,
      new Map([["docs/a.md", new Error("cannot read docs/a.md")]]),
      "docs/b.md",
    );
    const config = makeConfig("att-early-failure");
    let firstSettled = false;
    const firstResultPromise = syncDocumentSource(config, makeContext(2), undefined, "project-1");
    void firstResultPromise.then(() => {
      firstSettled = true;
      reads.events.push("first-return");
    });

    await reads.waitForShowCalls(2);
    await reads.waitForFailure("docs/a.md");
    await nextTurn();
    expect(firstSettled).toBe(false);

    const secondResultPromise = syncDocumentSource(config, makeContext(2), undefined, "project-1");
    await nextTurn();
    expect(firstSettled).toBe(false);
    expect(reads.showCalls).toEqual(["docs/a.md", "docs/b.md"]);

    reads.releaseReads();
    const [firstResult, secondResult] = await Promise.all([
      firstResultPromise,
      secondResultPromise,
    ]);

    expect(firstResult.status).toBe("failed");
    expect(firstResult.errors[0]).toContain("cannot read docs/a.md");
    expect(secondResult.status).toBe("failed");
    expect(reads.showCalls).toEqual(["docs/a.md", "docs/b.md", "docs/a.md", "docs/b.md"]);
    expect(reads.showCalls).not.toContain("docs/c.md");
    expect(reads.events.indexOf("complete:docs/b.md")).toBeLessThan(
      reads.events.indexOf("first-return"),
    );
    expect(reads.events.indexOf("complete:docs/b.md")).toBeLessThan(
      reads.events.indexOf("show:docs/a.md", 2),
    );
    expect(getCurrentGeneration("project-1", "att-early-failure")).toBeNull();
  });

  it("preserves an undefined first failure while draining a different sibling failure", async () => {
    const paths = ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md", "docs/e.md"];
    const reads = configureControlledGit(
      paths,
      new Map([
        ["docs/c.md", undefined],
        ["docs/d.md", new Error("cannot read docs/d.md")],
      ]),
      "docs/d.md",
    );
    let resultSettled = false;
    const resultPromise = syncDocumentSource(
      makeConfig("att-middle-failure"),
      makeContext(2),
      undefined,
      "project-1",
    );
    void resultPromise.then(() => {
      resultSettled = true;
      reads.events.push("first-return");
    });

    await reads.waitForShowCalls(4);
    await reads.waitForFailure("docs/c.md");
    await nextTurn();
    expect(resultSettled).toBe(false);
    expect(reads.showCalls).toEqual(["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md"]);

    reads.releaseReads();
    const result = await resultPromise;

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toBe("enumerate-failed: undefined");
    expect(result.errors[0]).not.toContain("docs/d.md");
    expect(reads.showCalls).toEqual(["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md"]);
    expect(reads.showCalls).not.toContain("docs/e.md");
    expect(reads.events.indexOf("complete:docs/d.md")).toBeLessThan(
      reads.events.indexOf("first-return"),
    );
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
