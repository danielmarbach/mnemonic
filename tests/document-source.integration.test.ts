import { describe, expect, it, beforeAll } from "vitest";
import http from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  createPersistentMcpSession,
  ensureBuiltEntryPointReady,
  startFakeEmbeddingServer,
} from "./helpers/mcp.js";

const execFileAsync = promisify(execFile);
const git = (repo: string, ...args: string[]) => execFileAsync("git", ["-C", repo, ...args]);

const ZETA = "zeta-workflow-engine";
const FLORGNART = "florgnart-bottleneck";

interface DocSourceEnv {
  base: string;
  mainVault: string;
  consumer: string;
  docsource: string;
}

async function setupDocSourceEnv(): Promise<DocSourceEnv> {
  const base = await mkdtemp(path.join(os.tmpdir(), "mnemonic-docsource-it-"));
  const mainVault = path.join(base, "main-vault");
  const consumer = path.join(base, "consumer");
  const docsource = path.join(base, "docsource");

  for (const dir of [mainVault, consumer, docsource]) await mkdir(dir, { recursive: true });

  // Main vault git (config commits land here).
  await git(mainVault, "init", "-b", "main");
  await git(mainVault, "config", "user.email", "test@example.com");
  await git(mainVault, "config", "user.name", "Test");
  await git(mainVault, "config", "commit.gpgsign", "false");

  // Consumer project repo (identity falls back to folder name; no origin).
  await writeFile(path.join(consumer, "README.md"), "# consumer\n");
  await git(consumer, "init", "-b", "main");
  await git(consumer, "config", "user.email", "test@example.com");
  await git(consumer, "config", "user.name", "Test");
  await git(consumer, "config", "commit.gpgsign", "false");
  await git(consumer, "add", ".");
  await git(consumer, "commit", "-m", "init");

  // Document-source repo. add_attachment requires `origin`; document-sync
  // resolves `origin/HEAD`.
  await mkdir(path.join(docsource, "docs"), { recursive: true });
  await writeFile(
    path.join(docsource, "docs", "zeta.md"),
    `# Zeta Workflow Engine\n\nThe ${ZETA} orchestrates durable sagas.\n\n## Initiation\n\nA ${ZETA} saga starts with a starter event.\n`,
  );
  await writeFile(
    path.join(docsource, "docs", "florgnart.md"),
    `# Florgnart Runbook\n\nA ${FLORGNART} shows rising consumer lag.\n`,
  );
  await writeFile(path.join(docsource, "README.md"), "# docsource\n");
  await git(docsource, "init", "-b", "main");
  await git(docsource, "config", "user.email", "test@example.com");
  await git(docsource, "config", "user.name", "Test");
  await git(docsource, "config", "commit.gpgsign", "false");
  await git(docsource, "add", ".");
  await git(docsource, "commit", "-m", "docs");
  await git(docsource, "remote", "add", "origin", docsource);
  await git(docsource, "fetch", "origin");
  await git(docsource, "remote", "set-head", "origin", "-a");

  return { base, mainVault, consumer, docsource };
}

const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

beforeAll(async () => {
  await ensureBuiltEntryPointReady();
}, 120000);

/** Embedding server that always returns HTTP 500, to exercise recall fail-soft. */
async function startFailingEmbeddingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "internal server error" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("could not bind failing server");
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Deterministic 8-dim vector for arbitrary text. The moonshadow/quicksilver
 * marker phrases below are mapped to the SAME vector by the fake server so
 * semantically-associated texts (chunk projection vs query) get cosine 1 while
 * everything else gets a stable unrelated vector.
 */
function hashVector(text: string): number[] {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619);
    h2 = Math.imul(h2 + code, 2654435761);
  }
  const vector: number[] = [];
  for (let i = 0; i < 8; i++) {
    const component = ((h1 >>> (i * 4)) & 0xffff) / 65535;
    // Keep components away from the marker vector's all-zero tail so unrelated
    // texts never look semantically close to the marker phrase.
    vector.push(0.05 + 0.9 * (Number.isFinite(component) ? component : 0));
  }
  return vector;
}

const SEMANTIC_MARKER_VECTOR = [1, 0, 0, 0, 0, 0, 0, 0] as const;

/**
 * Fake Ollama embedder with real vectors: maps the moonshadow-vault chunk
 * marker and the quicksilver-core query marker to the same vector (semantic
 * match) and every other text to a stable unrelated hash vector.
 */
async function startSemanticFakeEmbeddingServer(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embed") {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = JSON.parse(raw) as { input?: string };
      const input = body.input ?? "";
      const vector =
        input.includes("moonshadow-vault") || input.includes("quicksilver-core")
          ? [...SEMANTIC_MARKER_VECTOR]
          : hashVector(input);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ embeddings: [vector] }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("could not bind semantic server");
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("document-source attachment integration", () => {
  it("indexes, recalls, retrieves, and rejects mutation of document chunks end-to-end", async () => {
    const env = await setupDocSourceEnv();
    const embedding = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(env.mainVault, {
      ollamaUrl: embedding.url,
      disableGit: false,
    });
    try {
      const cwd = env.consumer;
      await session.callTool("add_attachment", {
        cwd,
        localPath: env.docsource,
        kind: "document-source",
        root: ".",
        include: ["**/*.md"],
        acceptedMediaTypes: ["text/markdown"],
      });

      const sync = await session.callTool("sync", { cwd });
      expect(sync.text).toMatch(/doc-source:.*Indexed 3 documents, \d+ chunks/);

      const recall = await session.callTool("recall", {
        cwd,
        query: ZETA,
        limit: 10,
        scope: "all",
      });
      const chunks = asArr(recall.structuredContent?.documentChunks);
      expect(chunks.length).toBeGreaterThan(0);
      const first = chunks[0] as Record<string, unknown>;
      expect(first["retrievalHandle"]).toMatch(/^chunk:/);

      // Bug 3/4 regression: get(chunk:) resolves to exact source text
      const chunkHandle = first["retrievalHandle"] as string;
      const getChunk = await session.callTool("get", { cwd, ids: [chunkHandle] });
      const chunkDocs = asArr(getChunk.structuredContent?.documents);
      expect((chunkDocs[0] as { content?: string })?.content).toContain(ZETA);

      // get(doc:) resolves to document-level source
      const docHandle = `doc:${first["documentId"] as string}`;
      const getDoc = await session.callTool("get", { cwd, ids: [docHandle] });
      const docDocs = asArr(getDoc.structuredContent?.documents);
      expect((docDocs[0] as { content?: string })?.content).toContain(ZETA);

      // Bug 3 regression: mutation rejects doc:/chunk: with ImmutableDocumentSourceError,
      // NOT a schema validation error.
      const forgetDoc = await session.callTool("forget", { cwd, id: docHandle });
      expect(forgetDoc.text).not.toMatch(/Invalid (note ID|entity)/);
      expect(forgetDoc.text).toMatch(
        /document-source entity.*read-only|Cannot forget document-source/,
      );

      const forgetChunk = await session.callTool("forget", { cwd, id: chunkHandle });
      expect(forgetChunk.text).not.toMatch(/Invalid (note ID|entity)/);
      expect(forgetChunk.text).toMatch(
        /document-source entity.*read-only|Cannot forget document-source/,
      );
    } finally {
      await session.close();
      await embedding.close();
      await rm(env.base, { recursive: true, force: true });
    }
  }, 60000);

  it("directory-prefixed include glob scopes by path (Bug 1 regression)", async () => {
    const env = await setupDocSourceEnv();
    const embedding = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(env.mainVault, {
      ollamaUrl: embedding.url,
      disableGit: false,
    });
    try {
      await session.callTool("add_attachment", {
        cwd: env.consumer,
        localPath: env.docsource,
        kind: "document-source",
        root: ".",
        include: ["docs/**/*.md"],
        acceptedMediaTypes: ["text/markdown"],
      });
      const sync = await session.callTool("sync", { cwd: env.consumer });
      // docs/zeta.md and docs/florgnart.md only; README.md at root is excluded.
      expect(sync.text).toMatch(/doc-source:.*Indexed 2 documents, \d+ chunks/);
      expect(sync.text).not.toMatch(/Indexed 3 documents/);
    } finally {
      await session.close();
      await embedding.close();
      await rm(env.base, { recursive: true, force: true });
    }
  }, 60000);

  it("recall returns document chunks even when query embedding fails (Bug 2 regression)", async () => {
    const env = await setupDocSourceEnv();
    // Embedder that fails fast with HTTP 500 (a dead TCP port can hang on
    // connect; a 500 response fails immediately).
    const failing = await startFailingEmbeddingServer();
    const session = await createPersistentMcpSession(env.mainVault, {
      ollamaUrl: failing.url,
      disableGit: false,
    });
    try {
      const cwd = env.consumer;
      await session.callTool("add_attachment", {
        cwd,
        localPath: env.docsource,
        kind: "document-source",
        root: ".",
        include: ["**/*.md"],
        acceptedMediaTypes: ["text/markdown"],
      });
      // document-source indexing does not require embeddings
      await session.callTool("sync", { cwd });

      const recall = await session.callTool("recall", {
        cwd,
        query: ZETA,
        limit: 10,
        scope: "all",
      });
      const chunks = asArr(recall.structuredContent?.documentChunks);
      expect(chunks.length).toBeGreaterThan(0);
      expect((chunks[0] as { retrievalHandle?: string })?.retrievalHandle).toMatch(/^chunk:/);
    } finally {
      await session.close();
      await failing.close();
      await rm(env.base, { recursive: true, force: true });
    }
  }, 60000);

  it("semantic recall surfaces a chunk that lexical matching misses", async () => {
    const env = await setupDocSourceEnv();
    // A doc whose content, heading, and path share no tokens with the query,
    // but whose embedding (via the fake semantic embedder) sits on the query
    // vector: the only channel that can surface it is the semantic one.
    await writeFile(
      path.join(env.docsource, "docs", "moonshadow.md"),
      `# Moonshadow Vault\n\nThe moonshadow-vault subsystem coordinates durable state transitions across worker nodes.\n`,
    );
    await git(env.docsource, "add", ".");
    await git(env.docsource, "commit", "-m", "moonshadow");
    await git(env.docsource, "fetch", "origin");

    const embedding = await startSemanticFakeEmbeddingServer();
    const session = await createPersistentMcpSession(env.mainVault, {
      ollamaUrl: embedding.url,
      disableGit: false,
    });
    try {
      const cwd = env.consumer;
      // remember(scope: project) creates the .mnemonic project vault so sync
      // can persist chunk embeddings under <gitRoot>/.mnemonic/embeddings.
      await session.callTool("remember", {
        cwd,
        title: "Semantic doc-source test note",
        content: "Seed note that creates the project vault.",
        scope: "project",
        summary: "Create project vault for document-source embedding tests",
      });

      await session.callTool("add_attachment", {
        cwd,
        localPath: env.docsource,
        kind: "document-source",
        root: ".",
        include: ["**/*.md"],
        acceptedMediaTypes: ["text/markdown"],
      });

      const sync = await session.callTool("sync", { cwd });
      expect(sync.text).toMatch(/doc-source:.*Indexed \d+ documents, \d+ chunks/);
      // The semantic fake embedder works, so sync must not report failures.
      expect(sync.text).not.toMatch(/embedding failure/);

      const recall = await session.callTool("recall", {
        cwd,
        query: "quicksilver-core reconciliation",
        limit: 10,
        scope: "all",
      });
      const chunks = asArr(recall.structuredContent?.documentChunks);
      const semanticChunk = chunks.find(
        (c) => (c as { sourcePath?: string }).sourcePath === "docs/moonshadow.md",
      );
      expect(semanticChunk).toBeDefined();
      // Cosine of the marker vector against itself is 1: a semantic-only hit.
      expect((semanticChunk as { semanticScore?: number }).semanticScore).toBeGreaterThan(0.9);
      // Lexical evidence is negligible (bigram noise on shared substrings), so
      // the semantic channel is what surfaces this chunk.
      const lexicalScore = (semanticChunk as { lexicalScore?: number }).lexicalScore ?? 0;
      expect(lexicalScore).toBeLessThan(0.1);
      // The semantic-only chunk outranks every lexical candidate.
      expect((chunks[0] as { sourcePath?: string }).sourcePath).toBe("docs/moonshadow.md");
      // The chunk is also visible in the unified text with a chunk: handle.
      expect(recall.text).toContain("chunk:");
      expect(recall.text).toContain("docs/moonshadow.md");
    } finally {
      await session.close();
      await embedding.close();
      await rm(env.base, { recursive: true, force: true });
    }
  }, 60000);

  it("a second identical sync reports unchanged (isGenerationCurrent reuses the generation)", async () => {
    const env = await setupDocSourceEnv();
    const embedding = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(env.mainVault, {
      ollamaUrl: embedding.url,
      disableGit: false,
    });
    try {
      const cwd = env.consumer;
      await session.callTool("add_attachment", {
        cwd,
        localPath: env.docsource,
        kind: "document-source",
        root: ".",
        include: ["**/*.md"],
        acceptedMediaTypes: ["text/markdown"],
      });

      const first = await session.callTool("sync", { cwd });
      expect(first.text).toMatch(/doc-source:.*Indexed \d+ documents, \d+ chunks/);

      // Same commit, same extractor/chunker/embedding identity: the generation
      // is current, so a second sync must not re-index.
      const second = await session.callTool("sync", { cwd });
      expect(second.text).toMatch(/doc-source:.*No changes on/);
      expect(second.text).not.toMatch(/Indexed/);
    } finally {
      await session.close();
      await embedding.close();
      await rm(env.base, { recursive: true, force: true });
    }
  }, 60000);
});
