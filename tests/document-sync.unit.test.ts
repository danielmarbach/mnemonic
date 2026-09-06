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
