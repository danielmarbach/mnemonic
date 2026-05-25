import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { collapseHomePath, defaultClaudeHome, defaultVaultPath, expandHomePath, resolveUserPath } from "../src/paths.js";

describe("path resolution", () => {
  it("expands a tilde home prefix", () => {
    const resolved = resolveUserPath("~/mnemonic-vault", { HOME: "/tmp/home" });
    expect(resolved).toBe(path.resolve("/tmp/home", "mnemonic-vault"));
  });

  it("keeps absolute paths unchanged", () => {
    const absolute = path.resolve("/tmp/absolute-vault");
    expect(resolveUserPath(absolute, { HOME: "/tmp/home" })).toBe(absolute);
  });

  it("does not expand non-home tildes", () => {
    expect(expandHomePath("~other/path", { HOME: "/tmp/home" })).toBe("~other/path");
  });

  it("supports USERPROFILE fallback", () => {
    const resolved = resolveUserPath("~/mnemonic-vault", { USERPROFILE: "C:\\Users\\daniel" });
    expect(resolved).toBe(path.resolve("C:\\Users\\daniel", "mnemonic-vault"));
  });

  it("builds default paths from HOME", () => {
    expect(defaultVaultPath({ HOME: "/tmp/home" })).toBe(path.join("/tmp/home", "mnemonic-vault"));
    expect(defaultClaudeHome({ HOME: "/tmp/home" })).toBe(path.join("/tmp/home", ".claude"));
  });

  it("falls back to process home when env is missing", () => {
    expect(defaultVaultPath({})).toBe(path.join(os.homedir(), "mnemonic-vault"));
    expect(defaultClaudeHome({})).toBe(path.join(os.homedir(), ".claude"));
  });
});

describe("collapseHomePath", () => {
  it("collapses paths under home directory to tilde notation", () => {
    expect(collapseHomePath("/tmp/home/projects/repo", { HOME: "/tmp/home" })).toBe("~/projects/repo");
  });

  it("returns home directory as tilde alone", () => {
    expect(collapseHomePath("/tmp/home", { HOME: "/tmp/home" })).toBe("~");
  });

  it("leaves paths outside home directory unchanged", () => {
    expect(collapseHomePath("/other/path", { HOME: "/tmp/home" })).toBe("/other/path");
  });

  it("leaves relative paths unchanged", () => {
    expect(collapseHomePath("relative/path", { HOME: "/tmp/home" })).toBe("relative/path");
  });

  it("handles no home directory gracefully", () => {
    expect(collapseHomePath("/tmp/home/projects", {})).toBe("/tmp/home/projects");
  });
});
