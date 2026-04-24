import { describe, expect, it } from "vitest";

import { attemptCleanMarkdown, MarkdownLintError, cleanMarkdown } from "../src/markdown.js";

describe("cleanMarkdown", () => {
  it("auto-fixes common markdown issues", async () => {
    await expect(cleanMarkdown("#bad\n\n-  item\n\n\ntext\n")).resolves.toBe(
      "# bad\n\n- item\n\ntext"
    );
  });

  it("rejects markdown that still fails linting", async () => {
    await expect(cleanMarkdown("[broken](<>)")).rejects.toBeInstanceOf(MarkdownLintError);
  });
});

describe("attemptCleanMarkdown", () => {
  it("auto-fixes common issues and returns empty warnings", async () => {
    const result = await attemptCleanMarkdown("#bad\n\n-  item\n\n\ntext\n");
    expect(result.cleaned).toBe("# bad\n\n- item\n\ntext");
    expect(result.warnings).toEqual([]);
  });

  it("returns warnings for non-fixable lint issues but still returns cleaned content", async () => {
    const result = await attemptCleanMarkdown("[broken](<>)");
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toContain("MD042");
    // Content still returned even with warnings
    expect(result.cleaned).toContain("broken");
  });

  it("returns cleaned content without trimming for non-fixable issues", async () => {
    const result = await attemptCleanMarkdown("[broken](<>)");
    expect(result.cleaned).toBeTruthy();
    expect(typeof result.cleaned).toBe("string");
  });
});
