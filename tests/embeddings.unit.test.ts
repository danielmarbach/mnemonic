import fs from "fs/promises";
import http from "http";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { Storage, type Note } from "../src/storage.js";
import {
  checkEmbeddingCompatibility,
  createEmbeddingProvider,
  cosineSimilarity,
  currentEmbeddingIdentity,
  embeddingMetadata,
  resolveEmbeddingProviderConfig,
  safeCosineSimilarity,
} from "../src/embeddings.js";

const tempDirs: string[] = [];
const closeServers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  await Promise.all(closeServers.splice(0).map((close) => close()));
});

async function startOpenAICompatibleServer(options: {
  expectedAuth?: string;
  expectedModel: string;
  expectedDimensions?: number;
  embedding?: number[];
}): Promise<{ url: string }> {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/embeddings") {
      res.writeHead(404).end();
      return;
    }

    if (options.expectedAuth !== undefined && req.headers.authorization !== `Bearer ${options.expectedAuth}`) {
      res.writeHead(401).end(JSON.stringify({ error: "missing auth" }));
      return;
    }

    let raw = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (
        body["model"] !== options.expectedModel
        || body["encoding_format"] !== "float"
        || (options.expectedDimensions !== undefined && body["dimensions"] !== options.expectedDimensions)
      ) {
        res.writeHead(400).end(JSON.stringify({ error: "unexpected body" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ embedding: options.embedding ?? [0.2, 0.4, 0.6] }] }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine fake OpenAI-compatible server address");
  }

  closeServers.push(() => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  }));

  return { url: `http://127.0.0.1:${address.port}` };
}

async function startGeminiServer(options: {
  expectedApiKey: string;
  expectedModel: string;
  expectedDimensions?: number;
  embedding?: number[];
}): Promise<{ url: string }> {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== `/v1beta/models/${options.expectedModel}:embedContent`) {
      res.writeHead(404).end();
      return;
    }

    if (req.headers["x-goog-api-key"] !== options.expectedApiKey) {
      res.writeHead(401).end(JSON.stringify({ error: "missing api key" }));
      return;
    }

    let raw = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      const content = body["content"] as { parts?: Array<{ text?: string }> } | undefined;
      if (
        body["model"] !== `models/${options.expectedModel}`
        || typeof content?.parts?.[0]?.text !== "string"
        || (options.expectedDimensions !== undefined && body["outputDimensionality"] !== options.expectedDimensions)
      ) {
        res.writeHead(400).end(JSON.stringify({ error: "unexpected body" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ embedding: { values: options.embedding ?? [0.7, 0.8, 0.9] } }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine fake Gemini server address");
  }

  closeServers.push(() => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  }));

  return { url: `http://127.0.0.1:${address.port}` };
}

async function createTempStorage(): Promise<Storage> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-embeddings-"));
  tempDirs.push(dir);
  const storage = new Storage(dir);
  await storage.init();
  return storage;
}

function createTestNote(id: string, title: string, content: string): Note {
  const now = new Date().toISOString();
  return {
    id,
    title,
    content,
    tags: ["test"],
    lifecycle: "permanent",
    createdAt: now,
    updatedAt: now,
  };
}

describe("Storage embedding lifecycle", () => {
  it("creates note without requiring embedding", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);

    const retrieved = await storage.readNote("test-note");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe("Test Title");

    // Embedding is optional
    const embedding = await storage.readEmbedding("test-note");
    expect(embedding).toBeNull();
  });

  it("stores and retrieves embeddings", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "test-note",
      model: "test-model",
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    const retrieved = await storage.readEmbedding("test-note");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.model).toBe("test-model");
    expect(retrieved?.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("stores and retrieves provider compatibility metadata", async () => {
    const storage = await createTempStorage();
    const vector = [0.1, 0.2, 0.3];

    await storage.writeEmbedding({
      id: "test-note",
      ...embeddingMetadata(vector),
      embedding: vector,
      updatedAt: new Date().toISOString(),
    });

    const retrieved = await storage.readEmbedding("test-note");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.provider).toBe("ollama");
    expect(retrieved?.dimensions).toBe(3);
    expect(retrieved?.metric).toBe("cosine");
    expect(retrieved?.compatibilityKey).toContain("provider=ollama");
  });

  it("deletes both note and embedding on deleteNote", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "test-note",
      model: "test-model",
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    const deleted = await storage.deleteNote("test-note");
    expect(deleted).toBe(true);

    // Both note and embedding should be gone
    const retrievedNote = await storage.readNote("test-note");
    expect(retrievedNote).toBeNull();

    const retrievedEmbedding = await storage.readEmbedding("test-note");
    expect(retrievedEmbedding).toBeNull();
  });

  it("deleteNote returns false for non-existent note", async () => {
    const storage = await createTempStorage();

    const deleted = await storage.deleteNote("non-existent");
    expect(deleted).toBe(false);
  });

  it("deleteNote succeeds even without embedding", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    // No embedding written

    const deleted = await storage.deleteNote("test-note");
    expect(deleted).toBe(true);

    const retrieved = await storage.readNote("test-note");
    expect(retrieved).toBeNull();
  });

  it("lists embeddings separately from notes", async () => {
    const storage = await createTempStorage();

    // Create note with embedding
    const note1 = createTestNote("note-1", "Title 1", "Content 1");
    await storage.writeNote(note1);
    await storage.writeEmbedding({
      id: "note-1",
      model: "test-model",
      embedding: [0.1, 0.2],
      updatedAt: new Date().toISOString(),
    });

    // Create note without embedding
    const note2 = createTestNote("note-2", "Title 2", "Content 2");
    await storage.writeNote(note2);

    const embeddings = await storage.listEmbeddings();
    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]?.id).toBe("note-1");

    const notes = await storage.listNotes();
    expect(notes).toHaveLength(2);
  });

  it("allows updating embedding independently of note", async () => {
    const storage = await createTempStorage();
    const note = createTestNote("test-note", "Test Title", "Test content");

    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "test-note",
      model: "model-v1",
      embedding: [0.1, 0.2],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    // Update embedding with new model
    await storage.writeEmbedding({
      id: "test-note",
      model: "model-v2",
      embedding: [0.3, 0.4],
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const retrieved = await storage.readEmbedding("test-note");
    expect(retrieved?.model).toBe("model-v2");
    expect(retrieved?.embedding).toEqual([0.3, 0.4]);
  });
});

describe("embedding provider configuration", () => {
  it("defaults to Ollama with the existing model", () => {
    const config = resolveEmbeddingProviderConfig({});

    expect(config.kind).toBe("ollama");
    expect(config.baseUrl).toBe("http://localhost:11434");
    expect(config.model).toBe("nomic-embed-text-v2-moe");
  });

  it("resolves OpenAI-compatible configuration from neutral environment variables", () => {
    const config = resolveEmbeddingProviderConfig({
      EMBED_PROVIDER: "openai-compatible",
      EMBED_BASE_URL: "http://127.0.0.1:4000",
      EMBED_API_KEY: "secret-key",
      EMBED_MODEL: "local-embedding-model",
      EMBED_DIMENSIONS: "768",
    });

    expect(config.kind).toBe("openai-compatible");
    expect(config.baseUrl).toBe("http://127.0.0.1:4000");
    expect(config.model).toBe("local-embedding-model");
    expect(config.dimensions).toBe(768);
  });

  it("requires a model for OpenAI-compatible providers", () => {
    expect(() => resolveEmbeddingProviderConfig({ EMBED_PROVIDER: "openai-compatible" })).toThrow(
      /EMBED_MODEL is required/,
    );
  });

  it("defaults the native OpenAI and Gemini models", () => {
    const openai = resolveEmbeddingProviderConfig({ EMBED_PROVIDER: "openai", OPENAI_API_KEY: "secret" });
    const gemini = resolveEmbeddingProviderConfig({ EMBED_PROVIDER: "gemini", GEMINI_API_KEY: "secret" });

    expect(openai.model).toBe("text-embedding-3-small");
    expect(gemini.model).toBe("gemini-embedding-2");
  });
});

describe("OpenAI-compatible embedding provider", () => {
  it("posts OpenAI-compatible request shape with optional bearer auth", async () => {
    const server = await startOpenAICompatibleServer({
      expectedAuth: "secret-key",
      expectedModel: "local-model",
      expectedDimensions: 3,
      embedding: [0.3, 0.2, 0.1],
    });
    const config = resolveEmbeddingProviderConfig({
      EMBED_PROVIDER: "openai-compatible",
      EMBED_BASE_URL: server.url,
      EMBED_API_KEY: "secret-key",
      EMBED_MODEL: "local-model",
      EMBED_DIMENSIONS: "3",
    });

    const result = await createEmbeddingProvider(config).embed("hello");

    expect(result.embedding).toEqual([0.3, 0.2, 0.1]);
    expect(result.identity.provider).toBe("openai-compatible");
  });

  it("uses native OpenAI defaults on the same transport", async () => {
    const server = await startOpenAICompatibleServer({
      expectedAuth: "openai-secret",
      expectedModel: "text-embedding-3-small",
    });
    const config = resolveEmbeddingProviderConfig({
      EMBED_PROVIDER: "openai",
      OPENAI_BASE_URL: server.url,
      OPENAI_API_KEY: "openai-secret",
    });

    const result = await createEmbeddingProvider(config).embed("hello");

    expect(result.embedding).toEqual([0.2, 0.4, 0.6]);
    expect(result.identity.provider).toBe("openai");
  });

  it("does not include API keys in provider error messages", async () => {
    const server = await startOpenAICompatibleServer({ expectedAuth: "expected-key", expectedModel: "local-model" });
    const config = resolveEmbeddingProviderConfig({
      EMBED_PROVIDER: "openai-compatible",
      EMBED_BASE_URL: server.url,
      EMBED_API_KEY: "wrong-secret-key",
      EMBED_MODEL: "local-model",
    });

    await expect(createEmbeddingProvider(config).embed("hello")).rejects.not.toThrow(/wrong-secret-key/);
  });
});

describe("Gemini embedding provider", () => {
  it("posts Gemini embedContent request shape with API key header", async () => {
    const server = await startGeminiServer({
      expectedApiKey: "gemini-secret",
      expectedModel: "gemini-embedding-2",
      expectedDimensions: 768,
      embedding: [0.9, 0.8, 0.7],
    });
    const config = resolveEmbeddingProviderConfig({
      EMBED_PROVIDER: "gemini",
      GEMINI_BASE_URL: server.url,
      GEMINI_API_KEY: "gemini-secret",
      EMBED_DIMENSIONS: "768",
    });

    const result = await createEmbeddingProvider(config).embed("hello");

    expect(result.embedding).toEqual([0.9, 0.8, 0.7]);
    expect(result.identity.provider).toBe("gemini");
  });

  it("does not include Gemini API keys in provider error messages", async () => {
    const server = await startGeminiServer({ expectedApiKey: "expected-key", expectedModel: "gemini-embedding-2" });
    const config = resolveEmbeddingProviderConfig({
      EMBED_PROVIDER: "gemini",
      GEMINI_BASE_URL: server.url,
      GEMINI_API_KEY: "wrong-gemini-secret",
    });

    await expect(createEmbeddingProvider(config).embed("hello")).rejects.not.toThrow(/wrong-gemini-secret/);
  });
});

describe("embedding compatibility", () => {
  it("treats legacy Ollama records with the current model as compatible", () => {
    const compatibility = checkEmbeddingCompatibility({
      id: "legacy-note",
      model: currentEmbeddingIdentity.model,
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    expect(compatibility.status).toBe("compatible");
  });

  it("skips records from incompatible vector spaces", () => {
    const vector = [0.1, 0.2, 0.3];
    const record = {
      id: "other-note",
      ...embeddingMetadata(vector),
      provider: "openai",
      compatibilityKey: "provider=openai|model=text-embedding-3-small|dimensions=3|metric=cosine|inputMode=default",
      embedding: vector,
      updatedAt: new Date().toISOString(),
    };

    expect(checkEmbeddingCompatibility(record).status).toBe("skipped");
  });

  it("does not silently compare mismatched vector lengths", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/dimensions must match/i);
    expect(safeCosineSimilarity([1, 0], [1, 0, 0])).toBeUndefined();
  });

  it("rejects empty provider vectors before they can be written", async () => {
    const server = await startOpenAICompatibleServer({
      expectedModel: "local-model",
      embedding: [],
    });
    const config = resolveEmbeddingProviderConfig({
      EMBED_PROVIDER: "openai-compatible",
      EMBED_BASE_URL: server.url,
      EMBED_MODEL: "local-model",
    });

    await expect(createEmbeddingProvider(config).embed("hello")).rejects.toThrow(/unexpected shape/i);
  });
});

describe("Embedding consistency scenarios", () => {
  it("maintains consistency through note update cycles", async () => {
    const storage = await createTempStorage();

    // Create initial note with embedding
    const note = createTestNote("evolving-note", "Version 1", "Initial content");
    await storage.writeNote(note);
    await storage.writeEmbedding({
      id: "evolving-note",
      model: "test-model",
      embedding: [0.1, 0.2, 0.3],
      updatedAt: new Date().toISOString(),
    });

    // Update note (simulating update command)
    const updatedNote: Note = {
      ...note,
      title: "Version 2",
      content: "Updated content",
      updatedAt: new Date().toISOString(),
    };
    await storage.writeNote(updatedNote);

    // Note should be updated
    const retrievedNote = await storage.readNote("evolving-note");
    expect(retrievedNote?.title).toBe("Version 2");
    expect(retrievedNote?.content).toBe("Updated content");

    // Embedding should still exist (update command would regenerate it)
    const retrievedEmbedding = await storage.readEmbedding("evolving-note");
    expect(retrievedEmbedding).not.toBeNull();
    expect(retrievedEmbedding?.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("handles concurrent vault operations", async () => {
    const dir1 = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-vault1-"));
    const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-vault2-"));
    tempDirs.push(dir1, dir2);

    const sourceStorage = new Storage(dir1);
    const targetStorage = new Storage(dir2);
    await sourceStorage.init();
    await targetStorage.init();

    // Create note in source vault
    const note = createTestNote("moved-note", "Moved Note", "Content to move");
    await sourceStorage.writeNote(note);
    await sourceStorage.writeEmbedding({
      id: "moved-note",
      model: "test-model",
      embedding: [0.5, 0.6, 0.7],
      updatedAt: new Date().toISOString(),
    });

    // Move to target vault (simulating move_memory)
    const embedding = await sourceStorage.readEmbedding("moved-note");
    await targetStorage.writeNote(note);
    if (embedding) {
      await targetStorage.writeEmbedding(embedding);
    }
    await sourceStorage.deleteNote("moved-note");

    // Verify target has both
    const targetNote = await targetStorage.readNote("moved-note");
    const targetEmbedding = await targetStorage.readEmbedding("moved-note");
    expect(targetNote).not.toBeNull();
    expect(targetEmbedding).not.toBeNull();
    expect(targetEmbedding?.embedding).toEqual([0.5, 0.6, 0.7]);

    // Verify source is clean
    const sourceNote = await sourceStorage.readNote("moved-note");
    const sourceEmbedding = await sourceStorage.readEmbedding("moved-note");
    expect(sourceNote).toBeNull();
    expect(sourceEmbedding).toBeNull();
  });
});
