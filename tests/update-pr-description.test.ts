import { describe, expect, it } from "vitest";

import {
  buildSummaryIntro,
  generateDescription,
  generateTitle,
  parseFrontmatter,
  sortNotesByPriority,
} from "../scripts/ci/update-pr-description.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(title: string, tags: string[], body = "Body text.") {
  return {
    file: `.mnemonic/notes/${title.toLowerCase().replace(/\s+/g, "-")}.md`,
    frontmatter: { title, tags },
    body,
  };
}

// ---------------------------------------------------------------------------
// buildSummaryIntro
// ---------------------------------------------------------------------------

describe("buildSummaryIntro", () => {
  it("returns bug-fix intro when hasBugs is true", () => {
    expect(buildSummaryIntro(true, false)).toBe("This PR fixes the following issues:");
  });

  it("returns enhancement intro when hasEnhancements is true", () => {
    expect(buildSummaryIntro(false, true)).toBe("This PR adds the following enhancements:");
  });

  it("returns combined intro when both bugs and enhancements are present", () => {
    expect(buildSummaryIntro(true, true)).toBe("This PR fixes bugs and adds enhancements:");
  });

  it("returns design-decision intro when neither bugs nor enhancements are present", () => {
    expect(buildSummaryIntro(false, false)).toBe("This PR captures the following design decisions:");
  });
});

// ---------------------------------------------------------------------------
// sortNotesByPriority
// ---------------------------------------------------------------------------

describe("sortNotesByPriority", () => {
  it("places bug-tagged notes before design notes", () => {
    const design = makeNote("Design Note", ["design", "architecture"]);
    const bug = makeNote("Bug Fix", ["bug", "fix"]);
    const sorted = sortNotesByPriority([design, bug]);
    expect(sorted[0].frontmatter.title).toBe("Bug Fix");
    expect(sorted[1].frontmatter.title).toBe("Design Note");
  });

  it("places enhancement-tagged notes before design notes", () => {
    const design = makeNote("Design Note", ["decision"]);
    const enhancement = makeNote("New Feature", ["enhancement"]);
    const sorted = sortNotesByPriority([design, enhancement]);
    expect(sorted[0].frontmatter.title).toBe("New Feature");
    expect(sorted[1].frontmatter.title).toBe("Design Note");
  });

  it("places bug notes before enhancement notes", () => {
    const enhancement = makeNote("New Feature", ["feature"]);
    const bug = makeNote("Bug Fix", ["bugs"]);
    const sorted = sortNotesByPriority([enhancement, bug]);
    expect(sorted[0].frontmatter.title).toBe("Bug Fix");
    expect(sorted[1].frontmatter.title).toBe("New Feature");
  });

  it("preserves original order within the same priority tier", () => {
    const bug1 = makeNote("Bug A", ["bug"]);
    const bug2 = makeNote("Bug B", ["fix"]);
    const sorted = sortNotesByPriority([bug1, bug2]);
    expect(sorted[0].frontmatter.title).toBe("Bug A");
    expect(sorted[1].frontmatter.title).toBe("Bug B");
  });

  it("handles notes with no recognised tags (lowest priority)", () => {
    const untagged = makeNote("Misc Note", ["internal"]);
    const bug = makeNote("Bug Fix", ["hotfix"]);
    const sorted = sortNotesByPriority([untagged, bug]);
    expect(sorted[0].frontmatter.title).toBe("Bug Fix");
    expect(sorted[1].frontmatter.title).toBe("Misc Note");
  });

  it("does not mutate the original array", () => {
    const notes = [makeNote("Design", ["design"]), makeNote("Bug", ["bug"])];
    const original = [...notes];
    sortNotesByPriority(notes);
    expect(notes[0].frontmatter.title).toBe(original[0].frontmatter.title);
  });
});

// ---------------------------------------------------------------------------
// generateTitle
// ---------------------------------------------------------------------------

describe("generateTitle", () => {
  it("returns the single note's title when there is only one note", () => {
    const note = makeNote("My Decision", ["design"]);
    expect(generateTitle([note])).toBe("My Decision");
  });

  it("prefers a bug-tagged note over a design-tagged note", () => {
    const design = makeNote("Design Decision", ["architecture"]);
    const bug = makeNote("Fix: vault creation", ["bug"]);
    expect(generateTitle([design, bug])).toBe("Fix: vault creation");
  });

  it("falls back to design/architecture note when there is no bug note", () => {
    const other = makeNote("Other Note", ["internal"]);
    const design = makeNote("Design Note", ["decision"]);
    expect(generateTitle([other, design])).toBe("Design Note");
  });

  it("falls back to the first note when there is no bug or design note", () => {
    const first = makeNote("First Note", ["internal"]);
    const second = makeNote("Second Note", ["misc"]);
    expect(generateTitle([first, second])).toBe("First Note");
  });

  it("recognises all BUG_TAGS variants", () => {
    for (const tag of ["bug", "bugs", "fix", "bugfix", "hotfix"]) {
      const design = makeNote("Design", ["architecture"]);
      const bugNote = makeNote("Bug via " + tag, [tag]);
      expect(generateTitle([design, bugNote])).toBe("Bug via " + tag);
    }
  });
});

// ---------------------------------------------------------------------------
// generateDescription — summary section
// ---------------------------------------------------------------------------

describe("generateDescription — summary section", () => {
  it("uses extractLeadingSummary for a single note", () => {
    const note = makeNote("My Note", ["design"], "First para.\n\nSecond para.");
    const desc = generateDescription([note]);
    expect(desc).toContain("First para.");
    expect(desc).not.toContain("This PR");
  });

  it("uses bug-fix intro when one of several notes has a bug tag", () => {
    const design = makeNote("Design Note", ["architecture"]);
    const bug = makeNote("Bug Fix", ["bug"]);
    const desc = generateDescription([design, bug]);
    expect(desc).toContain("This PR fixes the following issues:");
  });

  it("uses enhancement intro when one of several notes has an enhancement tag", () => {
    const design = makeNote("Design Note", ["architecture"]);
    const feat = makeNote("New Feature", ["feature"]);
    const desc = generateDescription([design, feat]);
    expect(desc).toContain("This PR adds the following enhancements:");
  });

  it("uses design-decision intro when no bug or enhancement tags are present", () => {
    const note1 = makeNote("Note A", ["policy"]);
    const note2 = makeNote("Note B", ["storage"]);
    const desc = generateDescription([note1, note2]);
    expect(desc).toContain("This PR captures the following design decisions:");
  });
});

// ---------------------------------------------------------------------------
// generateDescription — ordering of Design Decisions section
// ---------------------------------------------------------------------------

describe("generateDescription — Design Decisions ordering", () => {
  it("lists bug-tagged notes before design notes", () => {
    const design = makeNote("Design Note", ["architecture"], "Design body.");
    const bug = makeNote("Bug Fix", ["bug"], "Bug body.");
    const desc = generateDescription([design, bug]);
    const bugIdx = desc.indexOf("### Bug Fix");
    const designIdx = desc.indexOf("### Design Note");
    expect(bugIdx).toBeLessThan(designIdx);
  });

  it("lists bug notes before enhancements before design notes", () => {
    const design = makeNote("Design", ["architecture"], "Design body.");
    const feat = makeNote("Feature", ["enhancement"], "Feature body.");
    const bug = makeNote("Bug", ["fix"], "Bug body.");
    const desc = generateDescription([design, feat, bug]);
    const bugIdx = desc.indexOf("### Bug");
    const featIdx = desc.indexOf("### Feature");
    const designIdx = desc.indexOf("### Design");
    expect(bugIdx).toBeLessThan(featIdx);
    expect(featIdx).toBeLessThan(designIdx);
  });

  it("lists bug note first in the summary list too", () => {
    const design = makeNote("Design Note", ["architecture"]);
    const bug = makeNote("Bug Fix", ["bugs"]);
    const desc = generateDescription([design, bug]);
    const bugIdx = desc.indexOf("**Bug Fix**");
    const designIdx = desc.indexOf("**Design Note**");
    expect(bugIdx).toBeLessThan(designIdx);
  });
});

// ---------------------------------------------------------------------------
// Smoke test: PR #47 notes (bug + audit notes — real-world shape)
// ---------------------------------------------------------------------------

describe("smoke test: PR #47 notes (bug + audit note)", () => {
  const policyNote = {
    file: ".mnemonic/notes/project-memory-policy-defaults-storage-location-f563f634.md",
    frontmatter: {
      title: "project memory storage policy",
      tags: ["policy", "scope", "storage", "ux", "unadopted"],
    },
    body: "Decision: project context and storage location are separate.\n\n## Consolidate remnant bug (fixed)\n\nFixed by changing executeMerge to use getProjectVaultIfExists.",
  };

  const auditNote = {
    file: ".mnemonic/notes/vault-creation-audit-which-tools-can-create-mnemonic-and-whi-d0388691.md",
    frontmatter: {
      title: "Vault creation audit: which tools can create .mnemonic/ and which cannot",
      tags: ["audit", "vault-routing", "getOrCreateProjectVault", "bugs", "testing"],
    },
    body: "Audit of all cwd-accepting MCP tools against spurious project vault creation. Only three call sites use `getOrCreateProjectVault` — two are intentional, one was a bug (fixed).",
  };

  it("picks the audit note (bugs tag) as the title source", () => {
    // The audit note has 'bugs' tag so it should be preferred as the title
    const title = generateTitle([policyNote, auditNote]);
    expect(title).toBe(auditNote.frontmatter.title);
  });

  it("uses bug-fix summary intro", () => {
    const desc = generateDescription([policyNote, auditNote]);
    expect(desc).toContain("This PR fixes the following issues:");
  });

  it("lists audit note (bugs tag) before policy note in both Summary and Design Decisions", () => {
    const desc = generateDescription([policyNote, auditNote]);
    const auditInSummary = desc.indexOf("**Vault creation audit");
    const policyInSummary = desc.indexOf("**project memory storage policy**");
    expect(auditInSummary).toBeLessThan(policyInSummary);

    const auditInDecisions = desc.indexOf("### Vault creation audit");
    const policyInDecisions = desc.indexOf("### project memory storage policy");
    expect(auditInDecisions).toBeLessThan(policyInDecisions);
  });
});

// ---------------------------------------------------------------------------
// parseFrontmatter (existing behaviour, kept for regression coverage)
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses title and array tags", () => {
    const content = `---
title: My Note
tags:
  - bug
  - fix
---
Body text.
`;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.title).toBe("My Note");
    expect(frontmatter.tags).toEqual(["bug", "fix"]);
    expect(body.trim()).toBe("Body text.");
  });

  it("returns empty frontmatter when there is no YAML block", () => {
    const { frontmatter, body } = parseFrontmatter("Just a body.");
    expect(frontmatter).toEqual({});
    expect(body).toBe("Just a body.");
  });
});
