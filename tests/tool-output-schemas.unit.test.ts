import { describe, expect, it } from "vitest";

import {
  RememberToolResultSchema,
  UpdateToolResultSchema,
} from "../src/structured-content.js";

describe("tool output schemas", () => {
  describe("RememberToolResultSchema", () => {
    it("accepts lint_error payload", () => {
      const parsed = RememberToolResultSchema.safeParse({
        action: "lint_error",
        tool: "remember",
        issues: ["fenced code blocks should have a language"],
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects remembered payload when required fields are missing", () => {
      const parsed = RememberToolResultSchema.safeParse({ action: "remembered" });
      expect(parsed.success).toBe(false);
    });
  });

  describe("UpdateToolResultSchema", () => {
    it("accepts lint_error payload", () => {
      const parsed = UpdateToolResultSchema.safeParse({
        action: "lint_error",
        tool: "update",
        issues: ["fenced code blocks should have a language"],
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects updated payload when required fields are missing", () => {
      const parsed = UpdateToolResultSchema.safeParse({ action: "updated" });
      expect(parsed.success).toBe(false);
    });
  });
});
