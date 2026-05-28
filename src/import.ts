/**
 * Parses a Claude Code auto-memory file into importable sections.
 *
 * Claude Code MEMORY.md files may contain multiple `# Project` blocks,
 * each with `##` subsections. Each subsection becomes one mnemonic note.
 * The H1 project heading is prepended to the section title so notes are
 * self-identifying: "DocsEngine: Key Architecture" rather than just
 * "Key Architecture".
 */
export function parseMemorySections(content: string): Array<{ title: string; content: string }> {
  const lines = content.split("\n");
  const sections: Array<{ title: string; content: string }> = [];
  let currentH1 = "";
  let currentTitle = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (currentTitle) {
      const title = currentH1 ? `${currentH1}: ${currentTitle}` : currentTitle;
      sections.push({ title, content: currentLines.join("\n").trim() });
    }
  };

  for (const line of lines) {
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      flush();
      currentH1 = line.slice(2).trim();
      currentTitle = "";
      currentLines = [];
    } else if (line.startsWith("## ")) {
      flush();
      currentTitle = line.slice(3).trim();
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }

  flush();

  return sections.filter((s) => s.content.length > 0);
}
