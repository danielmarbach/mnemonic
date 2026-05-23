import { describe, expect, it } from "vitest";
import type { Vault } from "../src/vault.js";
import { storageLabel, vaultMatchesStorageScope, attachedVaultErrorMessage } from "../src/helpers/vault.js";
import { ProjectSummaryNotesSchema } from "../src/structured-content.js";

function makeVault(overrides: Partial<Vault> & { provenance: Vault["provenance"] }): Vault {
  return {
    storage: {} as Vault["storage"],
    git: {} as Vault["git"],
    notesRelDir: "notes",
    vaultFolderName: ".mnemonic",
    writable: true,
    ...overrides,
  } as Vault;
}

describe("storageLabel", () => {
  it("returns 'main-vault' for provenance 'main'", () => {
    const vault = makeVault({ provenance: "main", vaultFolderName: "" });
    expect(storageLabel(vault)).toBe("main-vault");
  });

  it("returns 'project-vault' for provenance 'project-local' with vaultFolderName '.mnemonic'", () => {
    const vault = makeVault({ provenance: "project-local", vaultFolderName: ".mnemonic" });
    expect(storageLabel(vault)).toBe("project-vault");
  });

  it("returns 'sub-vault:.mnemonic-foo' for provenance 'project-local' with custom vaultFolderName", () => {
    const vault = makeVault({ provenance: "project-local", vaultFolderName: ".mnemonic-foo" });
    expect(storageLabel(vault)).toBe("sub-vault:.mnemonic-foo");
  });

  it("returns 'attached:<slug>/<folder>' for provenance 'project-attached' with attachmentRef", () => {
    const vault = makeVault({
      provenance: "project-attached",
      vaultFolderName: ".mnemonic",
      attachmentRef: {
        projectSlug: "my-project",
        projectName: "My Project",
        localPath: "/tmp/my-project",
        branch: "main",
        branchTipHash: "abc123",
      },
      writable: false,
    });
    expect(storageLabel(vault)).toBe("attached:my-project/.mnemonic");
  });

  it("returns 'attached:unknown/<folder>' for provenance 'project-attached' without attachmentRef", () => {
    const vault = makeVault({
      provenance: "project-attached",
      vaultFolderName: ".mnemonic",
      writable: false,
    });
    expect(storageLabel(vault)).toBe("attached:unknown/.mnemonic");
  });
});

describe("vaultMatchesStorageScope", () => {
  const mainVault = makeVault({ provenance: "main", vaultFolderName: "" });
  const projectLocalVault = makeVault({ provenance: "project-local", vaultFolderName: ".mnemonic" });
  const projectAttachedVault = makeVault({
    provenance: "project-attached",
    vaultFolderName: ".mnemonic",
    writable: false,
    attachmentRef: {
      projectSlug: "other-project",
      projectName: "Other Project",
      localPath: "/tmp/other",
      branch: "main",
      branchTipHash: "def456",
    },
  });

  it("returns true for storedIn 'any' with any vault", () => {
    expect(vaultMatchesStorageScope(mainVault, "any")).toBe(true);
    expect(vaultMatchesStorageScope(projectLocalVault, "any")).toBe(true);
    expect(vaultMatchesStorageScope(projectAttachedVault, "any")).toBe(true);
  });

  it("returns true for storedIn 'main-vault' only with provenance 'main'", () => {
    expect(vaultMatchesStorageScope(mainVault, "main-vault")).toBe(true);
    expect(vaultMatchesStorageScope(projectLocalVault, "main-vault")).toBe(false);
    expect(vaultMatchesStorageScope(projectAttachedVault, "main-vault")).toBe(false);
  });

  it("returns true for storedIn 'project-vault' only with provenance 'project-local' (NOT project-attached)", () => {
    expect(vaultMatchesStorageScope(projectLocalVault, "project-vault")).toBe(true);
    expect(vaultMatchesStorageScope(mainVault, "project-vault")).toBe(false);
    expect(vaultMatchesStorageScope(projectAttachedVault, "project-vault")).toBe(false);
  });

  it("returns true for storedIn 'attached' only with provenance 'project-attached'", () => {
    expect(vaultMatchesStorageScope(projectAttachedVault, "attached")).toBe(true);
    expect(vaultMatchesStorageScope(mainVault, "attached")).toBe(false);
    expect(vaultMatchesStorageScope(projectLocalVault, "attached")).toBe(false);
  });
});

describe("attachedVaultErrorMessage", () => {
  it("produces a message containing the vault label", () => {
    const vault = makeVault({
      provenance: "project-attached",
      vaultFolderName: ".mnemonic",
      writable: false,
      attachmentRef: {
        projectSlug: "my-project",
        projectName: "My Project",
        localPath: "/tmp/my-project",
        branch: "main",
        branchTipHash: "abc123",
      },
    });
    const message = attachedVaultErrorMessage("note-42", vault);
    expect(message).toContain("note-42");
    expect(message).toContain("attached:my-project/.mnemonic");
    expect(message).toContain("read-only");
  });
});

describe("ProjectSummaryNotesSchema", () => {
  it("parses a valid object without attachedVault", () => {
    const result = ProjectSummaryNotesSchema.safeParse({
      total: 10,
      projectVault: 6,
      mainVault: 4,
      privateProject: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total).toBe(10);
      expect(result.data.attachedVault).toBeUndefined();
    }
  });

  it("parses a valid object with attachedVault", () => {
    const result = ProjectSummaryNotesSchema.safeParse({
      total: 15,
      projectVault: 6,
      attachedVault: 3,
      mainVault: 4,
      privateProject: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachedVault).toBe(3);
    }
  });

  it("rejects an object missing required fields", () => {
    const result = ProjectSummaryNotesSchema.safeParse({
      total: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an object with wrong types", () => {
    const result = ProjectSummaryNotesSchema.safeParse({
      total: "ten",
      projectVault: 6,
      mainVault: 4,
      privateProject: 0,
    });
    expect(result.success).toBe(false);
  });
});