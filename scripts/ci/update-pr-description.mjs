#!/usr/bin/env node

/**
 * update-pr-description.mjs
 *
 * Reads `.mnemonic/notes/` files changed in a PR and generates a structured
 * PR title and description from their design decision content.
 *
 * Usage:
 *   node scripts/ci/update-pr-description.mjs --pr <number> --repo <owner/repo> [--head-sha <sha>] [--cwd <path>] [--dry-run]
 *
 * Flags:
 *   --head-sha  Fetch note file contents via GitHub API at this commit SHA instead of reading
 *               from the local filesystem. Use when the workflow checks out the base branch
 *               (trusted code) and needs to read notes from the PR head without checking out
 *               untrusted code.
 *   --dry-run   Print the generated title and description without updating the PR.
 *
 * Requires: gh CLI authenticated with pull-requests:write permission.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));

// Tag categories used to classify notes and drive summary generation.
const BUG_TAGS = ["bug", "bugs", "fix", "bugfix", "hotfix"];
const ENHANCEMENT_TAGS = ["enhancement", "feature"];

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export async function main() {
  const prNumber = requiredArg("pr");
  const repo = requiredArg("repo");
  const cwd = path.resolve(args.cwd ?? process.cwd());
  const dryRun = args["dry-run"] === true || args["dry-run"] === "true";
  // When provided, fetch note file contents via GitHub API at this SHA instead of reading
  // from the local checkout. This allows the workflow to run trusted base-branch code while
  // still reading note content from the PR head without checking out untrusted fork code.
  const headSha = typeof args["head-sha"] === "string" ? args["head-sha"] : null;

  // Get the list of files changed in the PR
  const result = spawnSync(
    "gh",
    ["pr", "view", prNumber, "--repo", repo, "--json", "files", "--jq", ".files[].path"],
    { encoding: "utf-8", cwd },
  );

  if (result.status !== 0) {
    process.stderr.write(`Error fetching PR files: ${result.stderr}\n`);
    process.exit(1);
  }

  const changedFiles = result.stdout.trim().split("\n").filter(Boolean);
  const noteFiles = changedFiles.filter(
    (f) => f.startsWith(".mnemonic/notes/") && f.endsWith(".md"),
  );

  if (noteFiles.length === 0) {
    process.stdout.write(
      `No mnemonic design decision notes changed in PR #${prNumber}. Skipping description update.\n`,
    );
    process.exit(0);
  }

  process.stdout.write(
    `Found ${noteFiles.length} mnemonic note(s) in PR #${prNumber}: ${noteFiles.join(", ")}\n`,
  );

  // Read and parse each changed note — via GitHub API if headSha is given, else from disk
  const notes = [];
  for (const noteFile of noteFiles) {
    try {
      const content = headSha
        ? await fetchFileViaApi(repo, noteFile, headSha, cwd)
        : await fs.readFile(path.join(cwd, noteFile), "utf-8");
      const { frontmatter, body } = parseFrontmatter(content);
      notes.push({ file: noteFile, frontmatter, body });
    } catch (err) {
      process.stderr.write(`Warning: Could not read ${noteFile}: ${err.message}\n`);
    }
  }

  if (notes.length === 0) {
    process.stdout.write("Could not read any mnemonic notes. Skipping description update.\n");
    process.exit(0);
  }

  // Generate the PR title and description from the notes
  const title = generateTitle(notes);
  const description = generateDescription(notes);

  if (dryRun) {
    process.stdout.write(`[dry-run] Would update PR #${prNumber} with:\n\n`);
    process.stdout.write(`Title: ${title}\n\n`);
    process.stdout.write(`Description:\n${description}\n`);
    return;
  }

  // Write description to a temp file to avoid shell quoting issues
  const tmpFile = path.join(cwd, `.pr-description-${Date.now()}-${process.pid}.tmp.md`);
  try {
    await fs.writeFile(tmpFile, description, "utf-8");

    const editResult = spawnSync(
      "gh",
      ["pr", "edit", prNumber, "--repo", repo, "--title", title, "--body-file", tmpFile],
      { encoding: "utf-8", cwd },
    );

    if (editResult.status !== 0) {
      process.stderr.write(`Error updating PR: ${editResult.stderr}\n`);
      process.exit(1);
    }
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }

  process.stdout.write(
    `Updated PR #${prNumber} title and description from ${notes.length} mnemonic note(s).\n`,
  );
  process.stdout.write(`Title: ${title}\n`);
}

export function generateTitle(notes) {
  if (notes.length === 1) {
    return notes[0].frontmatter.title ?? baseName(notes[0].file);
  }

  // Multiple notes: prefer bug/fix notes first (most actionable), then design/decision/architecture.
  const primary =
    notes.find((n) => hasAnyTag(n.frontmatter.tags, BUG_TAGS)) ??
    notes.find((n) => hasAnyTag(n.frontmatter.tags, ["decision", "design", "architecture"])) ??
    notes[0];

  return primary.frontmatter.title ?? baseName(primary.file);
}

/**
 * Classifies a note into its RPIR workflow role or 'permanent'.
 *
 * When the RPIR workflow skill is used, notes carry an explicit `role` field —
 * that is the authoritative signal. Notes without a role (or with lifecycle
 * 'permanent') are treated as permanent decision/design notes.
 * Unroled temporary notes (e.g. ad-hoc scaffolding) fall back to 'context'.
 *
 * @returns {'research'|'plan'|'review'|'context'|'permanent'}
 */
export function classifyNote(note) {
  const role = note.frontmatter.role;
  const lifecycle = note.frontmatter.lifecycle;

  if (role === "research") return "research";
  if (role === "plan") return "plan";
  if (role === "review") return "review";
  if (role === "context") return "context";
  if (lifecycle === "temporary") return "context"; // unroled temporary note
  return "permanent";
}

/**
 * Extracts the first complete sentence from a block of text.
 * Skips leading headings; falls back to the first line.
 */
function extractFirstSentence(text) {
  // Strip any leading heading line
  const clean = text.replace(/^#+\s[^\n]*\n?/, "").trim();
  const match = clean.match(/^(.*?[.!?])(?:\s|$)/s);
  return match ? match[1].trim() : clean.split("\n")[0].trim();
}

/**
 * Extracts the content of a named section (level-2+ heading) from a note body.
 * Uses case-insensitive matching. Returns trimmed content, or null if not found.
 *
 * @param {string} body           - Note body markdown
 * @param {string} headingPattern - Case-insensitive regex alternation, e.g. "open questions?|risks?"
 */
function extractNamedSection(body, headingPattern) {
  const lines = body.split("\n");
  const headingRe = new RegExp(`^#{2,}\\s+(?:${headingPattern})\\s*$`, "i");
  const anyHeadingRe = /^#{2,}\s/;
  let inSection = false;
  const sectionLines = [];

  for (const line of lines) {
    if (headingRe.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (anyHeadingRe.test(line)) break;
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n").trim() || null;
}

export function generateDescription(notes) {
  const lines = [];

  // Classify notes into permanent decisions vs RPIR workflow artifacts.
  const sortedPermanent = sortNotesByPriority(
    notes.filter((n) => classifyNote(n) === "permanent"),
  );
  const researchNotes = notes.filter((n) => classifyNote(n) === "research");
  const planNotes = notes.filter((n) => classifyNote(n) === "plan");
  const reviewNotes = notes.filter((n) => classifyNote(n) === "review");
  const contextNotes = notes.filter((n) => classifyNote(n) === "context");
  const workflowNotes = [...researchNotes, ...planNotes, ...reviewNotes, ...contextNotes];

  // --------------------------------------------------------------------------
  // ## Summary
  // --------------------------------------------------------------------------
  lines.push("## Summary", "");

  if (notes.length === 1) {
    const note = notes[0];
    // Workflow notes get a one-sentence summary; permanent notes get the full leading paragraph.
    const summary =
      classifyNote(note) === "permanent"
        ? extractLeadingSummary(note.body)
        : extractFirstSentence(extractLeadingSummary(note.body));
    lines.push(summary);
  } else if (sortedPermanent.length > 0) {
    const hasBugs = sortedPermanent.some((n) => hasAnyTag(n.frontmatter.tags, BUG_TAGS));
    const hasEnhancements = sortedPermanent.some((n) =>
      hasAnyTag(n.frontmatter.tags, ENHANCEMENT_TAGS),
    );
    lines.push(buildSummaryIntro(hasBugs, hasEnhancements), "");
    for (const note of sortedPermanent) {
      lines.push(`- **${note.frontmatter.title ?? baseName(note.file)}**`);
    }
  } else {
    // Only workflow notes — lead with the plan note if available, else first note.
    const primary = planNotes[0] ?? notes[0];
    lines.push(extractLeadingSummary(primary.body));
  }

  lines.push("");

  // --------------------------------------------------------------------------
  // ## Changes  (permanent notes, condensed — one leading paragraph each)
  // Only rendered for multi-note PRs so single-note PRs aren't redundant.
  // --------------------------------------------------------------------------
  if (sortedPermanent.length > 0 && notes.length > 1) {
    lines.push("## Changes", "");
    for (const note of sortedPermanent) {
      const title = note.frontmatter.title ?? baseName(note.file);
      const tags = normalizeTags(note.frontmatter.tags);
      lines.push(`### ${title}`, "");
      if (tags.length > 0) {
        lines.push(`**Tags:** ${tags.join(", ")}`, "");
      }
      lines.push(extractLeadingSummary(note.body), "");
    }
  }

  // --------------------------------------------------------------------------
  // ## Workflow Artifacts  (RPIR notes — title + first sentence only)
  // --------------------------------------------------------------------------
  if (workflowNotes.length > 0) {
    lines.push("## Workflow Artifacts", "");
    const groups = /** @type {[string, typeof notes][]} */ ([
      ["Research", researchNotes],
      ["Plan", planNotes],
      ["Review", reviewNotes],
      ["Context", contextNotes],
    ]);
    for (const [label, group] of groups) {
      if (group.length === 0) continue;
      lines.push(`**${label}:**`, "");
      for (const note of group) {
        const title = note.frontmatter.title ?? baseName(note.file);
        const summary = extractFirstSentence(extractLeadingSummary(note.body));
        lines.push(`- ${title} — ${summary}`);
      }
      lines.push("");
    }
  }

  // --------------------------------------------------------------------------
  // ## Open Questions  (extracted from any note that has that section)
  // --------------------------------------------------------------------------
  const openQFragments = [];
  for (const note of notes) {
    const content = extractNamedSection(note.body, "open questions?|risks?");
    if (content) {
      const title = note.frontmatter.title ?? baseName(note.file);
      openQFragments.push(
        openQFragments.length > 0
          ? `**${title}:**\n\n${content}`
          : content,
      );
    }
  }
  if (openQFragments.length > 0) {
    lines.push("## Open Questions", "", openQFragments.join("\n\n"), "");
  }

  // --------------------------------------------------------------------------
  // ## Notes / References
  // --------------------------------------------------------------------------
  lines.push("## Notes / References", "");
  lines.push("_Detailed notes in `.mnemonic/notes/`:_", "");
  for (const note of sortNotesByPriority(notes)) {
    const title = note.frontmatter.title ?? baseName(note.file);
    const cls = classifyNote(note);
    const label = cls !== "permanent" ? ` _(${cls})_` : "";
    lines.push(`- \`${note.file}\` — ${title}${label}`);
  }

  lines.push("");
  lines.push("---", "");
  lines.push(
    `_Generated from ${notes.length} design decision note(s) in \`.mnemonic/notes/\`. Run \`/update-pr\` to regenerate._`,
  );

  return lines.join("\n");
}

/**
 * Returns notes sorted by priority: bug/fix first, then enhancements,
 * then design/decision/architecture, then everything else.
 * Stable sort — notes within the same priority retain their original order.
 */
export function sortNotesByPriority(notes) {
  const priority = (note) => {
    if (hasAnyTag(note.frontmatter.tags, BUG_TAGS)) return 0;
    if (hasAnyTag(note.frontmatter.tags, ENHANCEMENT_TAGS)) return 1;
    if (hasAnyTag(note.frontmatter.tags, ["decision", "design", "architecture"])) return 2;
    return 3;
  };
  return [...notes].sort((a, b) => priority(a) - priority(b));
}

/**
 * Builds the opening line of the multi-note Summary section based on
 * the types of notes present in the PR.
 */
export function buildSummaryIntro(hasBugs, hasEnhancements) {
  if (hasBugs && hasEnhancements) return "This PR fixes bugs and adds enhancements:";
  if (hasBugs) return "This PR fixes the following issues:";
  if (hasEnhancements) return "This PR adds the following enhancements:";
  return "This PR captures the following design decisions:";
}

/**
 * Extracts the first substantive paragraph or sentence block from a note body
 * to use as a one-paragraph PR summary.
 */
function extractLeadingSummary(body) {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // Skip heading-only paragraphs; return first paragraph with actual prose
  for (const para of paragraphs) {
    if (!para.startsWith("#")) {
      return para;
    }
  }
  return paragraphs[0] ?? "";
}

/**
 * Fetches a file's content from a GitHub repository at a specific commit SHA
 * using the `gh` CLI, avoiding the need to check out the PR head.
 *
 * @param {string} repo     - "owner/repo" format
 * @param {string} filePath - repository-relative path (e.g. ".mnemonic/notes/foo.md")
 * @param {string} sha      - commit SHA to read from
 * @param {string} cwd      - working directory for the `gh` invocation
 */
async function fetchFileViaApi(repo, filePath, sha, cwd) {
  const result = spawnSync(
    "gh",
    ["api", `repos/${repo}/contents/${filePath}?ref=${sha}`, "--jq", ".content"],
    { encoding: "utf-8", cwd },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() ?? `gh api failed for ${filePath}`);
  }
  // GitHub API returns base64-encoded content; decode it
  const base64 = result.stdout.trim().replace(/\\n/g, "").replace(/"/g, "");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Parses the YAML frontmatter and markdown body from a mnemonic note file.
 * Handles the specific YAML subset used by mnemonic (no external dependency needed).
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  return {
    frontmatter: parseSimpleYaml(match[1]),
    body: match[2],
  };
}

/**
 * Minimal YAML parser for mnemonic frontmatter.
 * Handles scalar values, single-quoted strings, flat arrays (- item),
 * and folded/literal block scalars (>- and |).
 */
function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split("\n");
  let currentKey = null;
  // "block" mode: collecting indented lines for a block scalar (>- or |)
  let blockMode = null; // null | "folded" | "literal"
  let blockLines = [];

  function flushBlock() {
    if (currentKey === null || blockMode === null) return;
    const text = blockMode === "folded"
      ? blockLines.join(" ").trim()
      : blockLines.join("\n").trimEnd();
    result[currentKey] = text;
    blockMode = null;
    blockLines = [];
  }

  for (const line of lines) {
    if (blockMode !== null) {
      if (/^ {2}/.test(line) || line === "") {
        // Still inside the block scalar — collect the content (strip leading 2-space indent)
        blockLines.push(line.replace(/^ {2}/, ""));
        continue;
      }
      // A non-indented line ends the block scalar
      flushBlock();
    }

    if (/^ {2}- /.test(line)) {
      // Array item under the current key
      if (currentKey !== null && Array.isArray(result[currentKey])) {
        result[currentKey].push(line.slice(4).trim());
      }
    } else if (/^[a-zA-Z_]/.test(line)) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawValue = line.slice(colonIdx + 1).trim();
      if (rawValue === ">-" || rawValue === ">") {
        // Folded block scalar — collect following indented lines
        result[key] = "";
        currentKey = key;
        blockMode = "folded";
        blockLines = [];
      } else if (rawValue === "|-" || rawValue === "|") {
        // Literal block scalar — collect following indented lines
        result[key] = "";
        currentKey = key;
        blockMode = "literal";
        blockLines = [];
      } else if (rawValue === "") {
        result[key] = [];
        currentKey = key;
      } else {
        // Strip surrounding single or double quotes
        result[key] = rawValue.replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
        currentKey = key;
      }
    }
  }

  // Flush any trailing block scalar
  flushBlock();

  return result;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string" && tags) return [tags];
  return [];
}

function hasAnyTag(tags, targetTags) {
  const normalized = normalizeTags(tags);
  return targetTags.some((t) => normalized.includes(t));
}

function baseName(file) {
  return path.basename(file, ".md");
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      // Only consume the next token as a value if it exists and is not itself a flag
      if (next !== undefined && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

function requiredArg(name) {
  const value = args[name];
  if (!value) {
    process.stderr.write(`Error: --${name} is required\n`);
    process.exit(1);
  }
  return String(value);
}
