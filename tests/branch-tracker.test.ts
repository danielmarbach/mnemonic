import { describe, expect, it } from "vitest";

import {
  getLastBranch,
  updateBranchHistory,
  hasBranchChanged,
} from "../src/branch-tracker.js";

// Use unique paths to avoid test interference between test runs
const path1 = "/test/directory-1";
const path2 = "/test/directory-2";
const path3 = "/test/directory-3";

describe("branch-tracker", () => {
  describe("getLastBranch", () => {
    it("returns undefined when no branch recorded", () => {
      expect(getLastBranch(path1)).toBeUndefined();
    });

    it("returns cached branch when set", () => {
      updateBranchHistory(path1, "main");
      expect(getLastBranch(path1)).toBe("main");
    });
  });

  describe("updateBranchHistory", () => {
    it("sets branch for directory", () => {
      updateBranchHistory(path1, "main");
      expect(getLastBranch(path1)).toBe("main");
    });

    it("updates branch for directory", () => {
      updateBranchHistory(path1, "main");
      updateBranchHistory(path1, "feature-test");
      expect(getLastBranch(path1)).toBe("feature-test");
    });

    it("handles multiple directories independently", () => {
      updateBranchHistory(path2, "main");
      updateBranchHistory(path3, "develop");
      expect(getLastBranch(path2)).toBe("main");
      expect(getLastBranch(path3)).toBe("develop");
    });
  });

  describe("hasBranchChanged", () => {
    it("returns false on first call (no cached branch)", () => {
      expect(hasBranchChanged(path1)).toBe(false);
    });

    it("returns false when branch unchanged", () => {
      updateBranchHistory(path1, "main");
      expect(hasBranchChanged(path1)).toBe(false);
    });

    it("returns false after checking unchanged branch", () => {
      updateBranchHistory(path1, "main");
      hasBranchChanged(path1);
      expect(hasBranchChanged(path1)).toBe(false);
    });
  });
});
