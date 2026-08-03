import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { lazyLoadGeneration } from "../src/document-lazy-load.js";
import {
  writeManifest,
  computeAttachmentConfigHash,
  MANIFEST_SCHEMA_VERSION,
} from "../src/document-manifest.js";
import { markdownExtractor } from "../src/markdown-extractor.js";
import { markdownChunker } from "../src/markdown-chunker.js";
import { clearAllGenerations, getCurrentGeneration } from "../src/generation-storage.js";
import type { DocumentSourceAttachmentConfig } from "../src/vault.js";
import type { ServerContext } from "../src/server-context.js";
import type { PersistedManifest } from "../src/document-manifest.js";
// Side-effect: registers the markdown extractor so getExtractor("text/markdown")
// resolves inside lazyLoadGeneration.
import "../src/init-extractors.js";

const execFileAsync = promisify(execFile);
const git = (repo: string, ...args: string[]) => execFileAsync("git", ["-C", repo, ...args]);

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

beforeEach(() => {
  clearAllGenerations();
});

/** Create a throwaway git repo containing markdown docs. Returns the repo dir. */
async function makeGitRepo(
  files: Record<string, string> = {
    "docs/alpha.md": "# Alpha\n\nAlpha section content.",
    "docs/beta.md": "# Beta\n\nBeta section content.",
  },
): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-"));
  tempDirs.push(repo);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(repo, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
  }
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.email", "test@example.com");
  await git(repo, "config", "user.name", "Test");
  await git(repo, "config", "commit.gpgsign", "false");
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "docs");
  return repo;
}

async function headCommit(repo: string): Promise<string> {
  const { stdout } = await git(repo, "rev-parse", "HEAD");
  return stdout.trim();
}

function makeConfig(repo: string): DocumentSourceAttachmentConfig {
  return {
    kind: "document-source",
    attachmentId: "att-1",
    projectSlug: "consumer" as DocumentSourceAttachmentConfig["projectSlug"],
    projectName: "Consumer",
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

function makeContext(): ServerContext {
  return {} as unknown as ServerContext;
}

/** Build a valid manifest matching the current extractor/chunker and config. */
async function makeManifest(
  config: DocumentSourceAttachmentConfig,
  commit: string,
  overrides: Partial<PersistedManifest> = {},
): Promise<PersistedManifest> {
  return {
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    projectId: "proj-1",
    attachmentId: config.attachmentId,
    generationId: "att-1::gen::1",
    indexedCommit: commit,
    indexSchemaVersion: "3",
    extractorId: markdownExtractor.extractorId,
    extractorVersion: markdownExtractor.extractorVersion,
    extractorOptionsHash: "default",
    chunkerId: markdownChunker.chunkerId,
    chunkerVersion: markdownChunker.chunkerVersion,
    chunkerOptionsHash: "default",
    projectionSchemaVersion: "1",
    embeddingCompatibilityIdentity: "markdown::1::markdown-heading::2::ollama::test-model",
    attachmentConfigHash: await computeAttachmentConfigHash(config),
    sourceMediaTypeCounts: { "text/markdown": 2 },
    documentCount: 2,
    chunkCount: 2,
    embeddedChunkCount: 0,
    builtAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("lazyLoadGeneration", () => {
  it("rebuilds and publishes a generation from a persisted manifest", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);

    // Simulate a manifest persisted by a prior sync.
    await writeManifest(attachmentDir, await makeManifest(config, commit));

    const generation = await lazyLoadGeneration(
      "proj-1",
      config.attachmentId,
      config,
      makeContext(),
      docSourceBase,
    );

    expect(generation).not.toBeNull();
    expect(generation!.manifest.indexedCommit).toBe(commit);
    expect(generation!.manifest.documentCount).toBe(2);
    expect(generation!.manifest.chunkCount).toBe(2);
    expect(generation!.documents.size).toBe(2);
    expect(generation!.chunks.size).toBe(2);
    // The embedding-compatibility identity is restored from the manifest.
    expect(generation!.manifest.embeddingCompatibilityIdentity).toBe(
      "markdown::1::markdown-heading::2::ollama::test-model",
    );

    // Published so subsequent recall hits the in-memory store.
    expect(getCurrentGeneration("proj-1", config.attachmentId)).toBe(generation);
  });

  it("returns null when no manifest exists (user must sync first)", async () => {
    const repo = await makeGitRepo();
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
    expect(getCurrentGeneration("proj-1", config.attachmentId)).toBeNull();
  });

  it("returns null when docSourceBase is undefined", async () => {
    const repo = await makeGitRepo();
    const config = makeConfig(repo);

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), undefined),
    ).resolves.toBeNull();
  });

  it("fails soft when the manifest's git commit does not exist", async () => {
    const repo = await makeGitRepo();
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);

    await writeManifest(
      attachmentDir,
      await makeManifest(config, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"),
    );

    // Missing commit → git ls-tree fails → fail-soft returns null (no throw).
    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
    expect(getCurrentGeneration("proj-1", config.attachmentId)).toBeNull();
  });

  it("reuses an already-loaded in-memory generation without re-deriving from git", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);

    await writeManifest(attachmentDir, await makeManifest(config, commit));

    const first = await lazyLoadGeneration(
      "proj-1",
      config.attachmentId,
      config,
      makeContext(),
      docSourceBase,
    );
    const second = await lazyLoadGeneration(
      "proj-1",
      config.attachmentId,
      config,
      makeContext(),
      docSourceBase,
    );
    expect(second).toBe(first);
  });
});
