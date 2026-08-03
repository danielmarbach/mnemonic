import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  computeAttachmentConfigHash,
  MANIFEST_SCHEMA_VERSION,
  readManifest,
  resolveDocSourceBase,
  resolveManifestPath,
  validateManifest,
  writeManifest,
  type PersistedManifest,
} from "../src/document-manifest.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-manifest-"));
  tempDirs.push(dir);
  return dir;
}

function makeManifest(overrides: Partial<PersistedManifest> = {}): PersistedManifest {
  return {
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    projectId: "proj-1",
    attachmentId: "att-1",
    generationId: "att-1::gen::123",
    indexedCommit: "abc123def456abc123def456abc123def456abc1",
    indexSchemaVersion: "3",
    extractorId: "markdown",
    extractorVersion: "1.0.0",
    extractorOptionsHash: "default",
    chunkerId: "markdown-chunker",
    chunkerVersion: "1.0.0",
    chunkerOptionsHash: "default",
    projectionSchemaVersion: "1",
    embeddingCompatibilityIdentity: "markdown::1.0.0::markdown-chunker::1.0.0::ollama::test-model",
    attachmentConfigHash: "deadbeef",
    sourceMediaTypeCounts: { "text/markdown": 2 },
    documentCount: 2,
    chunkCount: 4,
    embeddedChunkCount: 4,
    builtAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("writeManifest + readManifest", () => {
  it("round-trips a manifest to disk and reads it back with all fields", async () => {
    const dir = await makeDir();
    const manifest = makeManifest();

    await writeManifest(dir, manifest);

    const read = await readManifest(dir);
    expect(read).toEqual(manifest);
  });

  it("writes atomically and leaves no temp file behind", async () => {
    const dir = await makeDir();
    const manifest = makeManifest();

    await writeManifest(dir, manifest);

    const entries = await readdir(dir);
    const tempFiles = entries.filter((name) => name.includes("manifest.json.tmp-"));
    expect(tempFiles).toEqual([]);
    expect(entries).toEqual(["manifest.json"]);
  });
});

describe("readManifest fail-soft", () => {
  it("returns null when the file is missing", async () => {
    const dir = await makeDir();
    await expect(readManifest(dir)).resolves.toBeNull();
  });

  it("returns null when the file is not valid JSON", async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, "manifest.json"), "{ not valid json", "utf-8");
    await expect(readManifest(dir)).resolves.toBeNull();
  });

  it("returns null when the payload fails schema validation", async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ foo: "bar" }), "utf-8");
    await expect(readManifest(dir)).resolves.toBeNull();
  });
});

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateManifest(makeManifest())).toBe(true);
  });

  it("rejects a non-object payload", () => {
    expect(validateManifest(null)).toBe(false);
    expect(validateManifest([])).toBe(false);
    expect(validateManifest("manifest")).toBe(false);
  });

  it("rejects a wrong schema version", () => {
    const raw = makeManifest({ manifestSchemaVersion: "2" });
    expect(validateManifest(raw)).toBe(false);
  });

  it("rejects a missing required string field", () => {
    const { attachmentId: _attachmentId, ...withoutAttachmentId } = makeManifest();
    expect(validateManifest(withoutAttachmentId)).toBe(false);
  });

  it("rejects an empty indexedCommit", () => {
    expect(validateManifest(makeManifest({ indexedCommit: "" }))).toBe(false);
  });

  it("rejects a non-integer count", () => {
    expect(validateManifest(makeManifest({ documentCount: 2.5 }))).toBe(false);
    expect(validateManifest(makeManifest({ chunkCount: -1 }))).toBe(false);
  });

  it("rejects a malformed sourceMediaTypeCounts record", () => {
    const raw = makeManifest() as unknown as Record<string, unknown>;
    raw["sourceMediaTypeCounts"] = ["text/markdown"];
    expect(validateManifest(raw)).toBe(false);
  });
});

describe("resolveDocSourceBase", () => {
  it("prefers the project vault embeddings dir", () => {
    const result = resolveDocSourceBase("/proj/.mnemonic/embeddings", "/main/embeddings");
    expect(result).toBe(path.join("/proj/.mnemonic/embeddings", "doc-source"));
  });

  it("falls back to the main vault when no project vault", () => {
    const result = resolveDocSourceBase(undefined, "/main/embeddings");
    expect(result).toBe(path.join("/main/embeddings", "doc-source"));
  });

  it("returns undefined when no vault dir is available", () => {
    expect(resolveDocSourceBase(undefined, "")).toBeUndefined();
    expect(resolveDocSourceBase("", "")).toBeUndefined();
  });
});

describe("resolveManifestPath", () => {
  it("builds the per-attachment manifest path", () => {
    expect(resolveManifestPath("/base/doc-source", "att-1")).toBe(
      path.join("/base/doc-source", "att-1", "manifest.json"),
    );
  });
});

describe("computeAttachmentConfigHash", () => {
  it("is deterministic for identical configs", async () => {
    const config = {
      kind: "document-source",
      localPath: "/tmp/repo",
      root: ".",
      include: ["**/*.md"],
      exclude: ["node_modules"],
      acceptedMediaTypes: ["text/markdown"],
    };
    const a = await computeAttachmentConfigHash(config);
    const b = await computeAttachmentConfigHash(config);
    expect(a).toBe(b);
  });

  it("changes when any indexing-relevant field changes", async () => {
    const base = {
      kind: "document-source",
      localPath: "/tmp/repo",
      root: ".",
      include: ["**/*.md"],
      exclude: ["node_modules"],
      acceptedMediaTypes: ["text/markdown"],
    };
    const original = await computeAttachmentConfigHash(base);

    expect(await computeAttachmentConfigHash({ ...base, localPath: "/tmp/other" })).not.toBe(
      original,
    );
    expect(await computeAttachmentConfigHash({ ...base, root: "docs" })).not.toBe(original);
    expect(
      await computeAttachmentConfigHash({ ...base, include: ["**/*.md", "**/*.txt"] }),
    ).not.toBe(original);
    expect(await computeAttachmentConfigHash({ ...base, exclude: [] })).not.toBe(original);
    expect(
      await computeAttachmentConfigHash({ ...base, acceptedMediaTypes: ["text/plain"] }),
    ).not.toBe(original);
  });
});
