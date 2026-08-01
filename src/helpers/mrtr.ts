import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  inputResponse,
  type CallToolResult,
  type InputRequiredResult,
  type ServerContext as SdkServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ProtectedBranchBlocked } from "./git-commit.js";
import { WRITE_SCOPES } from "../project-memory-policy.js";

/**
 * Elicitation keys shared between an `inputRequired` request and the matching
 * response entry in `ctx.mcpReq.inputResponses` on retry.
 */
export const ELICITATION_KEYS = {
  protectedBranch: "protectedBranch",
  writeScope: "writeScope",
  vault: "vault",
} as const;
export type ElicitationKey = (typeof ELICITATION_KEYS)[keyof typeof ELICITATION_KEYS];

/** Single source of truth for the protected-branch consent elicitation. */
export const protectedBranchConsentSchema = z.object({
  allowProtectedBranch: z.boolean().describe("Allow this one-time commit on the protected branch"),
});
export type ProtectedBranchConsent = z.infer<typeof protectedBranchConsentSchema>;

/** Single source of truth for the write-scope selection elicitation. */
export const writeScopeChoiceSchema = z.object({
  scope: z.enum(WRITE_SCOPES).describe("Where to store this memory"),
});
export type WriteScopeChoice = z.infer<typeof writeScopeChoiceSchema>;

/** Single source of truth for the vault selection elicitation. */
export const vaultChoiceSchema = z.object({
  vault: z.string().min(1).describe("Which vault to write to"),
});
export type VaultChoice = z.infer<typeof vaultChoiceSchema>;

/** A candidate vault the user can pick when multiple writable vaults exist. */
export interface VaultChoiceOption {
  /** Stable key echoed by the client on retry (e.g. `"project"`, `"attached:slug"`). */
  readonly key: string;
  /** Human-readable label shown in the client UI and the elicitation message. */
  readonly label: string;
}

/**
 * Result of reading one elicitation response from a retried request:
 * `accepted` carries the validated content, `declined` covers both explicit
 * decline and cancel. `undefined` means the request carried no response for
 * the key (the initial round, or a client that ignored the request).
 */
export type ElicitationOutcome<T> =
  { readonly kind: "accepted"; readonly value: T } | { readonly kind: "declined" };

/**
 * Whether the current request can be answered with `inputRequired(...)`.
 *
 * Mirrors the .NET SDK's `McpServer.IsMrtrSupported`: modern (2026-07-28)
 * clients carry their capabilities in the required per-request envelope, and
 * `input_required` is native to that era — provided the client also declares
 * the `elicitation` capability the embedded requests need (the SDK rejects
 * `elicitation/create` with `-32021` otherwise). Legacy clients never carry
 * an envelope; returning `inputRequired` would hand them to the SDK's legacy
 * shim, which needs the client to have declared the `elicitation` capability
 * and otherwise fails with a generic message. Those clients keep the existing
 * error-text flow instead.
 */
export function isMrtrSupported(requestCtx: SdkServerContext): boolean {
  // The SDK requires `io.modelcontextprotocol/clientCapabilities` in the
  // `_meta` envelope of every modern (2026-07-28) request
  // (REQUIRED_ENVELOPE_KEYS); legacy requests never carry an envelope. The
  // SDK's public `RequestMetaEnvelope` type is empty (`{}`), so the reserved
  // key is read through an index signature; the value is validated by the
  // SDK's own envelope schema before it reaches handlers.
  const envelope = requestCtx.mcpReq.envelope as Readonly<Record<string, unknown>> | undefined;
  return declaresFormElicitation(envelope?.[CLIENT_CAPABILITIES_META_KEY]);
}

/**
 * Whether the client's declared capabilities cover form-mode elicitation,
 * mirroring the SDK's `missingClientCapabilities` lenient reading: a bare
 * `elicitation: {}` declaration (the pre-mode 2025 meaning) counts as form
 * support, as does an explicit `elicitation: { form: {} }`.
 */
function declaresFormElicitation(clientCapabilities: unknown): boolean {
  if (typeof clientCapabilities !== "object" || clientCapabilities === null) {
    return false;
  }
  const elicitation = (clientCapabilities as { elicitation?: unknown }).elicitation;
  if (typeof elicitation !== "object" || elicitation === null) {
    return false;
  }
  const entry = elicitation as Record<string, unknown>;
  return entry["form"] !== undefined || Object.keys(entry).length === 0;
}

/**
 * Reads one elicitation response from a retried request, validating the
 * accepted content against `schema` (any Standard Schema, e.g. a zod object).
 * The content arrives from the client untrusted, so invalid content is
 * treated as a decline rather than trusted.
 */
export function readElicitation<S extends z.ZodType>(
  requestCtx: SdkServerContext,
  key: ElicitationKey,
  schema: S,
): ElicitationOutcome<z.infer<S>> | undefined {
  const view = inputResponse(requestCtx.mcpReq.inputResponses, key);
  if (view.kind !== "elicit") {
    return undefined;
  }
  if (view.action !== "accept") {
    return { kind: "declined" };
  }
  const parsed = schema.safeParse(view.content);
  if (!parsed.success) {
    console.error(
      `[mrtr] Ignoring invalid elicitation content for '${key}': ${JSON.stringify(parsed.error.issues)}`,
    );
    return { kind: "declined" };
  }
  return { kind: "accepted", value: parsed.data };
}

export function readProtectedBranchConsent(
  requestCtx: SdkServerContext,
): ElicitationOutcome<ProtectedBranchConsent> | undefined {
  return readElicitation(
    requestCtx,
    ELICITATION_KEYS.protectedBranch,
    protectedBranchConsentSchema,
  );
}

/**
 * Effective protected-branch consent for the current round: `"granted"` when
 * the user accepted with `allowProtectedBranch: true`, `"denied"` when the
 * user declined, cancelled, or submitted the form with the consent unchecked
 * (an accepted form carrying `allowProtectedBranch: false` is an explicit
 * denial, not a grant), and `undefined` when the request carried no consent
 * response (the initial round).
 */
export type ProtectedBranchConsentState = "granted" | "denied";

export function readProtectedBranchConsentState(
  requestCtx: SdkServerContext,
): ProtectedBranchConsentState | undefined {
  const consent = readProtectedBranchConsent(requestCtx);
  if (consent === undefined) {
    return undefined;
  }
  if (consent.kind === "declined") {
    return "denied";
  }
  return consent.value.allowProtectedBranch === true ? "granted" : "denied";
}

export function readWriteScopeChoice(
  requestCtx: SdkServerContext,
): ElicitationOutcome<WriteScopeChoice> | undefined {
  return readElicitation(requestCtx, ELICITATION_KEYS.writeScope, writeScopeChoiceSchema);
}

export function readVaultChoice(
  requestCtx: SdkServerContext,
): ElicitationOutcome<VaultChoice> | undefined {
  return readElicitation(requestCtx, ELICITATION_KEYS.vault, vaultChoiceSchema);
}

function legacyErrorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Builds the result for a blocked protected-branch commit: a native
 * elicitation on MRTR-capable clients, the existing error text everywhere
 * else (including the response to an explicit user decline, which callers
 * handle before calling this).
 */
export function protectedBranchDecision(
  requestCtx: SdkServerContext,
  blocked: ProtectedBranchBlocked,
): CallToolResult | InputRequiredResult {
  if (!isMrtrSupported(requestCtx)) {
    return legacyErrorResult(blocked.message);
  }
  return inputRequired({
    inputRequests: {
      [ELICITATION_KEYS.protectedBranch]: inputRequired.elicit({
        message: formatProtectedBranchElicitMessage(blocked),
        requestedSchema: protectedBranchConsentSchema,
      }),
    },
  });
}

function formatProtectedBranchElicitMessage(blocked: ProtectedBranchBlocked): string {
  const { projectLabel, branch, patterns, behavior } = blocked;
  const patternsLabel = patterns.length > 0 ? patterns.join(", ") : "the configured patterns";
  const header =
    behavior === "block"
      ? `Auto-commit blocked for ${projectLabel}: current branch \`${branch}\` matches protected patterns ${patternsLabel}.`
      : `Protected branch check for ${projectLabel}: current branch \`${branch}\` matches ${patternsLabel}.`;
  return `${header} Allow this one-time commit?`;
}

/**
 * Builds the result for an unresolved write scope: a structured project vs
 * global choice on MRTR-capable clients, the existing guidance error text
 * everywhere else.
 */
export function scopeSelectionDecision(
  requestCtx: SdkServerContext,
  message: string,
): CallToolResult | InputRequiredResult {
  if (!isMrtrSupported(requestCtx)) {
    return legacyErrorResult(message);
  }
  return inputRequired({
    inputRequests: {
      [ELICITATION_KEYS.writeScope]: inputRequired.elicit({
        message,
        requestedSchema: writeScopeChoiceSchema,
      }),
    },
  });
}

/**
 * Builds the result for an ambiguous write target: an enum picker over the
 * candidate vaults on MRTR-capable clients. Callers only invoke this when
 * multiple writable candidates exist; the legacy fallback (a plain error) is
 * a defensive measure because the caller should already have resolved the
 * default before deciding to elicit.
 */
export function vaultSelectionDecision(
  requestCtx: SdkServerContext,
  options: readonly VaultChoiceOption[],
  message = "Which vault should this memory be written to?",
): CallToolResult | InputRequiredResult {
  if (!isMrtrSupported(requestCtx)) {
    const optionsLabel = options.map((option) => `- ${option.key}: ${option.label}`).join("\n");
    return legacyErrorResult(`${message}\nAvailable vaults:\n${optionsLabel}`);
  }

  const keys = options.map((option) => option.key);
  const [first, ...rest] = keys;
  if (!first) {
    throw new Error("vaultSelectionDecision requires at least one candidate vault");
  }
  const requestedSchema = z.object({
    vault: z.enum([first, ...rest]).describe("Which vault to write to"),
  });

  const optionsLabel = options.map((option) => `\`${option.key}\` — ${option.label}`).join("; ");
  return inputRequired({
    inputRequests: {
      [ELICITATION_KEYS.vault]: inputRequired.elicit({
        message: `${message} Options: ${optionsLabel}`,
        requestedSchema,
      }),
    },
  });
}
