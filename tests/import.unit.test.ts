import { describe, expect, it } from "vitest";
import { parseMemorySections } from "../src/import.js";

describe("parseMemorySections", () => {
  it("parses a single H2 section without an H1 prefix", () => {
    const input = `## Architecture\n- Uses multi-vault design\n- Embeddings are gitignored`;
    const result = parseMemorySections(input);
    expect(result).toEqual([
      { title: "Architecture", content: "- Uses multi-vault design\n- Embeddings are gitignored" },
    ]);
  });

  it("prepends H1 project title to each H2 section — the typical Claude memory file shape", () => {
    // Claude Code auto-memory files have one # title at the top followed by ## sections
    const input = [
      "# Acme Connector",
      "## Project Structure",
      "- main project: `src/Acme/`",
      "- tests: `src/UnitTests/`",
      "",
      "## Key Design Decisions",
      "- adapter skips retry messages",
      "- assembly signing required",
    ].join("\n");

    const result = parseMemorySections(input);
    expect(result).toEqual([
      {
        title: "Acme Connector: Project Structure",
        content: "- main project: `src/Acme/`\n- tests: `src/UnitTests/`",
      },
      {
        title: "Acme Connector: Key Design Decisions",
        content: "- adapter skips retry messages\n- assembly signing required",
      },
    ]);
  });

  it("handles multiple H1 blocks in one file as an edge case", () => {
    // Unlikely in practice (each project has its own MEMORY.md) but handled gracefully
    const input = [
      "# Alpha Project",
      "## Key Decisions",
      "- chose X over Y",
      "",
      "# Beta Project",
      "## Key Decisions",
      "- chose A over B",
    ].join("\n");

    const result = parseMemorySections(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.title).toBe("Alpha Project: Key Decisions");
    expect(result[1]!.title).toBe("Beta Project: Key Decisions");
  });

  it("preserves multi-line content under each section", () => {
    const input = `# Proj\n## Notes\nline one\nline two\nline three`;
    const [section] = parseMemorySections(input);
    expect(section!.content).toBe("line one\nline two\nline three");
  });

  it("trims leading and trailing blank lines from section content", () => {
    const input = `## Section\n\n- item\n\n`;
    const [section] = parseMemorySections(input);
    expect(section!.content).toBe("- item");
  });

  it("skips sections with no content", () => {
    const input = `## Empty\n\n## HasContent\n- something`;
    const result = parseMemorySections(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("HasContent");
  });

  it("handles content before the first H1 that has no H2 sections", () => {
    const input = `# Preamble only\nno sections here\n# Real\n## Stuff\n- content`;
    const result = parseMemorySections(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Real: Stuff");
  });

  it("returns empty array for a file with no sections", () => {
    expect(parseMemorySections("")).toEqual([]);
    expect(parseMemorySections("# Just a title\n")).toEqual([]);
    expect(parseMemorySections("some prose with no headings")).toEqual([]);
  });

  it("does not treat ### as an H2 section boundary", () => {
    const input = `## Parent\n### Child\n- nested content`;
    const [section] = parseMemorySections(input);
    expect(section!.title).toBe("Parent");
    expect(section!.content).toBe("### Child\n- nested content");
  });

  it("handles multiple H2 sections under the same H1", () => {
    const input = `# Project\n## Section A\ncontent a\n## Section B\ncontent b\n## Section C\ncontent c`;
    const result = parseMemorySections(input);
    expect(result.map(s => s.title)).toEqual([
      "Project: Section A",
      "Project: Section B",
      "Project: Section C",
    ]);
  });
});
