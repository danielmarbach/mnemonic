import { describe, expect, it } from "vitest";
import path from "path";
import os from "os";

describe("add-attachment path validation", () => {
  // Regression test for https://github.com/danielmarbach/mnemonic
  // The path validation in add-attachment used resolvedPath.startsWith("/")
  // which rejected valid Windows absolute paths like C:\Repos\foo (they
  // don't start with "/"). The fix replaced it with path.isAbsolute().
  it("path.isAbsolute accepts drive-letter paths on Windows (rejects with startsWith)", () => {
    if (process.platform === "win32") {
      // Real Windows: test the actual path module behaviour
      const winPath = path.resolve("C:\\Users\\test\\repo");
      expect(path.isAbsolute(winPath)).toBe(true);
      // The old check would have failed:
      expect(winPath.startsWith("/")).toBe(false);
    } else {
      // Linux/CI: simulate the Windows check with path.win32.
      // This does not exercise the real path.resolve on Windows, so it
      // might not cover all edge cases (UNC paths, forward-slash variants).
      console.warn(
        "[add-attachment path validation] Running simulated Windows path check via path.win32 on non-Windows platform —" +
          " real Windows coverage requires a Windows CI runner.",
      );
      const winPath = path.win32.resolve("C:\\Users\\test\\repo");
      expect(path.win32.isAbsolute(winPath)).toBe(true);
      // The old check would have failed:
      expect(winPath.startsWith("/")).toBe(false);
    }
  });

  it("path.isAbsolute accepts absolute paths on the current platform", () => {
    const absPath = path.resolve(os.tmpdir(), "mnemonic-test");
    expect(path.isAbsolute(absPath)).toBe(true);
  });

  it("path.isAbsolute rejects relative paths on the current platform", () => {
    expect(path.isAbsolute("relative/path/to/repo")).toBe(false);
    expect(path.isAbsolute("./repo")).toBe(false);
    expect(path.isAbsolute("..")).toBe(false);
  });
});
