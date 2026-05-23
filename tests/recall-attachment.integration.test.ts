import { describe, expect, it } from "vitest";
import { ATTACHMENT_BOOST, PROJECT_SCOPE_BOOST } from "../src/tools/recall-helpers.js";

describe("Attachment boost constants", () => {
  it("ATTACHMENT_BOOST is half of PROJECT_SCOPE_BOOST", () => {
    expect(ATTACHMENT_BOOST).toBe(PROJECT_SCOPE_BOOST / 2);
    expect(ATTACHMENT_BOOST).toBe(0.015);
  });
});

describe.skip("recall attachment integration", () => {
  // These tests require an attached vault fixture (a separate git repo whose
  // mnemonic vault is symlinked or referenced as project-attached). Creating
  // that fixture needs real git repos and vault-manager wiring that goes beyond
  // the current test helpers, so they are skipped until that infrastructure is
  // available.

  it("attached vault notes receive ATTACHMENT_BOOST scoring, between project-local and global", async () => {
    // Setup:
    // 1. Create a main vault, a project repo, and an attached vault (separate
    //    project repo whose vault is registered as project-attached).
    // 2. Write three notes with identical content but different provenance:
    //    - project-local (current project) → gets PROJECT_SCOPE_BOOST (0.03)
    //    - project-attached (attached vault) → gets ATTACHMENT_BOOST (0.015)
    //    - global (main vault, no project) → gets 0 boost
    // 3. Recall with scope "all" and verify the boosted scores satisfy:
    //    project-local > attached > global
    //
    // Without an attached vault fixture we cannot produce a vault with
    // provenance "project-attached", so this test is skipped.
  });

  it("scope project includes attached vault notes even when note.project differs", async () => {
    // When scope: "project" is specified, attached vault notes pass the filter
    // regardless of their note.project field. This is the scope-extended
    // semantics: an attached vault's notes are considered project-visible even
    // though they belong to a different project ID.
    //
    // See src/tools/recall.ts:207-208 and src/tools/recall-helpers.ts:79
    //   if (scope === "project" && !isCurrentProject && !isAttachedVault) continue;
    //
    // Without an attached vault fixture, this test cannot be exercised.
  });

  it("scope global excludes attached vault notes", async () => {
    // When scope: "global" is specified, attached vault notes are excluded
    // entirely. This mirrors the vault filtering in src/helpers/vault.ts:66:
    //   if (scope === "global" && vault.provenance === "project-attached") continue;
    //
    // And the recall candidate filter in src/tools/recall.ts:209-210:
    //   else if (scope === "global") {
    //     if (isProjectNote && !isAttachedVault) continue;
    //   }
    //
    // Note: the candidate filter excludes project notes that are NOT from an
    // attached vault, but the vault-level filter already removes attached
    // vaults, so attached vault notes never reach the candidate phase under
    // scope "global".
    //
    // Without an attached vault fixture, this test cannot be exercised.
  });
});