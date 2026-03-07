import { describe, expect, it } from "vitest";

import { MarkdownLintError, cleanMarkdown } from "../src/markdown.js";

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
