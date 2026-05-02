import type { EmbeddingModelId } from "./brands.js";
import { embeddingModelId } from "./brands.js";

function validateOllamaUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`OLLAMA_URL is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`OLLAMA_URL must use http: or https: scheme, got ${parsed.protocol}`);
  }
  const host = parsed.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isPrivate =
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host);
  if (!isLocalhost && !isPrivate) {
    throw new Error(
      `OLLAMA_URL must resolve to a localhost or private-network address, got ${host}`
    );
  }
  return url;
}

const OLLAMA_URL = validateOllamaUrl(process.env["OLLAMA_URL"] ?? "http://localhost:11434");
const EMBED_MODEL = process.env["EMBED_MODEL"] ?? "nomic-embed-text-v2-moe";

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, truncate: true }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama embedding failed: ${res.status} ${res.statusText}. ` +
      `Is Ollama running at ${OLLAMA_URL} with model '${EMBED_MODEL}' pulled?`
    );
  }

  const data = (await res.json()) as { embeddings?: number[][] };
  const embedding = data.embeddings?.[0];
  if (!embedding) {
    throw new Error(`Ollama embedding response did not include an embedding for model '${EMBED_MODEL}'`);
  }

  return embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const embedModel: EmbeddingModelId = embeddingModelId(EMBED_MODEL);
