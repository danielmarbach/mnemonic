import type {
  EmbeddingCompatibilityKey,
  EmbeddingDimensions,
  EmbeddingMetric,
  EmbeddingModelId,
  EmbeddingProviderId,
} from "./brands.js";
import {
  embeddingCompatibilityKey,
  embeddingDimensions,
  embeddingMetric,
  embeddingModelId,
  embeddingProviderId,
} from "./brands.js";
import {
  EmbeddingConfigurationError,
  EmbeddingDimensionMismatchError,
  EmbeddingProviderError,
  OllamaUrlError,
} from "./domain-errors.js";
import type { EmbeddingRecord } from "./storage.js";
import { z } from "zod";

export const EMBEDDING_PROVIDER_IDS = ["ollama", "openai-compatible", "openai", "gemini"] as const;
export type EmbeddingProviderKind = (typeof EMBEDDING_PROVIDER_IDS)[number];
export const EMBEDDING_METRICS = ["cosine"] as const;
export type EmbeddingMetricValue = (typeof EMBEDDING_METRICS)[number];

export interface EmbeddingIdentity {
  readonly provider: EmbeddingProviderId;
  readonly model: EmbeddingModelId;
  readonly dimensions?: EmbeddingDimensions;
  readonly metric: EmbeddingMetric;
  readonly inputMode?: string;
  readonly compatibilityKey: EmbeddingCompatibilityKey;
}

export interface EmbeddingResult {
  readonly embedding: number[];
  readonly identity: EmbeddingIdentity;
}

export interface EmbeddingProvider {
  readonly identity: EmbeddingIdentity;
  embed(text: string): Promise<EmbeddingResult>;
}

export type EmbeddingProviderConfig =
  | {
      readonly kind: "ollama";
      readonly baseUrl: string;
      readonly model: EmbeddingModelId;
      readonly metric: EmbeddingMetric;
    }
  | {
      readonly kind: "openai-compatible";
      readonly baseUrl: string;
      readonly apiKey?: string;
      readonly model: EmbeddingModelId;
      readonly dimensions?: EmbeddingDimensions;
      readonly metric: EmbeddingMetric;
    }
  | {
      readonly kind: "openai";
      readonly baseUrl: string;
      readonly apiKey: string;
      readonly model: EmbeddingModelId;
      readonly dimensions?: EmbeddingDimensions;
      readonly metric: EmbeddingMetric;
    }
  | {
      readonly kind: "gemini";
      readonly baseUrl: string;
      readonly apiKey: string;
      readonly model: EmbeddingModelId;
      readonly dimensions?: EmbeddingDimensions;
      readonly metric: EmbeddingMetric;
    };

export type EmbeddingCompatibility =
  | { readonly status: "compatible" }
  | {
      readonly status: "skipped";
      readonly reason: "provider-mismatch" | "dimension-mismatch" | "metric-mismatch";
    };

const DEFAULT_OLLAMA_MODEL = "nomic-embed-text-v2-moe";
const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_GEMINI_MODEL = "gemini-embedding-2";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const COSINE_METRIC = embeddingMetric("cosine");

const EmbeddingVectorSchema = z.array(z.number()).nonempty();
const OllamaEmbedResponseSchema = z.object({
  embeddings: z.array(EmbeddingVectorSchema).optional(),
});
const OpenAIEmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: EmbeddingVectorSchema })),
});
const GeminiEmbeddingResponseSchema = z.object({
  embedding: z.object({ values: EmbeddingVectorSchema }),
});

function validateOllamaUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OllamaUrlError("OLLAMA_URL is not a valid URL", url);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OllamaUrlError(
      "OLLAMA_URL must use http: or https: scheme",
      `got ${parsed.protocol}`,
    );
  }
  const host = parsed.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isPrivate =
    /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^192\.168\./.test(host);
  if (!isLocalhost && !isPrivate) {
    throw new OllamaUrlError(
      "OLLAMA_URL must resolve to a localhost or private-network address",
      `got ${host}`,
    );
  }
  return url;
}

function parseProviderKind(value: string | undefined): EmbeddingProviderKind {
  if (value === undefined || value === "") return "ollama";
  if ((EMBEDDING_PROVIDER_IDS as readonly string[]).includes(value))
    return value as EmbeddingProviderKind;
  throw new EmbeddingConfigurationError(`Unsupported EMBED_PROVIDER '${value}'`);
}

function parseDimensions(value: string | undefined): EmbeddingDimensions | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new EmbeddingConfigurationError("EMBED_DIMENSIONS must be a positive integer");
  }
  return embeddingDimensions(parsed);
}

function requireEnv(value: string | undefined, name: string, provider: string): string {
  if (value === undefined || value === "") {
    throw new EmbeddingConfigurationError(`${name} is required when EMBED_PROVIDER=${provider}`);
  }
  return value;
}

function buildCompatibilityKey(args: {
  provider: string;
  model: EmbeddingModelId;
  dimensions?: EmbeddingDimensions;
  metric: EmbeddingMetric;
  inputMode?: string;
}): EmbeddingCompatibilityKey {
  const parts = [
    `provider=${args.provider}`,
    `model=${args.model}`,
    `dimensions=${args.dimensions ?? "default"}`,
    `metric=${args.metric}`,
    `inputMode=${args.inputMode ?? "default"}`,
  ];
  return embeddingCompatibilityKey(parts.join("|"));
}

function createIdentity(config: EmbeddingProviderConfig): EmbeddingIdentity {
  const dimensions = "dimensions" in config ? config.dimensions : undefined;
  return {
    provider: embeddingProviderId(config.kind),
    model: config.model,
    dimensions,
    metric: config.metric,
    compatibilityKey: buildCompatibilityKey({
      provider: config.kind,
      model: config.model,
      dimensions,
      metric: config.metric,
    }),
  };
}

export function resolveEmbeddingProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProviderConfig {
  const kind = parseProviderKind(env["EMBED_PROVIDER"]);
  const dimensions = parseDimensions(env["EMBED_DIMENSIONS"]);

  switch (kind) {
    case "ollama":
      return {
        kind,
        baseUrl: validateOllamaUrl(env["OLLAMA_URL"] ?? DEFAULT_OLLAMA_BASE_URL),
        model: embeddingModelId(env["EMBED_MODEL"] ?? DEFAULT_OLLAMA_MODEL),
        metric: COSINE_METRIC,
      };
    case "openai-compatible":
      return {
        kind,
        baseUrl: env["EMBED_BASE_URL"] ?? env["OPENAI_BASE_URL"] ?? DEFAULT_OPENAI_BASE_URL,
        apiKey: env["EMBED_API_KEY"] ?? env["OPENAI_API_KEY"],
        model: embeddingModelId(requireEnv(env["EMBED_MODEL"], "EMBED_MODEL", kind)),
        dimensions,
        metric: COSINE_METRIC,
      };
    case "openai":
      return {
        kind,
        baseUrl: env["OPENAI_BASE_URL"] ?? DEFAULT_OPENAI_BASE_URL,
        apiKey: requireEnv(env["OPENAI_API_KEY"], "OPENAI_API_KEY", kind),
        model: embeddingModelId(env["EMBED_MODEL"] ?? DEFAULT_OPENAI_MODEL),
        dimensions,
        metric: COSINE_METRIC,
      };
    case "gemini":
      return {
        kind,
        baseUrl: env["GEMINI_BASE_URL"] ?? DEFAULT_GEMINI_BASE_URL,
        apiKey: requireEnv(env["GEMINI_API_KEY"], "GEMINI_API_KEY", kind),
        model: embeddingModelId(env["EMBED_MODEL"] ?? DEFAULT_GEMINI_MODEL),
        dimensions,
        metric: COSINE_METRIC,
      };
    default: {
      const exhaustive: never = kind;
      throw new EmbeddingConfigurationError(`Unhandled embedding provider: ${exhaustive}`);
    }
  }
}

class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly identity: EmbeddingIdentity;

  constructor(private readonly config: Extract<EmbeddingProviderConfig, { kind: "ollama" }>) {
    this.identity = createIdentity(config);
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const res = await fetch(`${this.config.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.config.model, input: text, truncate: true }),
    });

    if (!res.ok) {
      throw new EmbeddingProviderError(
        `Ollama embedding failed: ${res.status} ${res.statusText}. ` +
          `Is Ollama running at ${this.config.baseUrl} with model '${this.config.model}' pulled?`,
      );
    }

    const parseResult = OllamaEmbedResponseSchema.safeParse(await res.json());
    if (!parseResult.success) {
      throw new EmbeddingProviderError(
        `Ollama embedding response had unexpected shape: ${parseResult.error.message}`,
      );
    }
    const embedding = parseResult.data.embeddings?.[0];
    if (!embedding) {
      throw new EmbeddingProviderError(
        `Ollama embedding response did not include an embedding for model '${this.config.model}'`,
      );
    }

    return {
      embedding,
      identity: { ...this.identity, dimensions: embeddingDimensions(embedding.length) },
    };
  }
}

class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly identity: EmbeddingIdentity;

  constructor(
    private readonly config: Extract<
      EmbeddingProviderConfig,
      { kind: "openai-compatible" | "openai" }
    >,
  ) {
    this.identity = createIdentity(config);
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const endpoint = new URL("/v1/embeddings", this.config.baseUrl);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers["Authorization"] = "Bearer " + this.config.apiKey;
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      input: text,
      encoding_format: "float",
    };
    if (this.config.dimensions !== undefined) {
      body["dimensions"] = this.config.dimensions;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new EmbeddingProviderError(
        `${this.config.kind} embedding failed: ${res.status} ${res.statusText} at ${endpoint.host} with model '${this.config.model}'`,
      );
    }

    const parseResult = OpenAIEmbeddingResponseSchema.safeParse(await res.json());
    if (!parseResult.success) {
      throw new EmbeddingProviderError(
        `${this.config.kind} embedding response had unexpected shape: ${parseResult.error.message}`,
      );
    }
    const embedding = parseResult.data.data[0]?.embedding;
    if (!embedding) {
      throw new EmbeddingProviderError(
        `${this.config.kind} embedding response did not include an embedding for model '${this.config.model}'`,
      );
    }

    return {
      embedding,
      identity: { ...this.identity, dimensions: embeddingDimensions(embedding.length) },
    };
  }
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly identity: EmbeddingIdentity;

  constructor(private readonly config: Extract<EmbeddingProviderConfig, { kind: "gemini" }>) {
    this.identity = createIdentity(config);
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const modelPath = this.config.model.startsWith("models/")
      ? this.config.model
      : `models/${this.config.model}`;
    const endpoint = new URL(`/v1beta/${modelPath}:embedContent`, this.config.baseUrl);
    const body: Record<string, unknown> = {
      model: modelPath,
      content: { parts: [{ text }] },
    };
    if (this.config.dimensions !== undefined) {
      body["outputDimensionality"] = this.config.dimensions;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.config.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new EmbeddingProviderError(
        `gemini embedding failed: ${res.status} ${res.statusText} at ${endpoint.host} with model '${this.config.model}'`,
      );
    }

    const parseResult = GeminiEmbeddingResponseSchema.safeParse(await res.json());
    if (!parseResult.success) {
      throw new EmbeddingProviderError(
        `gemini embedding response had unexpected shape: ${parseResult.error.message}`,
      );
    }

    const embedding = parseResult.data.embedding.values;
    return {
      embedding,
      identity: { ...this.identity, dimensions: embeddingDimensions(embedding.length) },
    };
  }
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig = resolveEmbeddingProviderConfig(),
): EmbeddingProvider {
  switch (config.kind) {
    case "ollama":
      return new OllamaEmbeddingProvider(config);
    case "openai-compatible":
    case "openai":
      return new OpenAICompatibleEmbeddingProvider(config);
    case "gemini":
      return new GeminiEmbeddingProvider(config);
    default: {
      const exhaustive: never = config;
      throw new EmbeddingConfigurationError(
        `Unhandled embedding provider: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

const provider = createEmbeddingProvider();
export const currentEmbeddingIdentity: EmbeddingIdentity = provider.identity;

export async function embed(text: string): Promise<number[]> {
  return (await embedWithMetadata(text)).embedding;
}

export async function embedWithMetadata(text: string): Promise<EmbeddingResult> {
  return provider.embed(text);
}

export function embeddingMetadata(
  vector: number[],
  identity: EmbeddingIdentity = currentEmbeddingIdentity,
): Pick<
  EmbeddingRecord,
  "model" | "provider" | "dimensions" | "metric" | "inputMode" | "compatibilityKey"
> {
  const dimensions = embeddingDimensions(vector.length);
  return {
    model: identity.model,
    provider: identity.provider,
    dimensions,
    metric: identity.metric,
    inputMode: identity.inputMode,
    compatibilityKey: buildCompatibilityKey({
      provider: identity.provider,
      model: identity.model,
      dimensions,
      metric: identity.metric,
      inputMode: identity.inputMode,
    }),
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new EmbeddingDimensionMismatchError(a.length, b.length);
  }
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loop bound guarantees existence
    const av = a[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function checkEmbeddingCompatibility(
  record: Pick<
    EmbeddingRecord,
    "model" | "provider" | "dimensions" | "metric" | "compatibilityKey" | "embedding"
  >,
  identity: EmbeddingIdentity = currentEmbeddingIdentity,
  expectedDimensions?: number,
): EmbeddingCompatibility {
  if (
    record.compatibilityKey !== undefined &&
    identity.dimensions !== undefined &&
    record.compatibilityKey !== identity.compatibilityKey
  ) {
    return { status: "skipped", reason: "provider-mismatch" };
  }

  if (record.provider !== undefined) {
    if (record.provider !== identity.provider || record.model !== identity.model) {
      return { status: "skipped", reason: "provider-mismatch" };
    }
  } else if (
    identity.provider !== embeddingProviderId("ollama") ||
    record.model !== identity.model
  ) {
    return { status: "skipped", reason: "provider-mismatch" };
  }

  if (record.metric !== undefined && record.metric !== identity.metric) {
    return { status: "skipped", reason: "metric-mismatch" };
  }

  const actualDimensions = record.dimensions ?? embeddingDimensions(record.embedding.length);
  const targetDimensions =
    identity.dimensions ??
    (expectedDimensions !== undefined ? embeddingDimensions(expectedDimensions) : undefined);
  if (targetDimensions !== undefined && actualDimensions !== targetDimensions) {
    return { status: "skipped", reason: "dimension-mismatch" };
  }

  return { status: "compatible" };
}

export function safeCosineSimilarity(a: number[], b: number[]): number | undefined {
  if (a.length !== b.length) return undefined;
  return cosineSimilarity(a, b);
}

export const embedModel: EmbeddingModelId = currentEmbeddingIdentity.model;
