import { describe, expect, it, vi } from "vitest";
import type { ServerContext as SdkServerContext } from "@modelcontextprotocol/server";
import type { ServerContext } from "../src/server-context.js";
import type { Vault } from "../src/vault.js";
import { resolveWriteVaultForRemember } from "../src/tools/remember.js";
import type { ProjectInfo } from "../src/project.js";
import { projectId } from "../src/brands.js";
import { ELICITATION_KEYS } from "../src/helpers/mrtr.js";

const CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";

const mainVault = { provenance: "main", writable: true } as unknown as Vault;
const projectVault = {
  provenance: "project-local",
  vaultFolderName: ".mnemonic",
  writable: true,
} as unknown as Vault;
const attachedWritable = {
  provenance: "project-attached",
  writable: true,
  attachmentRef: { projectSlug: "team", projectName: "Team" },
} as unknown as Vault;
const attachedReadOnly = {
  provenance: "project-attached",
  writable: false,
  attachmentRef: { projectSlug: "ro", projectName: "Read Only" },
} as unknown as Vault;

const project: ProjectInfo = {
  id: projectId("project-id"),
  name: "Project",
  source: "folder",
};

function fakeCtx(options: { projectVault: Vault | null; attachments: Vault[] }): ServerContext {
  return {
    vaultManager: {
      main: mainVault,
      getOrCreateProjectVault: vi.fn().mockResolvedValue(options.projectVault),
      getAttachmentsForProject: vi.fn().mockReturnValue(options.attachments),
    },
    configStore: {
      getProjectAttachments: vi.fn().mockResolvedValue([]),
    },
  } as unknown as ServerContext;
}

function modernRequestCtx(inputResponses?: Record<string, unknown>): SdkServerContext {
  return {
    mcpReq: {
      id: 1,
      method: "tools/call",
      inputResponses,
      envelope: { [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { form: {} } } },
      requestState: () => undefined,
      signal: new AbortController().signal,
    },
  } as unknown as SdkServerContext;
}

function legacyRequestCtx(): SdkServerContext {
  return {
    mcpReq: {
      id: 1,
      method: "tools/call",
      inputResponses: undefined,
      envelope: undefined,
      requestState: () => undefined,
      signal: new AbortController().signal,
    },
  } as unknown as SdkServerContext;
}

describe("resolveWriteVaultForRemember", () => {
  it("writes to the main vault for global scope", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault, attachments: [] }),
      "/repo",
      "global",
      project,
      modernRequestCtx(),
    );
    expect(result).toEqual({ kind: "vault", vault: mainVault });
  });

  it("falls back to the main vault for project scope without a resolvable project vault", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault: null, attachments: [] }),
      "/repo",
      "project",
      project,
      modernRequestCtx(),
    );
    expect(result).toEqual({ kind: "vault", vault: mainVault });
  });

  it("picks the project vault directly when it is the only write candidate", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault, attachments: [] }),
      "/repo",
      "project",
      project,
      modernRequestCtx(),
    );
    expect(result).toEqual({ kind: "vault", vault: projectVault });
  });

  it("elicits a vault choice on a modern client when writable attached vaults exist, excluding read-only attachments", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault, attachments: [attachedWritable, attachedReadOnly] }),
      "/repo",
      "project",
      project,
      modernRequestCtx(),
    );
    expect(result.kind).toBe("decision");

    const input = (result as { result: { inputRequests: Record<string, unknown> } }).result
      .inputRequests[ELICITATION_KEYS.vault] as {
      params: { requestedSchema: { properties: Record<string, unknown> } };
    };
    expect(input.params.requestedSchema.properties["vault"]).toMatchObject({
      type: "string",
      enum: ["project", "attached:team"],
    });
  });

  it("writes to the chosen writable attached vault on retry", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault, attachments: [attachedWritable] }),
      "/repo",
      "project",
      project,
      modernRequestCtx({
        [ELICITATION_KEYS.vault]: { action: "accept", content: { vault: "attached:team" } },
      }),
    );
    expect(result).toEqual({ kind: "vault", vault: attachedWritable });
  });

  it("re-elicits when the retry names a vault outside the candidate list instead of writing to an unoffered vault", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault, attachments: [attachedWritable] }),
      "/repo",
      "project",
      project,
      modernRequestCtx({
        [ELICITATION_KEYS.vault]: { action: "accept", content: { vault: "attached:forged" } },
      }),
    );
    expect(result.kind).toBe("decision");
  });

  it("falls back to the project vault when the user declines the vault picker", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault, attachments: [attachedWritable] }),
      "/repo",
      "project",
      project,
      modernRequestCtx({
        [ELICITATION_KEYS.vault]: { action: "decline" },
      }),
    );
    expect(result).toEqual({ kind: "vault", vault: projectVault });
  });

  it("never elicits on a legacy client and picks the project vault", async () => {
    const result = await resolveWriteVaultForRemember(
      fakeCtx({ projectVault, attachments: [attachedWritable, attachedReadOnly] }),
      "/repo",
      "project",
      project,
      legacyRequestCtx(),
    );
    expect(result).toEqual({ kind: "vault", vault: projectVault });
  });
});
