import { describe, expect, it } from "vitest";

import { parseBody, serializeBody } from "../src/markdown-ast.js";

function roundTrip(input: string): string {
  const tree = parseBody(input);
  return serializeBody(tree);
}

describe("markdown-ast round-trip", () => {
  it("preserves simple markdown through parse-serialize cycle", () => {
    const input = "# Hello\n\nThis is a paragraph.\n\n- list item 1\n- list item 2";
    expect(roundTrip(input)).toBe(input + "\n");
  });

  it("preserves nested content through parse-serialize cycle", () => {
    const input = "# Title\n\n## Section\n\nSome text with **bold** and *italic*.\n\n> A blockquote\n\n1. ordered\n2. list";
    expect(roundTrip(input)).toBe(input + "\n");
  });
});
