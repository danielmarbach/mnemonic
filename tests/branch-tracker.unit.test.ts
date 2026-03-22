import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentGitBranchMock } = vi.hoisted(() => ({
  getCurrentGitBranchMock: vi.fn(),
}));

vi.mock("../src/project.js", () => ({
  getCurrentGitBranch: getCurrentGitBranchMock,
}));

import { checkBranchChange, getLastBranch, resetBranchHistory, updateBranchHistory } from "../src/branch-tracker.js";

function testPath(name: string): string {
  return `/test/${name}-${crypto.randomUUID()}`;
}

describe("branch-tracker", () => {
  beforeEach(() => {
    resetBranchHistory();
    getCurrentGitBranchMock.mockReset();
  });

  afterEach(() => {
    resetBranchHistory();
    getCurrentGitBranchMock.mockReset();
  });

  describe("getLastBranch", () => {
    it("returns undefined when no branch recorded", () => {
      expect(getLastBranch(testPath("missing"))).toBeUndefined();
    });

    it("returns cached branch when set", () => {
      const path = testPath("cached");

      updateBranchHistory(path, "main");
      expect(getLastBranch(path)).toBe("main");
    });
  });

  describe("updateBranchHistory", () => {
    it("sets branch for directory", () => {
      const path = testPath("set");

      updateBranchHistory(path, "main");
      expect(getLastBranch(path)).toBe("main");
    });

    it("updates branch for directory", () => {
      const path = testPath("update");

      updateBranchHistory(path, "main");
      updateBranchHistory(path, "feature-test");
      expect(getLastBranch(path)).toBe("feature-test");
    });

    it("handles multiple directories independently", () => {
      const pathA = testPath("path-a");
      const pathB = testPath("path-b");

      updateBranchHistory(pathA, "main");
      updateBranchHistory(pathB, "develop");
      expect(getLastBranch(pathA)).toBe("main");
      expect(getLastBranch(pathB)).toBe("develop");
    });
  });

  describe("checkBranchChange", () => {
    it("records the first observed branch without reporting a change", async () => {
      const path = testPath("first-observation");

      getCurrentGitBranchMock.mockResolvedValue("main");

      await expect(checkBranchChange(path)).resolves.toBeUndefined();
      expect(getLastBranch(path)).toBe("main");
    });

    it("returns the previous branch when the branch changes", async () => {
      const path = testPath("changed");

      updateBranchHistory(path, "main");
      getCurrentGitBranchMock.mockResolvedValue("feature/test");

      await expect(checkBranchChange(path)).resolves.toBe("main");
      expect(getLastBranch(path)).toBe("feature/test");
    });

    it("returns undefined when the branch is unchanged", async () => {
      const path = testPath("unchanged");

      updateBranchHistory(path, "main");
      getCurrentGitBranchMock.mockResolvedValue("main");

      await expect(checkBranchChange(path)).resolves.toBeUndefined();
      expect(getLastBranch(path)).toBe("main");
    });

    it("returns undefined when git does not report a branch", async () => {
      const path = testPath("missing-branch");

      getCurrentGitBranchMock.mockResolvedValue(undefined);

      await expect(checkBranchChange(path)).resolves.toBeUndefined();
      expect(getLastBranch(path)).toBeUndefined();
    });
  });
});
