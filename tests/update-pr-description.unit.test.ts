import { describe, expect, it } from "vitest";

import {
  buildSummaryIntro,
  classifyNote,
  computeThresholds,
  generateDescription,
  generateTitle,
  isWeakSummary,
  parseFrontmatter,
  routeTier,
  scoreSemanticPaths,
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

function makeWorkflowNote(
  title: string,
  role: string,
  lifecycle: "temporary" | "permanent",
  body = "Body text.",
) {
  return {
    file: `.mnemonic/notes/${title.toLowerCase().replace(/\s+/g, "-")}.md`,
    frontmatter: { title, tags: ["workflow"], role, lifecycle },
    body,
  };
}

// ---------------------------------------------------------------------------
// classifyNote
// ---------------------------------------------------------------------------

describe("classifyNote", () => {
  it("returns 'research' for role: research", () => {
    expect(classifyNote(makeWorkflowNote("R", "research", "temporary"))).toBe("research");
  });

  it("returns 'plan' for role: plan", () => {
    expect(classifyNote(makeWorkflowNote("P", "plan", "temporary"))).toBe("plan");
  });

  it("returns 'review' for role: review", () => {
    expect(classifyNote(makeWorkflowNote("V", "review", "temporary"))).toBe("review");
  });

  it("returns 'context' for role: context", () => {
    expect(classifyNote(makeWorkflowNote("C", "context", "temporary"))).toBe("context");
  });

  it("returns 'context' for unroled temporary notes (ad-hoc scaffolding)", () => {
    const note = {
      file: ".mnemonic/notes/adhoc.md",
      frontmatter: { title: "Adhoc", tags: [], lifecycle: "temporary" },
      body: "",
    };
    expect(classifyNote(note)).toBe("context");
  });

  it("returns 'permanent' for notes with no role and no lifecycle", () => {
    expect(classifyNote(makeNote("Design Decision", ["design"]))).toBe("permanent");
  });

  it("returns 'permanent' for notes with lifecycle: permanent regardless of tags", () => {
    const note = {
      file: ".mnemonic/notes/perm.md",
      frontmatter: { title: "Perm", tags: ["plan"], lifecycle: "permanent" },
      body: "",
    };
    expect(classifyNote(note)).toBe("permanent");
  });

  it("role takes precedence over lifecycle for RPIR workflow notes", () => {
    // A research note promoted to permanent still shows as 'research'
    const note = makeWorkflowNote("Promoted Research", "research", "permanent");
    expect(classifyNote(note)).toBe("research");
  });
});

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
// generateDescription — ordering of Changes section
// ---------------------------------------------------------------------------

describe("generateDescription — Changes section ordering", () => {
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

  it("does not render a Changes section for a single-note PR", () => {
    const note = makeNote("My Note", ["design"], "First para.\n\nSecond para.");
    const desc = generateDescription([note]);
    expect(desc).not.toContain("## Changes");
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

  it("lists audit note (bugs tag) before policy note in both Summary and Changes", () => {
    const desc = generateDescription([policyNote, auditNote]);
    const auditInSummary = desc.indexOf("**Vault creation audit");
    const policyInSummary = desc.indexOf("**project memory storage policy**");
    expect(auditInSummary).toBeLessThan(policyInSummary);

    const auditInChanges = desc.indexOf("### Vault creation audit");
    const policyInChanges = desc.indexOf("### project memory storage policy");
    expect(auditInChanges).toBeLessThan(policyInChanges);
  });
});

// ---------------------------------------------------------------------------
// generateDescription — Workflow Artifacts section (RPIR notes)
// ---------------------------------------------------------------------------

describe("generateDescription — Workflow Artifacts section", () => {
  it("renders Workflow Artifacts section when RPIR notes are present", () => {
    const plan = makeWorkflowNote("My Plan", "plan", "temporary", "Plan to fix the thing.");
    const desc = generateDescription([plan]);
    expect(desc).toContain("## Workflow Artifacts");
    expect(desc).toContain("**Plan:**");
    expect(desc).toContain("My Plan");
  });

  it("shows first sentence of workflow note body, not full body", () => {
    const research = makeWorkflowNote(
      "My Research",
      "research",
      "temporary",
      "Short finding. Much more detail follows here that should not appear.",
    );
    const desc = generateDescription([research]);
    expect(desc).toContain("Short finding.");
    expect(desc).not.toContain("Much more detail follows here");
  });

  it("groups workflow notes under their correct role label", () => {
    const research = makeWorkflowNote("R Note", "research", "temporary", "Research body.");
    const plan = makeWorkflowNote("P Note", "plan", "temporary", "Plan body.");
    const review = makeWorkflowNote("V Note", "review", "temporary", "Review body.");
    const desc = generateDescription([research, plan, review]);
    expect(desc).toContain("**Research:**");
    expect(desc).toContain("**Plan:**");
    expect(desc).toContain("**Review:**");
  });

  it("omits Workflow Artifacts section when there are no RPIR notes", () => {
    const note = makeNote("Design Note", ["architecture"], "Decision body.");
    const desc = generateDescription([note]);
    expect(desc).not.toContain("## Workflow Artifacts");
  });

  it("does not render a Changes section for workflow-only PRs", () => {
    const plan = makeWorkflowNote("My Plan", "plan", "temporary", "Plan body.");
    const desc = generateDescription([plan]);
    expect(desc).not.toContain("## Changes");
  });

  it("renders both Changes and Workflow Artifacts when PR has both note types", () => {
    const decision = makeNote("Design Decision", ["design"], "Decision body.");
    const plan = makeWorkflowNote("Implementation Plan", "plan", "temporary", "Plan body.");
    const desc = generateDescription([decision, plan]);
    expect(desc).toContain("## Changes");
    expect(desc).toContain("## Workflow Artifacts");
    expect(desc).toContain("### Design Decision");
  });
});

// ---------------------------------------------------------------------------
// generateDescription — Open Questions section (conditional)
// ---------------------------------------------------------------------------

describe("generateDescription — Open Questions section", () => {
  it("renders Open Questions section when a note contains that heading", () => {
    const note = makeNote(
      "Design Note",
      ["design"],
      "Summary para.\n\n## Open Questions\n\n- Question one\n- Question two\n",
    );
    const desc = generateDescription([note]);
    expect(desc).toContain("## Open Questions");
    expect(desc).toContain("Question one");
  });

  it("omits Open Questions section when no note has that heading", () => {
    const note = makeNote("Design Note", ["design"], "Summary para.");
    const desc = generateDescription([note]);
    expect(desc).not.toContain("## Open Questions");
  });

  it("extracts Risks section under Open Questions", () => {
    const note = makeNote(
      "Design Note",
      ["design"],
      "Summary.\n\n## Risks\n\n- Risk A\n",
    );
    const desc = generateDescription([note]);
    expect(desc).toContain("## Open Questions");
    expect(desc).toContain("Risk A");
  });
});

// ---------------------------------------------------------------------------
// generateDescription — Notes / References section
// ---------------------------------------------------------------------------

describe("generateDescription — Notes / References section", () => {
  it("always includes a Notes / References section", () => {
    const note = makeNote("My Note", ["design"]);
    const desc = generateDescription([note]);
    expect(desc).toContain("## Notes / References");
    expect(desc).toContain(".mnemonic/notes/");
  });

  it("labels workflow notes with their role in the references list", () => {
    const plan = makeWorkflowNote("My Plan", "plan", "temporary", "Plan body.");
    const desc = generateDescription([plan]);
    expect(desc).toMatch(/my-plan\.md.*\(plan\)/);
  });

  it("does not add a role label for permanent notes", () => {
    const note = makeNote("Design Note", ["design"]);
    const desc = generateDescription([note]);
    // Permanent notes should not have a _(role)_ label
    expect(desc).not.toMatch(/design-note\.md.*\(permanent\)/);
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

// ---------------------------------------------------------------------------
// computeThresholds
// ---------------------------------------------------------------------------

describe("computeThresholds", () => {
  it("returns conservative defaults when history has fewer than 5 entries", () => {
    const t = computeThresholds([]);
    expect(t.files.p75).toBeGreaterThan(0);
    expect(t.lines.p75).toBeGreaterThan(0);
    expect(t.commits.p75).toBeGreaterThan(0);
  });

  it("returns conservative defaults for a 4-entry history", () => {
    const small = [
      { changedFiles: 1, additions: 2, deletions: 0, commits: 1 },
      { changedFiles: 2, additions: 5, deletions: 1, commits: 2 },
      { changedFiles: 3, additions: 10, deletions: 0, commits: 1 },
      { changedFiles: 4, additions: 20, deletions: 5, commits: 3 },
    ];
    const t = computeThresholds(small);
    // Falls back to CONSERVATIVE_DEFAULTS
    expect(t.files.p75).toBe(10);
  });

  it("computes thresholds from a real history sample", () => {
    // 10 PRs: 5 trivial formula bumps + 5 moderate feature PRs
    const history = [
      { changedFiles: 1, additions: 2, deletions: 2, commits: 1 },
      { changedFiles: 1, additions: 2, deletions: 2, commits: 1 },
      { changedFiles: 1, additions: 2, deletions: 2, commits: 1 },
      { changedFiles: 1, additions: 2, deletions: 2, commits: 1 },
      { changedFiles: 1, additions: 2, deletions: 2, commits: 1 },
      { changedFiles: 5, additions: 80, deletions: 20, commits: 3 },
      { changedFiles: 8, additions: 200, deletions: 50, commits: 6 },
      { changedFiles: 12, additions: 400, deletions: 80, commits: 10 },
      { changedFiles: 20, additions: 900, deletions: 200, commits: 18 },
      { changedFiles: 35, additions: 1800, deletions: 600, commits: 40 },
    ];
    const t = computeThresholds(history);
    // p75 should be between the mid-range and high-range PRs
    expect(t.files.p75).toBeGreaterThan(1);
    expect(t.files.p75).toBeLessThan(35);
    expect(t.files.p90).toBeGreaterThan(t.files.p75);
    expect(t.lines.p75).toBeGreaterThan(0);
    expect(t.lines.p75).toBeLessThan(2000);
    expect(t.commits.p90).toBeGreaterThan(t.commits.p75);
  });

  it("p90 is always >= p75", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      changedFiles: i + 1,
      additions: (i + 1) * 10,
      deletions: i * 5,
      commits: i + 1,
    }));
    const t = computeThresholds(history);
    expect(t.files.p90).toBeGreaterThanOrEqual(t.files.p75);
    expect(t.lines.p90).toBeGreaterThanOrEqual(t.lines.p75);
    expect(t.commits.p90).toBeGreaterThanOrEqual(t.commits.p75);
  });
});

// ---------------------------------------------------------------------------
// scoreSemanticPaths
// ---------------------------------------------------------------------------

describe("scoreSemanticPaths", () => {
  it("marks Formula-only changes as trivial", () => {
    const r = scoreSemanticPaths(["Formula/mnemonic-mcp.rb"]);
    expect(r.isTrivial).toBe(true);
  });

  it("marks lockfile-only changes as trivial", () => {
    const r = scoreSemanticPaths(["package-lock.json"]);
    expect(r.isTrivial).toBe(true);
  });

  it("marks notes-only changes as non-trivial with low complexity", () => {
    const r = scoreSemanticPaths([".mnemonic/notes/my-decision.md"]);
    expect(r.isTrivial).toBe(false);
    expect(r.complexity).toBe("low");
  });

  it("marks docs-only changes as low complexity", () => {
    const r = scoreSemanticPaths(["README.md", "docs/guide.md"]);
    expect(r.isTrivial).toBe(false);
    expect(r.complexity).toBe("low");
  });

  it("rates CI script changes as high complexity", () => {
    const r = scoreSemanticPaths([
      "scripts/ci/update-pr-description.mjs",
      "tests/update-pr-description.unit.test.ts",
      ".mnemonic/notes/decision.md",
    ]);
    expect(r.isTrivial).toBe(false);
    expect(r.complexity).toBe("high");
  });

  it("rates workflow file changes as high complexity", () => {
    const r = scoreSemanticPaths([
      ".github/workflows/ci.yml",
      "src/index.ts",
    ]);
    expect(r.isTrivial).toBe(false);
    expect(r.complexity).toBe("high");
  });

  it("rates cross-folder src+tests change as medium complexity", () => {
    const r = scoreSemanticPaths([
      "src/index.ts",
      "src/markdown.ts",
      "tests/unit.test.ts",
    ]);
    expect(r.isTrivial).toBe(false);
    expect(["medium", "high"]).toContain(r.complexity);
  });

  it("rates single-folder src change as normal complexity", () => {
    const r = scoreSemanticPaths(["src/index.ts", "src/markdown.ts"]);
    expect(r.isTrivial).toBe(false);
    expect(r.complexity).toBe("normal");
  });
});

// ---------------------------------------------------------------------------
// routeTier
// ---------------------------------------------------------------------------

describe("routeTier", () => {
  // Use a realistic threshold set based on this repo's actual PR distribution
  const thresholds = {
    files: { p75: 9, p90: 22 },
    lines: { p75: 400, p90: 1400 },
    commits: { p75: 7, p90: 20 },
  };

  it("routes formula-bump PRs to Tier A", () => {
    const stats = { changedFiles: 1, additions: 2, deletions: 2, commits: 1 };
    const paths = ["Formula/mnemonic-mcp.rb"];
    expect(routeTier(stats, paths, thresholds)).toBe("A");
  });

  it("routes small focused PRs to Tier B", () => {
    // PR #176: 4 files, 16 lines, 1 commit, no CI scripts
    const stats = { changedFiles: 4, additions: 12, deletions: 4, commits: 1 };
    const paths = ["src/index.ts", "AGENT.md", ".mnemonic/notes/decision.md"];
    expect(routeTier(stats, paths, thresholds)).toBe("B");
  });

  it("routes CI script changes to Tier C even when small", () => {
    // PR #185: 3 files, 389 lines, 2 commits — but touches scripts/ci/
    const stats = { changedFiles: 3, additions: 352, deletions: 37, commits: 2 };
    const paths = [
      "scripts/ci/update-pr-description.mjs",
      "tests/update-pr-description.unit.test.ts",
      ".mnemonic/notes/decision.md",
    ];
    expect(routeTier(stats, paths, thresholds)).toBe("C");
  });

  it("routes medium-sized multi-folder PRs to Tier C", () => {
    // PR #169: 13 files, 417 lines, 11 commits — above p75 commits
    const stats = { changedFiles: 13, additions: 360, deletions: 57, commits: 11 };
    const paths = [
      "src/markdown.ts",
      "src/semantic-patch.ts",
      "src/index.ts",
      "tests/semantic-patch.unit.test.ts",
      "tests/markdown.unit.test.ts",
      "scripts/run-dogfood-packs.mjs",
    ];
    expect(routeTier(stats, paths, thresholds)).toBe("C");
  });

  it("routes large cross-cutting PRs to Tier D", () => {
    // PR #163: 30 files, 1588 lines, 41 commits — well above p90
    const stats = { changedFiles: 30, additions: 1512, deletions: 76, commits: 41 };
    const paths = [
      "src/index.ts",
      "tests/unit.test.ts",
      ".github/workflows/ci.yml",
      "scripts/ci/something.mjs",
      ".mnemonic/notes/decision.md",
    ];
    expect(routeTier(stats, paths, thresholds)).toBe("D");
  });

  it("routes PRs above p90 lines to Tier D", () => {
    const stats = { changedFiles: 5, additions: 1500, deletions: 200, commits: 3 };
    const paths = ["src/index.ts", "tests/unit.test.ts"];
    expect(routeTier(stats, paths, thresholds)).toBe("D");
  });

  it("semantic high + size B results in Tier C (at most +1 bump)", () => {
    // Small PR touching CI scripts — should bump B→C, not B→D
    const stats = { changedFiles: 2, additions: 50, deletions: 10, commits: 2 };
    const paths = ["scripts/ci/something.mjs", "tests/ci.test.ts"];
    expect(routeTier(stats, paths, thresholds)).toBe("C");
  });

  it("semantic high + size C results in Tier D", () => {
    // PR above p75 + high semantic = C+1 = D
    const stats = { changedFiles: 10, additions: 500, deletions: 100, commits: 10 };
    const paths = [
      "scripts/ci/something.mjs",
      "src/index.ts",
      "tests/unit.test.ts",
    ];
    expect(routeTier(stats, paths, thresholds)).toBe("D");
  });
});

// ---------------------------------------------------------------------------
// isWeakSummary
// ---------------------------------------------------------------------------

describe("isWeakSummary", () => {
  it("flags empty string as weak", () => {
    expect(isWeakSummary("")).toBe(true);
  });

  it("flags null/undefined as weak", () => {
    expect(isWeakSummary(null as unknown as string)).toBe(true);
    expect(isWeakSummary(undefined as unknown as string)).toBe(true);
  });

  it("flags text shorter than 80 chars as weak", () => {
    expect(isWeakSummary("Small change.")).toBe(true);
  });

  it("flags text containing vague phrases as weak", () => {
    const vague =
      "This PR contains various improvements to the codebase and fixes several issues across multiple files.";
    expect(isWeakSummary(vague)).toBe(true);
  });

  it("flags text with high file-reference ratio as weak", () => {
    const fileDump =
      "Changed index.ts, markdown.ts, semantic-patch.ts, structured-content.ts, migration.ts, vault.ts to update.";
    expect(isWeakSummary(fileDump)).toBe(true);
  });

  it("does not flag a substantive summary as weak", () => {
    const good =
      "Restructures the PR description generator to be RPIR-aware, separating permanent " +
      "decision notes from workflow artifacts and condensing the output to surface only " +
      "reviewer-relevant signal — preventing the 38k-char bloat seen in PR #184.";
    expect(isWeakSummary(good)).toBe(false);
  });

  it("does not flag a specific technical summary as weak", () => {
    const good =
      "Introduces relative percentile thresholds computed from recent PR history to route " +
      "description generation to one of four tiers, replacing hardcoded cutoffs and avoiding " +
      "unnecessary premium model usage for simple formula-bump PRs.";
    expect(isWeakSummary(good)).toBe(false);
  });
});
