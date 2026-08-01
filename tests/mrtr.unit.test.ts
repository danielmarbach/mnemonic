import { describe, expect, it } from "vitest";
import type { ServerContext as SdkServerContext } from "@modelcontextprotocol/server";
import {
  ELICITATION_KEYS,
  isMrtrSupported,
  protectedBranchDecision,
  readProtectedBranchConsent,
  readProtectedBranchConsentState,
  readVaultChoice,
  readWriteScopeChoice,
  scopeSelectionDecision,
  vaultSelectionDecision,
} from "../src/helpers/mrtr.js";
import type { ProtectedBranchBlocked } from "../src/helpers/git-commit.js";

const CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";

function makeRequestCtx(options?: {
  inputResponses?: Record<string, unknown>;
  envelope?: Record<string, unknown>;
}): SdkServerContext {
  return {
    mcpReq: {
      id: 1,
      method: "tools/call",
      inputResponses: options?.inputResponses,
      envelope: options?.envelope,
      requestState: () => undefined,
      signal: new AbortController().signal,
    },
  } as unknown as SdkServerContext;
}

function makeBlockedCheck(overrides: Partial<ProtectedBranchBlocked> = {}): ProtectedBranchBlocked {
  return {
    blocked: true,
    message: "Auto-commit blocked for P (pid): current branch `main` matches protected patterns.",
    projectLabel: "P (pid)",
    branch: "main",
    patterns: ["main", "master", "release*"],
    behavior: "block",
    ...overrides,
  };
}

describe("isMrtrSupported", () => {
  it("returns false on a legacy request without an envelope", () => {
    const requestCtx = makeRequestCtx();
    expect(isMrtrSupported(requestCtx)).toBe(false);
  });

  it("returns false when the envelope lacks the client capabilities key", () => {
    const requestCtx = makeRequestCtx({
      envelope: { "io.modelcontextprotocol/logLevel": "debug" },
    });
    expect(isMrtrSupported(requestCtx)).toBe(false);
  });

  it("returns true on a modern request carrying client capabilities in the envelope", () => {
    const requestCtx = makeRequestCtx({
      envelope: { [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { form: {} } } },
    });
    expect(isMrtrSupported(requestCtx)).toBe(true);
  });

  it("returns false on a modern request whose capabilities lack form elicitation", () => {
    const requestCtx = makeRequestCtx({
      envelope: { [CLIENT_CAPABILITIES_META_KEY]: { roots: {} } },
    });
    expect(isMrtrSupported(requestCtx)).toBe(false);
  });
});

describe("readProtectedBranchConsent", () => {
  it("returns undefined when the request carried no input responses", () => {
    expect(readProtectedBranchConsent(makeRequestCtx())).toBeUndefined();
  });

  it("returns undefined when the response for the key is missing", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: { other: { action: "accept", content: { x: 1 } } },
    });
    expect(readProtectedBranchConsent(requestCtx)).toBeUndefined();
  });

  it("returns accepted with the consent when the user allows", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: {
        [ELICITATION_KEYS.protectedBranch]: {
          action: "accept",
          content: { allowProtectedBranch: true },
        },
      },
    });
    expect(readProtectedBranchConsent(requestCtx)).toEqual({
      kind: "accepted",
      value: { allowProtectedBranch: true },
    });
  });

  it("returns declined when the user declines or cancels", () => {
    for (const action of ["decline", "cancel"]) {
      const requestCtx = makeRequestCtx({
        inputResponses: {
          [ELICITATION_KEYS.protectedBranch]: { action },
        },
      });
      expect(readProtectedBranchConsent(requestCtx)).toEqual({ kind: "declined" });
    }
  });

  it("returns declined when accepted content fails schema validation", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: {
        [ELICITATION_KEYS.protectedBranch]: {
          action: "accept",
          content: { allowProtectedBranch: "yes" },
        },
      },
    });
    expect(readProtectedBranchConsent(requestCtx)).toEqual({ kind: "declined" });
  });
});

describe("readProtectedBranchConsentState", () => {
  it("returns granted when the user accepts with allowProtectedBranch: true", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: {
        [ELICITATION_KEYS.protectedBranch]: {
          action: "accept",
          content: { allowProtectedBranch: true },
        },
      },
    });
    expect(readProtectedBranchConsentState(requestCtx)).toBe("granted");
  });

  it("returns denied when the user submits the form with the consent unchecked", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: {
        [ELICITATION_KEYS.protectedBranch]: {
          action: "accept",
          content: { allowProtectedBranch: false },
        },
      },
    });
    expect(readProtectedBranchConsentState(requestCtx)).toBe("denied");
  });

  it("returns denied on explicit decline or cancel", () => {
    for (const action of ["decline", "cancel"]) {
      const requestCtx = makeRequestCtx({
        inputResponses: {
          [ELICITATION_KEYS.protectedBranch]: { action },
        },
      });
      expect(readProtectedBranchConsentState(requestCtx)).toBe("denied");
    }
  });

  it("returns undefined when the request carried no consent response", () => {
    expect(readProtectedBranchConsentState(makeRequestCtx())).toBeUndefined();
  });
});

describe("readWriteScopeChoice", () => {
  it("returns accepted with a valid scope", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: {
        [ELICITATION_KEYS.writeScope]: { action: "accept", content: { scope: "project" } },
      },
    });
    expect(readWriteScopeChoice(requestCtx)).toEqual({
      kind: "accepted",
      value: { scope: "project" },
    });
  });

  it("returns declined for an out-of-enum scope", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: {
        [ELICITATION_KEYS.writeScope]: { action: "accept", content: { scope: "elsewhere" } },
      },
    });
    expect(readWriteScopeChoice(requestCtx)).toEqual({ kind: "declined" });
  });
});

describe("readVaultChoice", () => {
  it("returns accepted with the chosen vault key", () => {
    const requestCtx = makeRequestCtx({
      inputResponses: {
        [ELICITATION_KEYS.vault]: { action: "accept", content: { vault: "attached:team" } },
      },
    });
    expect(readVaultChoice(requestCtx)).toEqual({
      kind: "accepted",
      value: { vault: "attached:team" },
    });
  });
});

describe("protectedBranchDecision", () => {
  const blocked = makeBlockedCheck();

  it("falls back to the error text on a legacy request", () => {
    const result = protectedBranchDecision(makeRequestCtx(), blocked);
    expect(result).toEqual({
      content: [{ type: "text", text: blocked.message }],
      isError: true,
    });
  });

  it("returns an input_required elicitation on a modern request", () => {
    const result = protectedBranchDecision(
      makeRequestCtx({
        envelope: { [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { form: {} } } },
      }),
      blocked,
    );
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("resultType", "input_required");

    const input = (result as { inputRequests: Record<string, unknown> }).inputRequests;
    const request = input[ELICITATION_KEYS.protectedBranch] as {
      method: string;
      params: { message: string; requestedSchema: { properties: Record<string, unknown> } };
    };
    expect(request.method).toBe("elicitation/create");
    expect(request.params.message).toContain("main");
    expect(request.params.message).toContain("Allow this one-time commit?");
    expect(request.params.requestedSchema.properties["allowProtectedBranch"]).toMatchObject({
      type: "boolean",
    });
  });
});

describe("scopeSelectionDecision", () => {
  it("falls back to the guidance error text on a legacy request", () => {
    const message = "Project memory policy for P is set to always ask.";
    const result = scopeSelectionDecision(makeRequestCtx(), message);
    expect(result).toEqual({ content: [{ type: "text", text: message }], isError: true });
  });

  it("returns an input_required elicitation with a scope enum on a modern request", () => {
    const result = scopeSelectionDecision(
      makeRequestCtx({
        envelope: { [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { form: {} } } },
      }),
      "Where should this memory be stored?",
    );
    const request = (result as { inputRequests: Record<string, unknown> }).inputRequests[
      ELICITATION_KEYS.writeScope
    ] as { params: { requestedSchema: { properties: Record<string, unknown> } } };
    expect(request.params.requestedSchema.properties["scope"]).toMatchObject({
      type: "string",
      enum: ["project", "global"],
    });
  });
});

describe("vaultSelectionDecision", () => {
  const options = [
    { key: "project", label: "P project vault" },
    { key: "attached:team", label: "Team (team)" },
  ];

  it("falls back to an error listing the options on a legacy request", () => {
    const result = vaultSelectionDecision(makeRequestCtx(), options);
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("attached:team") }],
    });
  });

  it("returns an input_required elicitation with a vault enum on a modern request", () => {
    const result = vaultSelectionDecision(
      makeRequestCtx({
        envelope: { [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { form: {} } } },
      }),
      options,
    );
    const request = (result as { inputRequests: Record<string, unknown> }).inputRequests[
      ELICITATION_KEYS.vault
    ] as { params: { requestedSchema: { properties: Record<string, unknown> } } };
    expect(request.params.requestedSchema.properties["vault"]).toMatchObject({
      type: "string",
      enum: ["project", "attached:team"],
    });
  });

  it("throws when no candidate vaults are given", () => {
    expect(() =>
      vaultSelectionDecision(
        makeRequestCtx({
          envelope: { [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { form: {} } } },
        }),
        [],
      ),
    ).toThrow(/at least one candidate vault/);
  });
});
