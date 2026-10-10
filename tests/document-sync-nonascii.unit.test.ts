import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import "../src/init-extractors.js";
import { clearAllGenerations, getCurrentGeneration } from "../src/generation-storage.js";
import { computePerPathLastMod, syncDocumentSource } from "../src/document-sync.js";
import type { DocumentSourceAttachmentConfig } from "../src/vault.js";
import type { ServerContext } from "../src/server-context.js";

const execFileAsync = promisify(execFile);
const git = (repo: string, ...args: string[]) => execFileAsync("git", ["-C", repo, ...args]);

const tempDirs: string[] = [];

afterEach(async () => {
  clearAllGenerations();
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })),
  );
});

/** Repo with docs/café.md and docs/plain.md pushed to a bare origin (origin/HEAD resolves). */
async function makeRepoWithOrigin(): Promise<{ repo: string; commit: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mnemonic-sync-nonascii-"));
  tempDirs.push(root);
  const bare = path.join(root, "origin.git");
  const repo = path.join(root, "work");
  await mkdir(bare);
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await execFileAsync("git", ["init", "--bare", "-b", "main"], { cwd: bare });
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.email", "test@example.com");
  await git(repo, "config", "user.name", "Test");
  await git(repo, "config", "commit.gpgsign", "false");
  await writeFile(path.join(repo, "docs", "café.md"), "# Café\n\nCafé content.", "utf-8");
  await writeFile(path.join(repo, "docs", "plain.md"), "# Plain\n\nPlain content.", "utf-8");
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "docs");
  await git(repo, "remote", "add", "origin", bare);
  await git(repo, "push", "-u", "origin", "main");
  await git(repo, "remote", "set-head", "origin", "main");
  const { stdout } = await git(repo, "rev-parse", "HEAD");
  return { repo, commit: stdout.trim() };
}

function makeConfig(repo: string): DocumentSourceAttachmentConfig {
  return {
    kind: "document-source",
    attachmentId: "att-nonascii",
    projectSlug: "nonascii" as DocumentSourceAttachmentConfig["projectSlug"],
    projectName: "nonascii",
    localPath: repo,
    enabled: true,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    root: ".",
    include: ["**/*.md"],
    exclude: [],
    acceptedMediaTypes: ["text/markdown"],
  };
}

describe("document sync with non-ASCII paths", () => {
  it("indexes files whose names git would otherwise quote", async () => {
    const { repo } = await makeRepoWithOrigin();

    const result = await syncDocumentSource(
      makeConfig(repo),
      { config: { reindexEmbedConcurrency: 1 } } as unknown as ServerContext,
      undefined,
      "project-1",
    );

    expect(result.status).toBe("indexed");
    expect(result.documentCount).toBe(2);
    const generation = getCurrentGeneration("project-1", "att-nonascii");
    const sourcePaths = generation
      ? [...generation.documents.values()].map((doc) => doc.sourcePath).sort()
      : [];
    expect(sourcePaths).toEqual(["docs/café.md", "docs/plain.md"]);
  });

  it("computes recency for non-ASCII paths", async () => {
    const { repo, commit } = await makeRepoWithOrigin();

    const lastMod = await computePerPathLastMod(repo, commit, ["docs/café.md", "docs/plain.md"]);

    expect([...lastMod.keys()].sort()).toEqual(["docs/café.md", "docs/plain.md"]);
  });
});
