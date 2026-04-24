import { describe, expect, it } from "vitest";

import { applySemanticPatches, type SemanticPatch } from "../src/semantic-patch.js";

describe("semantic-patch", () => {
  const sampleNote =
    "# My Note\n\n" +
    "This is the introduction.\n\n" +
    "## Details\n\n" +
    "Some detailed content here.\n\n" +
    "## Related\n\n" +
    "- Item one\n" +
    "- Item two\n";

  it("inserts content after a heading using insertAfter", async () => {
    const note = "# Note\n\n## Details\n\nSome content.\n";
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "Details" },
        operation: { op: "insertAfter", value: "Appended after Details." },
      },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Note\n\n## Details\n\nAppended after Details.\n\nSome content.";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("appends list items under a list container using appendChild", async () => {
    const note = "# Shopping\n\n- apples\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "appendChild", value: "- oranges" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Shopping\n\n- apples\n- oranges";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("appends text to a paragraph using appendChild", async () => {
    const note = "# Intro\n\nHello.\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "appendChild", value: " World!" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Intro\n\nHello.World!";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("prepends list items to a list container using prependChild", async () => {
    const note = "# Shopping\n\n- bananas\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "prependChild", value: "- apples" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Shopping\n\n- apples\n- bananas";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts content between heading and its existing body using insertAfter", async () => {
    const note = "# Title\n\n## Section\n\nExisting body.\n";
    const patches: SemanticPatch[] = [
      { selector: { heading: "Section" }, operation: { op: "insertAfter", value: "Inserted mid." } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Title\n\n## Section\n\nInserted mid.\n\nExisting body.";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("removes a heading and preserves remaining structure", async () => {
    const note = "# A\n\nBody A.\n\n## B\n\nBody B.\n\n## C\n\nBody C.\n";
    const patches: SemanticPatch[] = [
      { selector: { heading: "B" }, operation: { op: "remove" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# A\n\nBody A.\n\nBody B.\n\n## C\n\nBody C.";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("applies independent patches that do not interfere with each other", async () => {
    const note = "# Note\n\n## A\n\nA body.\n\n## B\n\nB body.\n";
    const patches: SemanticPatch[] = [
      { selector: { heading: "A" }, operation: { op: "insertAfter", value: "Added under A." } },
      { selector: { heading: "B" }, operation: { op: "insertAfter", value: "Added under B." } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Note\n\n## A\n\nAdded under A.\n\nA body.\n\n## B\n\nAdded under B.\n\nB body.";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("replaces a paragraph's content using replaceChildren", async () => {
    const note = "# Note\n\nSome content here.\n";
    const patches: SemanticPatch[] = [
      {
        selector: { nthChild: 1 },
        operation: { op: "replaceChildren", value: "Completely replaced content." },
      },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toBe("# Note\n\nCompletely replaced content.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("throws a diagnostic error when heading is not found", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "NonExistent" },
        operation: { op: "appendChild", value: "This won't work." },
      },
    ];
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow(
      "Available headings"
    );
  });

  it("lists available headings in diagnostic when heading not found", async () => {
    const patches: SemanticPatch[] = [
      {
        selector: { heading: "Missing" },
        operation: { op: "appendChild", value: "Won't work." },
      },
    ];
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow("My Note");
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow("Details");
    await expect(applySemanticPatches(sampleNote, patches)).rejects.toThrow("Related");
  });

  it("removes a heading node", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Related" }, operation: { op: "remove" } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const expected = "# My Note\n\nThis is the introduction.\n\n## Details\n\nSome detailed content here.\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts content after a heading", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "My Note" }, operation: { op: "insertAfter", value: "Paragraph inserted after the title." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const expected = "# My Note\n\nParagraph inserted after the title.\n\nThis is the introduction.\n\n## Details\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("matches heading by prefix with headingStartsWith and inserts after", async () => {
    const patches: SemanticPatch[] = [
      { selector: { headingStartsWith: "Det" }, operation: { op: "insertAfter", value: "Appended via prefix match." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const expected = "# My Note\n\nThis is the introduction.\n\n## Details\n\nAppended via prefix match.\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts content before a heading", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "insertBefore", value: "Inserted before Details." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const expected = "# My Note\n\nThis is the introduction.\n\nInserted before Details.\n\n## Details\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("selects by nthChild", async () => {
    const note = "# A\n\nfirst\n\n## B\n\nsecond\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 2 }, operation: { op: "replace", value: "replaced" } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toBe("# A\n\nfirst\n\nreplaced\n\nsecond");
    expect(result.lintWarnings).toEqual([]);
  });

  it("selects by lastChild", async () => {
    const patches: SemanticPatch[] = [
      { selector: { lastChild: true }, operation: { op: "replace", value: "replaced" } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).toBe("# My Note\n\nThis is the introduction.\n\n## Details\n\nSome detailed content here.\n\n## Related\n\nreplaced");
    expect(result.lintWarnings).toEqual([]);
  });

  it("rejects child operations on headings", async () => {
    const appendPatch: SemanticPatch[] = [
      {
        selector: { heading: "Details" },
        operation: { op: "appendChild", value: "Won't work." },
      },
    ];
    await expect(applySemanticPatches(sampleNote, appendPatch)).rejects.toThrow("Cannot appendChild to node of type 'heading'");

    const prependPatch: SemanticPatch[] = [
      {
        selector: { heading: "Details" },
        operation: { op: "prependChild", value: "Won't work." },
      },
    ];
    await expect(applySemanticPatches(sampleNote, prependPatch)).rejects.toThrow("Cannot prependChild to node of type 'heading'");

    const replacePatch: SemanticPatch[] = [
      {
        selector: { heading: "Details" },
        operation: { op: "replaceChildren", value: "Won't work." },
      },
    ];
    await expect(applySemanticPatches(sampleNote, replacePatch)).rejects.toThrow("Cannot replaceChildren of node of type 'heading'");
  });

  it("inserts content before a heading", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "insertBefore", value: "Inserted before Details." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const expected = "# My Note\n\nThis is the introduction.\n\nInserted before Details.\n\n## Details\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  // ── Multi-scenario tests ──────────────────────────────────────────────

  it("applies multiple patches in a single call", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "My Note" }, operation: { op: "insertAfter", value: "After title." } },
      { selector: { heading: "Details" }, operation: { op: "insertAfter", value: "After Details." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const expected = "# My Note\n\nAfter title.\n\nThis is the introduction.\n\n## Details\n\nAfter Details.\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("appends new list items under a list container via replaceChildren", async () => {
    const note = "# Groceries\n\n- Milk\n- Eggs\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "replaceChildren", value: "- Milk\n- Eggs\n- Bread" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Groceries\n\n- Milk\n- Eggs\n- Bread";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts multi-paragraph value after a heading", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "insertAfter", value: "First paragraph.\n\nSecond paragraph." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    const expected = "# My Note\n\nThis is the introduction.\n\n## Details\n\nFirst paragraph.\n\nSecond paragraph.\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("returns lint warnings for patches that produce markdown lint issues instead of rejecting", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "insertAfter", value: "[broken](<>)" } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.lintWarnings.length).toBeGreaterThanOrEqual(1);
    expect(result.lintWarnings[0]).toContain("MD042");
    const expected = "# My Note\n\nThis is the introduction.\n\n## Details\n\n[broken]()\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two";
    expect(result.content).toBe(expected);
  });

  it("replaces a blockquote's content", async () => {
    const note = "# Quote\n\n> Old quote text\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "replaceChildren", value: "New quote text" } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toBe("# Quote\n\n> New quote text");
    expect(result.lintWarnings).toEqual([]);
  });

  it("removes a paragraph and verifies the surrounding structure is intact", async () => {
    const note = "# Title\n\nFirst para.\n\n## Mid\n\nContent.\n\nLast para.\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "remove" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Title\n\n## Mid\n\nContent.\n\nLast para.";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("handles a note with no headings at root level", async () => {
    const note = "Just a plain paragraph with no headings.\n\nAnother paragraph.\n";
    const patches: SemanticPatch[] = [
      { selector: { lastChild: true }, operation: { op: "replace", value: "Replaced." } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toBe("Just a plain paragraph with no headings.\n\nReplaced.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("gives clear diagnostic for headings when no headings exist", async () => {
    const note = "Plain text only.\n";
    const patches: SemanticPatch[] = [
      { selector: { heading: "Something" }, operation: { op: "appendChild", value: "n/a" } },
    ];
    await expect(applySemanticPatches(note, patches)).rejects.toThrow("No headings in document");
  });

  it("replaces a heading via replace operation", async () => {
    const patches: SemanticPatch[] = [
      { selector: { heading: "Details" }, operation: { op: "replace", value: "Replaced heading content." } },
    ];
    const result = await applySemanticPatches(sampleNote, patches);
    expect(result.content).toBe(
      "# My Note\n\nThis is the introduction.\n\nReplaced heading content.\n\nSome detailed content here.\n\n## Related\n\n- Item one\n- Item two",
    );
    expect(result.lintWarnings).toEqual([]);
  });

  it("fails on ambiguous headingStartsWith match (returns first match)", async () => {
    const note = "# Alpha\n\n## Alphabeta\n\nA.\n";
    const patches: SemanticPatch[] = [
      { selector: { headingStartsWith: "Alp" }, operation: { op: "insertAfter", value: "X" } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toBe("# Alpha\n\nX\n\n## Alphabeta\n\nA.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("preserves code blocks through round-trip after patch", async () => {
    const note = "# Code\n\nSome text.\n\n```ts\nconst x = 1;\n```\n\nMore text.\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 0 }, operation: { op: "insertAfter", value: "Inserted after heading." } },
    ];
    const result = await applySemanticPatches(note, patches);
    expect(result.content).toBe("# Code\n\nInserted after heading.\n\nSome text.\n\n```ts\nconst x = 1;\n```\n\nMore text.");
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts a table after a heading", async () => {
    const note = "# Report\n\n## Data\n\nExisting.\n";
    const patches: SemanticPatch[] = [
      { selector: { heading: "Data" }, operation: { op: "insertAfter", value: "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Report\n\n## Data\n\n| Col A | Col B |\n| --- | --- |\n| 1 | 2 |\n\nExisting.";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("inserts a fenced code block after a heading", async () => {
    const note = "# Code\n\n## Example\n\nExisting.\n";
    const patches: SemanticPatch[] = [
      { selector: { heading: "Example" }, operation: { op: "insertAfter", value: "```ts\nconsole.log(\"hello\");\n```" } },
    ];
    const result = await applySemanticPatches(note, patches);
    const expected = "# Code\n\n## Example\n\n```ts\nconsole.log(\"hello\");\n```\n\nExisting.";
    expect(result.content).toBe(expected);
    expect(result.lintWarnings).toEqual([]);
  });

  it("throws error when trying to appendChild on a leaf node like code", async () => {
    const note = "# Code\n\n```\ncode\n```\n";
    const patches: SemanticPatch[] = [
      { selector: { nthChild: 1 }, operation: { op: "appendChild", value: "Text" } },
    ];
    await expect(applySemanticPatches(note, patches)).rejects.toThrow("Cannot appendChild");
  });
});
