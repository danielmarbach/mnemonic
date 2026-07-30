import { describe, expect, it } from "vitest";
import { matchAnyGlob, matchGlob } from "../src/glob-match.js";

describe("matchGlob", () => {
  describe("**/*.md (default include)", () => {
    const p = "**/*.md";
    it.each([
      ["a.md", true],
      ["docs/a.md", true],
      ["docs/sub/a.md", true],
      ["a.txt", false],
      ["docs/a.txt", false],
      ["README", false],
    ])("%s -> %s", (path, expected) => {
      expect(matchGlob(p, path)).toBe(expected);
    });
  });

  describe("directory-prefixed glob docs/**/*.md", () => {
    const p = "docs/**/*.md";
    it.each([
      ["docs/a.md", true],
      ["docs/sub/a.md", true],
      ["docs/sub/deep/a.md", true],
      ["a.md", false], // outside docs/
      ["other/a.md", false],
      ["docsx/a.md", false], // prefix must be exact segment
      ["docs/a.txt", false],
    ])("%s -> %s", (path, expected) => {
      expect(matchGlob(p, path)).toBe(expected);
    });
  });

  describe("single-segment glob *.md", () => {
    const p = "*.md";
    it.each([
      ["a.md", true],
      ["docs/a.md", false], // * must not cross /
    ])("%s -> %s", (path, expected) => {
      expect(matchGlob(p, path)).toBe(expected);
    });
  });

  describe("trailing ** glob docs/**", () => {
    const p = "docs/**";
    it.each([
      ["docs/a.md", true],
      ["docs/sub/a.md", true],
      ["docs", false], // needs at least the docs/ prefix
      ["other/a.md", false],
    ])("%s -> %s", (path, expected) => {
      expect(matchGlob(p, path)).toBe(expected);
    });
  });

  describe("bare-name convention (default excludes)", () => {
    it("matches a bare name as any path segment", () => {
      expect(matchGlob("node_modules", "node_modules/pkg/index.js")).toBe(true);
      expect(matchGlob("node_modules", "docs/node_modules/x")).toBe(true);
      expect(matchGlob("node_modules", "node_modules")).toBe(true);
      // must be a full segment, not a substring
      expect(matchGlob("node_modules", "node_modules2/x")).toBe(false);
      expect(matchGlob("node_modules", "my_node_modules/x")).toBe(false);
      expect(matchGlob("dist", "distribute/x")).toBe(false);
    });
  });

  describe("explicit **/dir/** exclude", () => {
    const p = "**/node_modules/**";
    it.each([
      ["node_modules/x", true],
      ["a/node_modules/b/c", true],
      ["node_modules", false], // **/dir/** requires a descendant
    ])("%s -> %s", (path, expected) => {
      expect(matchGlob(p, path)).toBe(expected);
    });
  });

  describe("case sensitivity", () => {
    it("matches are case-sensitive", () => {
      expect(matchGlob("**/*.MD", "a.md")).toBe(false);
      expect(matchGlob("**/*.md", "a.MD")).toBe(false);
    });
  });

  describe("? wildcard", () => {
    it("matches exactly one non-slash character", () => {
      expect(matchGlob("a?c.md", "abc.md")).toBe(true);
      expect(matchGlob("a?c.md", "ac.md")).toBe(false);
      expect(matchGlob("a?c.md", "a/c.md")).toBe(false);
    });
  });

  describe("** (match everything)", () => {
    it("matches any path", () => {
      expect(matchGlob("**", "a.md")).toBe(true);
      expect(matchGlob("**", "docs/sub/a.md")).toBe(true);
    });
  });
});

describe("matchAnyGlob", () => {
  it("returns true if any pattern matches", () => {
    expect(matchAnyGlob(["docs/**/*.md", "README.md"], "docs/a.md")).toBe(true);
    expect(matchAnyGlob(["docs/**/*.md", "README.md"], "README.md")).toBe(true);
    expect(matchAnyGlob(["docs/**/*.md", "README.md"], "other/a.md")).toBe(false);
  });

  it("default excludes block nested vendor paths", () => {
    const defaults = ["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage"];
    expect(matchAnyGlob(defaults, "node_modules/pkg/index.js")).toBe(true);
    expect(matchAnyGlob(defaults, "src/node_modules/deep/x.md")).toBe(true);
    expect(matchAnyGlob(defaults, "coverage/lcov.info")).toBe(true);
    expect(matchAnyGlob(defaults, "docs/zeta.md")).toBe(false);
  });
});
