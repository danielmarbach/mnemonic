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
import { ChunkEmbeddingStorage } from "../src/chunk-embedding-storage.js";
import { embeddingModelId } from "../src/brands.js";
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

  it("fails soft when manifest JSON is corrupt", async () => {
    const repo = await makeGitRepo();
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);
    await mkdir(attachmentDir, { recursive: true });
    await writeFile(path.join(attachmentDir, "manifest.json"), "NOT VALID JSON{{{", "utf-8");

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
    expect(getCurrentGeneration("proj-1", config.attachmentId)).toBeNull();
  });

  it("returns null when manifest projectId does not match the caller's project", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);
    await writeManifest(attachmentDir, await makeManifest(config, commit, { projectId: "other" }));

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
  });

  it("returns null when manifest attachmentId does not match the caller's attachment", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);
    await writeManifest(
      attachmentDir,
      await makeManifest(config, commit, { attachmentId: "att-wrong" }),
    );

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
  });

  it("returns null when the extractor version drifted from the manifest", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);
    await writeManifest(
      attachmentDir,
      await makeManifest(config, commit, { extractorVersion: "99" }),
    );

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
  });

  it("returns null when the chunker version drifted from the manifest", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);
    await writeManifest(
      attachmentDir,
      await makeManifest(config, commit, { chunkerVersion: "99" }),
    );

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
  });

  it("returns null when the attachment config hash drifted from the manifest", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);
    await writeManifest(
      attachmentDir,
      await makeManifest(config, commit, { attachmentConfigHash: "deadbeef" }),
    );

    await expect(
      lazyLoadGeneration("proj-1", config.attachmentId, config, makeContext(), docSourceBase),
    ).resolves.toBeNull();
  });

  it("loads persisted chunk embeddings from disk into the rebuilt generation", async () => {
    const repo = await makeGitRepo();
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);

    // Persist the manifest and one embedding record for the first chunk of
    // docs/alpha.md (documentId "att-1::docs-alpha-md", heading ancestry
    // [Alpha], occurrence 0, split ordinal 0).
    await writeManifest(
      attachmentDir,
      await makeManifest(config, commit, { embeddedChunkCount: 1 }),
    );
    const chunkStorage = new ChunkEmbeddingStorage(attachmentDir, config.attachmentId);
    await chunkStorage.write({
      chunkId: "att-1::docs-alpha-md::Alpha::0::0",
      contentHash: "a".repeat(32),
      model: embeddingModelId("test-model"),
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    const generation = await lazyLoadGeneration(
      "proj-1",
      config.attachmentId,
      config,
      makeContext(),
      docSourceBase,
    );

    expect(generation).not.toBeNull();
    expect(generation!.chunkEmbeddings.size).toBe(1);
    expect(generation!.chunkEmbeddings.has("att-1::docs-alpha-md::Alpha::0::0")).toBe(true);
    expect(generation!.manifest.embeddedChunkCount).toBe(1);
  });

  it("lazily loads a generation from a large repository without breaking the file cap", async () => {
    // Build a repo with 120 markdown files (beyond a trivial set, still well
    // under MAX_LAZY_LOAD_FILES=5000 so every file is indexed).
    const files: Record<string, string> = {};
    for (let i = 0; i < 120; i++) {
      files[`docs/file-${String(i).padStart(3, "0")}.md`] = `# Doc ${i}\n\nContent for file ${i}.`;
    }
    const repo = await makeGitRepo(files);
    const commit = await headCommit(repo);
    const config = makeConfig(repo);
    const docSourceBase = path.join(
      await mkdtemp(path.join(os.tmpdir(), "mnemonic-lazyload-")),
      "doc-source",
    );
    tempDirs.push(docSourceBase);
    const attachmentDir = path.join(docSourceBase, config.attachmentId);

    await writeManifest(
      attachmentDir,
      await makeManifest(config, commit, {
        documentCount: 120,
        chunkCount: 120,
        sourceMediaTypeCounts: { "text/markdown": 120 },
      }),
    );

    const generation = await lazyLoadGeneration(
      "proj-1",
      config.attachmentId,
      config,
      makeContext(),
      docSourceBase,
    );
    expect(generation).not.toBeNull();
    expect(generation!.documents.size).toBe(120);
    expect(generation!.chunks.size).toBe(120);
  });
});
