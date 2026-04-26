import { describe, expect, it } from "vitest";

describe("update no-op detection", () => {
  describe("hasActualChanges", () => {
    it("detects content change", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ content: "new", originalContent: "old" })).toBe(true);
    });

    it("detects no content change when strings are identical", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ content: "same", originalContent: "same" })).toBe(false);
    });

    it("detects title change", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ title: "New Title", originalTitle: "Old Title" })).toBe(true);
    });

    it("detects no title change when strings are identical", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ title: "Same Title", originalTitle: "Same Title" })).toBe(false);
    });

    it("detects lifecycle change", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ lifecycle: "permanent", originalLifecycle: "temporary" })).toBe(true);
    });

    it("detects no lifecycle change when values are identical", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ lifecycle: "temporary", originalLifecycle: "temporary" })).toBe(false);
    });

    it("detects role change when explicitly set", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ role: "decision", originalRole: "research", roleExplicitlySet: true })).toBe(true);
    });

    it("ignores role change when not explicitly set", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ role: "decision", originalRole: "research", roleExplicitlySet: false })).toBe(false);
    });

    it("detects no role change when values are identical and explicitly set", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ role: "research", originalRole: "research", roleExplicitlySet: true })).toBe(false);
    });

    it("detects role change from undefined to value when explicitly set", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ role: "decision", originalRole: undefined, roleExplicitlySet: true })).toBe(true);
    });

    it("detects role change from value to undefined when explicitly set", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ role: undefined, originalRole: "research", roleExplicitlySet: true })).toBe(true);
    });

    it("detects tags change", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ tags: ["a", "b"], originalTags: ["a"] })).toBe(true);
    });

    it("detects no tags change when arrays are identical", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ tags: ["a", "b"], originalTags: ["a", "b"] })).toBe(false);
    });

    it("detects tags change with same elements different order", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ tags: ["b", "a"], originalTags: ["a", "b"] })).toBe(true);
    });

    it("detects alwaysLoad change", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ alwaysLoad: true, originalAlwaysLoad: false })).toBe(true);
    });

    it("detects no alwaysLoad change when values are identical", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({ alwaysLoad: false, originalAlwaysLoad: false })).toBe(false);
    });

    it("detects no changes at all (true no-op)", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({
        content: undefined,
        originalContent: "original",
        title: "Same Title",
        originalTitle: "Same Title",
        lifecycle: "temporary",
        originalLifecycle: "temporary",
        tags: ["a"],
        originalTags: ["a"],
      })).toBe(false);
    });

    it("detects changes when only content differs", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({
        content: "new content",
        originalContent: "original",
        title: "Same Title",
        originalTitle: "Same Title",
        lifecycle: "temporary",
        originalLifecycle: "temporary",
        tags: ["a"],
        originalTags: ["a"],
      })).toBe(true);
    });

    it("treats semanticPatch presence as a content change", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({
        semanticPatchApplied: true,
        content: undefined,
        originalContent: "original",
        title: "Same Title",
        originalTitle: "Same Title",
        lifecycle: "temporary",
        originalLifecycle: "temporary",
        tags: ["a"],
        originalTags: ["a"],
      })).toBe(true);
    });

    it("treats relatedTo auto-relationship addition as a change", async () => {
      const { hasActualChanges } = await import("../src/update-detect-changes.js");
      expect(hasActualChanges({
        content: undefined,
        originalContent: "original",
        title: "Same Title",
        originalTitle: "Same Title",
        relatedToChanged: true,
      })).toBe(true);
    });
  });

  describe("computeFieldsModified", () => {
    it("reports semanticPatch and content when patchedContent differs from original", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        semanticPatchProvided: true,
        patchedContent: "new content",
        originalContent: "old content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toContain("semanticPatch");
      expect(fields).toContain("content");
    });

    it("reports semanticPatch but not content when patch result equals original", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        semanticPatchProvided: true,
        patchedContent: "same content",
        originalContent: "same content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toContain("semanticPatch");
      expect(fields).not.toContain("content");
    });

    it("does not report content when neither semanticPatch nor contentExplicitlyProvided", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).not.toContain("content");
    });

    it("reports title when explicitly provided and changed", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "New Title",
        originalTitle: "Old Title",
        titleExplicitlyProvided: true,
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toContain("title");
    });

    it("does not report title when not explicitly provided even if values differ", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "New Title",
        originalTitle: "Old Title",
        titleExplicitlyProvided: false,
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).not.toContain("title");
    });

    it("does not report title when explicitly provided but same value", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Same Title",
        originalTitle: "Same Title",
        titleExplicitlyProvided: true,
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).not.toContain("title");
    });

    it("reports lifecycle when explicitly provided and changed", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "permanent",
        originalLifecycle: "temporary",
        lifecycleExplicitlyProvided: true,
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toContain("lifecycle");
    });

    it("does not report lifecycle when not explicitly provided", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "permanent",
        originalLifecycle: "temporary",
        lifecycleExplicitlyProvided: false,
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).not.toContain("lifecycle");
    });

    it("reports role when explicitly set and changed", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        newRole: "decision",
        originalRole: undefined,
        roleExplicitlySet: true,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toContain("role");
    });

    it("reports role when explicitly set to clear an existing role", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        newRole: undefined,
        originalRole: "research",
        roleExplicitlySet: true,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toContain("role");
    });

    it("does not report role when not explicitly set", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        newRole: "research",
        originalRole: "research",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).not.toContain("role");
    });

    it("reports tags when explicitly provided and changed", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a", "b"],
        originalTags: ["a"],
        tagsExplicitlyProvided: true,
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toContain("tags");
    });

    it("does not report tags when not explicitly provided", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a", "b"],
        originalTags: ["a"],
        tagsExplicitlyProvided: false,
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).not.toContain("tags");
    });

    it("reports alwaysLoad when explicitly provided and changed", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: true,
        originalAlwaysLoad: false,
        alwaysLoadExplicitlyProvided: true,
      });
      expect(fields).toContain("alwaysLoad");
    });

    it("does not report alwaysLoad when not explicitly provided", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: true,
        originalAlwaysLoad: false,
        alwaysLoadExplicitlyProvided: false,
      });
      expect(fields).not.toContain("alwaysLoad");
    });

    it("returns empty array when nothing changed", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
      });
      expect(fields).toEqual([]);
    });

    it("reports relatedTo when auto-relationships were added", async () => {
      const { computeFieldsModified } = await import("../src/update-detect-changes.js");
      const fields = computeFieldsModified({
        originalContent: "content",
        newTitle: "Title",
        originalTitle: "Title",
        newLifecycle: "temporary",
        originalLifecycle: "temporary",
        roleExplicitlySet: false,
        newTags: ["a"],
        originalTags: ["a"],
        newAlwaysLoad: false,
        originalAlwaysLoad: false,
        relatedToChanged: true,
      });
      expect(fields).toContain("relatedTo");
    });
  });
});