#!/usr/bin/env node

/**
 * update-pr-description.mjs
 *
 * Reads `.mnemonic/notes/` files changed in a PR and generates a structured
 * PR title and description from their design decision content.
 *
 * Routing: fetches recent merged PR history at runtime to compute repo-relative
 * percentile thresholds, then routes to one of four tiers:
 *   A - trivial (formula bumps, lockfiles): deterministic minimal output
 *   B - normal: standard deterministic description
 *   C - complex (>p75 or medium semantic): deterministic + cheap AI enhancement attempt
 *   D - very complex (>p90 or high semantic): deterministic + AI with premium fallback
 *
 * All AI calls are optional — the script degrades to deterministic output if the
 * GitHub Models API is unavailable or returns a weak result.
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

// Fallback thresholds used when fewer than 5 historical PRs are available.
// Tuned conservatively for this repo's typical PR size distribution.
const CONSERVATIVE_DEFAULTS = {
  files: { p75: 10, p90: 25 },
  lines: { p75: 500, p90: 1500 },
  commits: { p75: 8, p90: 25 },
};

// GitHub Models API endpoint and model names.
const MODELS_API = "https://models.inference.ai.azure.com/chat/completions";
const MODEL_CHEAP = "gpt-4o-mini";
const MODEL_PREMIUM = "gpt-4o";

// System prompt for AI summary enhancement.
const AI_SYSTEM_PROMPT =
  "You are a senior engineer reviewing GitHub PRs. " +
  "Your only task is to improve the Summary paragraph of a PR description. " +
  "Rules: focus on WHAT changed and WHY (not HOW); be specific about components or decisions; " +
  "avoid vague phrases like 'various improvements' or 'several changes'; " +
  "do not list filenames or file extensions; keep it to 2–4 sentences. " +
  "Output ONLY the improved summary paragraph — no headers, no markdown formatting, no preamble.";

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

  // --- Step 1: Fetch PR files and size stats in one call ---
  const prData = fetchCurrentPrData(prNumber, repo, cwd);
  if (!prData) {
    process.stderr.write(`Error fetching PR data for PR #${prNumber}.\n`);
    process.exit(1);
  }
  const { changedFiles, prStats } = prData;

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

  // --- Step 2: Fetch PR history for calibration (read-only, in-memory) ---
  const history = fetchPrHistory(repo, cwd);
  const rawThresholds = computeThresholds(history);
  const thresholds = validateThresholds(rawThresholds);
  process.stdout.write(
    `Calibrated from ${history.length} historical PR(s): ` +
      `files p75=${thresholds.files.p75.toFixed(0)}/p90=${thresholds.files.p90.toFixed(0)}, ` +
      `lines p75=${thresholds.lines.p75.toFixed(0)}/p90=${thresholds.lines.p90.toFixed(0)}, ` +
      `commits p75=${thresholds.commits.p75.toFixed(0)}/p90=${thresholds.commits.p90.toFixed(0)}\n`,
  );
  if (history.length === 0) {
    process.stderr.write(
      "[history] 0 historical PRs returned — check the [history] lines above for the gh exit code and stderr.\n",
    );
  }

  // --- Step 3: Route to tier A / B / C / D ---
  const tier = routeTier(prStats, changedFiles, thresholds);
  process.stdout.write(`Tier ${tier} (${tierLabel(tier)}) — ${describeStats(prStats)}\n`);

  // --- Step 4: Read and parse notes ---
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

  // --- Step 5: Generate deterministic description ---
  const title = generateTitle(notes);
  let description = generateDescription(notes);

  // --- Step 6: Optional AI enhancement for Tier C and D ---
  if (tier === "C" || tier === "D") {
    const enhanced = await enhancedSummary(description, notes, tier);
    if (enhanced) {
      description = enhanced;
      process.stdout.write(`AI-enhanced Summary section applied.\n`);
    } else {
      process.stdout.write(`AI enhancement skipped or degraded to deterministic.\n`);
    }
  }

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

// =============================================================================
// PR STATS & HISTORY
// =============================================================================

/**
 * Fetches the current PR's changed file paths and size statistics in one gh call.
 * Returns null on failure so callers can handle gracefully.
 *
 * @returns {{ changedFiles: string[], prStats: PrStats } | null}
 */
function fetchCurrentPrData(prNumber, repo, cwd) {
  const result = spawnSync(
    "gh",
    [
      "pr", "view", prNumber,
      "--repo", repo,
      "--json", "files,additions,deletions,changedFiles,commits",
      "--jq",
      "{paths: [.files[].path], additions, deletions, changedFiles, commits: (.commits | length)}",
    ],
    { encoding: "utf-8", cwd },
  );

  if (result.status !== 0) {
    process.stderr.write(`Error fetching PR data: ${result.stderr}\n`);
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout.trim());
    return {
      changedFiles: parsed.paths ?? [],
      prStats: {
        changedFiles: parsed.changedFiles ?? 0,
        additions: parsed.additions ?? 0,
        deletions: parsed.deletions ?? 0,
        commits: parsed.commits ?? 0,
      },
    };
  } catch {
    process.stderr.write(`Error parsing PR data: ${result.stdout}\n`);
    return null;
  }
}

// Fields for the primary attempt (includes commits for full calibration).
const PR_HISTORY_FIELDS_FULL = "number,changedFiles,additions,deletions,commits";
// Fallback fields used when the primary attempt fails (commits may be unsupported).
const PR_HISTORY_FIELDS_FALLBACK = "number,changedFiles,additions,deletions";
// Maximum per-PR rejection messages to emit before switching to a summary line.
const PR_REJECTION_LOG_LIMIT = 5;

/**
 * Fetches recent merged PR history for percentile calibration.
 *
 * Strategy:
 *   1. Try `gh pr list --json changedFiles,additions,deletions,commits` (preferred).
 *   2. If that fails (e.g. `commits` unsupported in this gh version), retry without
 *      `commits` — commits data will be missing but size percentiles still work.
 *
 * All steps emit diagnostics to stderr so CI logs show exactly what happened.
 * Read-only — no files written. Returns empty array on any unrecoverable failure.
 *
 * @returns {Array<{changedFiles:number|null, additions:number|null, deletions:number|null, commits:number|null}>}
 */
function fetchPrHistory(repo, cwd) {
  const baseArgs = ["pr", "list", "--state", "merged", "--limit", "50", "--repo", repo];

  // --- Attempt 1: with commits field ---
  const fullArgs = [...baseArgs, "--json", PR_HISTORY_FIELDS_FULL];
  process.stderr.write(
    `[history] Running: gh ${fullArgs.join(" ")}\n`,
  );
  const fullResult = spawnSync("gh", fullArgs, { encoding: "utf-8", cwd });
  process.stderr.write(`[history] Exit code: ${fullResult.status}\n`);
  if (fullResult.stderr?.trim()) {
    process.stderr.write(`[history] stderr: ${fullResult.stderr.trim()}\n`);
  }

  let rawJson = null;
  let commitsIncluded = true;

  if (fullResult.status === 0) {
    rawJson = fullResult.stdout.trim();
  } else {
    // --- Attempt 2: without commits field (may not be supported in all gh versions) ---
    const fallbackArgs = [...baseArgs, "--json", PR_HISTORY_FIELDS_FALLBACK];
    process.stderr.write(
      `[history] Retrying without commits: gh ${fallbackArgs.join(" ")}\n`,
    );
    const fallbackResult = spawnSync("gh", fallbackArgs, { encoding: "utf-8", cwd });
    process.stderr.write(`[history] Retry exit code: ${fallbackResult.status}\n`);
    if (fallbackResult.stderr?.trim()) {
      process.stderr.write(`[history] Retry stderr: ${fallbackResult.stderr.trim()}\n`);
    }
    if (fallbackResult.status !== 0) {
      process.stderr.write("[history] Both gh pr list attempts failed. Cannot calibrate.\n");
      return [];
    }
    rawJson = fallbackResult.stdout.trim();
    commitsIncluded = false;
    process.stderr.write("[history] Using fallback fields (no commits data).\n");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    process.stderr.write(`[history] JSON parse error: ${err.message}\n`);
    process.stderr.write(`[history] Raw output (first 500 chars): ${rawJson.slice(0, 500)}\n`);
    return [];
  }

  if (!Array.isArray(parsed)) {
    process.stderr.write(
      `[history] Unexpected response shape (not an array). Keys: ${Object.keys(parsed ?? {}).join(", ")}\n`,
    );
    return [];
  }

  process.stderr.write(`[history] Raw PRs returned: ${parsed.length}\n`);

  if (parsed.length > 0) {
    process.stderr.write(
      `[history] Sample PR[0] keys: ${Object.keys(parsed[0]).join(", ")}\n`,
    );
    process.stderr.write(
      `[history] Sample PR[0] values: ${JSON.stringify(parsed[0])}\n`,
    );
  }

  // Map to metrics, logging why each PR is rejected.
  // Per-PR rejection messages are capped at PR_REJECTION_LOG_LIMIT to keep
  // logs readable for large histories; a summary line is emitted afterwards.
  let validCount = 0;
  let rejectionCount = 0;
  const mapped = parsed.map((pr, index) => {
    const changedFiles = typeof pr.changedFiles === "number" ? pr.changedFiles : null;
    const additions = typeof pr.additions === "number" ? pr.additions : null;
    const deletions = typeof pr.deletions === "number" ? pr.deletions : null;
    // GraphQL returns commits as an array of objects; extract the count.
    const commits = commitsIncluded
      ? (Array.isArray(pr.commits)
          ? pr.commits.length
          : typeof pr.commits === "number"
            ? pr.commits
            : null)
      : null;

    const missing = [];
    if (changedFiles === null) missing.push("changedFiles");
    if (additions === null) missing.push("additions");
    if (deletions === null) missing.push("deletions");
    if (commits === null && commitsIncluded) missing.push("commits");

    if (missing.length > 0) {
      rejectionCount += 1;
      if (rejectionCount <= PR_REJECTION_LOG_LIMIT) {
        process.stderr.write(
          `[history] PR[${index}] (#${pr.number ?? "?"}) rejected: missing ${missing.join(", ")}\n`,
        );
      }
    } else {
      validCount += 1;
    }

    return { changedFiles, additions, deletions, commits };
  });

  if (rejectionCount > PR_REJECTION_LOG_LIMIT) {
    process.stderr.write(
      `[history] ... and ${rejectionCount - PR_REJECTION_LOG_LIMIT} more rejected PR(s) (suppressed).\n`,
    );
  }

  process.stderr.write(`[history] PRs with valid metrics: ${validCount}/${parsed.length}\n`);

  if (validCount === 0 && parsed.length > 0) {
    process.stderr.write(
      "[history] WARNING: No PRs had valid metrics despite non-empty response. " +
        "Field names may not match what the gh CLI returns for this repo.\n",
    );
  }

  return mapped;
}

// =============================================================================
// CALIBRATION
// =============================================================================

/**
 * Computes a percentile value from an unsorted array using linear interpolation.
 * Non-finite values (NaN, Infinity) are excluded before sorting.
 * Returns 0 for an empty array.
 */
function percentile(values, p) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  const sorted = [...finite].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Computes p75/p90 thresholds from a history array.
 * Falls back to CONSERVATIVE_DEFAULTS when there are fewer than 5 data points.
 *
 * Missing (null/undefined) values are excluded rather than coerced to zero —
 * treating them as zero would collapse all thresholds and misclassify every PR
 * as oversized.
 *
 * @param {Array<{changedFiles:number|null, additions:number|null, deletions:number|null, commits:number|null}>} history
 * @returns {{ files: {p75:number,p90:number}, lines: {p75:number,p90:number}, commits: {p75:number,p90:number} }}
 */
export function computeThresholds(history) {
  if (history.length < 5) return CONSERVATIVE_DEFAULTS;

  const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

  const files = history.map((p) => p.changedFiles).filter(isFiniteNumber);
  // Both additions and deletions must be present to produce a meaningful total-lines
  // figure; entries where only one side is available are excluded to avoid under-counting.
  const lines = history
    .filter((p) => isFiniteNumber(p.additions) && isFiniteNumber(p.deletions))
    .map((p) => p.additions + p.deletions);
  const commits = history.map((p) => p.commits).filter(isFiniteNumber);

  // Fall back when the primary size dimensions (files and lines) lack enough valid
  // samples to produce reliable percentiles. Commits uses its own independent fallback
  // below so that a repo with commit data but missing file counts still works correctly.
  if (files.length < 5 || lines.length < 5) return CONSERVATIVE_DEFAULTS;

  return {
    files: { p75: percentile(files, 75), p90: percentile(files, 90) },
    lines: { p75: percentile(lines, 75), p90: percentile(lines, 90) },
    commits:
      commits.length >= 5
        ? { p75: percentile(commits, 75), p90: percentile(commits, 90) }
        : CONSERVATIVE_DEFAULTS.commits,
  };
}

/**
 * Validates that computed thresholds are realistic (non-zero for at least one
 * dimension). Returns CONSERVATIVE_DEFAULTS when all thresholds are zero,
 * which indicates a data extraction failure rather than a legitimate all-tiny
 * PR history.
 *
 * @param {{ files:{p75:number,p90:number}, lines:{p75:number,p90:number}, commits:{p75:number,p90:number} }} thresholds
 * @returns {{ files:{p75:number,p90:number}, lines:{p75:number,p90:number}, commits:{p75:number,p90:number} }}
 */
export function validateThresholds(thresholds) {
  const allZero =
    thresholds.files.p75 === 0 &&
    thresholds.files.p90 === 0 &&
    thresholds.lines.p75 === 0 &&
    thresholds.lines.p90 === 0 &&
    thresholds.commits.p75 === 0 &&
    thresholds.commits.p90 === 0;

  if (allZero) {
    process.stderr.write(
      "Warning: all calibration thresholds are zero — data extraction likely failed. " +
        "Falling back to conservative defaults.\n",
    );
    return CONSERVATIVE_DEFAULTS;
  }
  return thresholds;
}

// =============================================================================
// COMPLEXITY SCORING
// =============================================================================

/**
 * Scores the semantic complexity of a PR's changed file paths.
 *
 * Trivial patterns (formula-only, lockfile-only) return `isTrivial: true`.
 * Otherwise returns a complexity level based on how many distinct top-level
 * directories are touched and whether CI/workflow files are involved.
 *
 * @param {string[]} paths  Repository-relative file paths changed in the PR.
 * @returns {{ isTrivial: boolean, complexity: 'low'|'normal'|'medium'|'high' }}
 */
export function scoreSemanticPaths(paths) {
  // Exclude mnemonic notes — they're always present in this workflow and
  // should not inflate the complexity signal.
  const nonNotePaths = paths.filter((p) => !p.startsWith(".mnemonic/"));

  if (nonNotePaths.length === 0) {
    // Notes-only change: low complexity (notes are the content, not the code)
    return { isTrivial: false, complexity: "low" };
  }

  // Trivial: only automated/generated files with no code logic
  if (nonNotePaths.every((p) => p.startsWith("Formula/"))) {
    return { isTrivial: true, complexity: "low" };
  }
  if (
    nonNotePaths.every(
      (p) => p.endsWith("package-lock.json") || p.endsWith("package.json") || p.includes("lock"),
    )
  ) {
    return { isTrivial: true, complexity: "low" };
  }

  const topFolders = new Set(nonNotePaths.map((p) => p.split("/")[0]));
  const hasCiScripts = nonNotePaths.some((p) => p.startsWith("scripts/ci/"));
  const hasWorkflows = nonNotePaths.some((p) => p.startsWith(".github/workflows/"));
  const hasCore = nonNotePaths.some((p) => p.startsWith("src/"));
  const hasTests = nonNotePaths.some((p) => p.startsWith("tests/") || p.includes(".test."));
  const isDocsOnly = nonNotePaths.every((p) => p.endsWith(".md") || p.startsWith("docs/"));

  if (isDocsOnly) return { isTrivial: false, complexity: "low" };

  let score = 0;
  if (topFolders.size >= 3) score += 2;
  else if (topFolders.size >= 2) score += 1;
  if (hasCiScripts || hasWorkflows) score += 3;
  if (hasCore && hasTests) score += 1;

  if (score >= 4) return { isTrivial: false, complexity: "high" };
  if (score >= 2) return { isTrivial: false, complexity: "medium" };
  return { isTrivial: false, complexity: "normal" };
}

/**
 * Routes a PR to one of four tiers based on repo-relative size thresholds and
 * semantic path complexity.
 *
 * Tiers:
 *   A — trivial  : deterministic minimal output (formula bumps, lockfiles)
 *   B — normal   : standard deterministic description
 *   C — complex  : deterministic + cheap AI enhancement attempt
 *   D — very complex : deterministic + cheap AI, premium fallback on weak result
 *
 * Semantic complexity can raise the tier by at most one level relative to the
 * size-based tier, preventing small but cross-cutting PRs from jumping straight
 * to premium.
 *
 * @param {{ changedFiles:number, additions:number, deletions:number, commits:number }} stats
 * @param {string[]} changedPaths
 * @param {{ files:{p75:number,p90:number}, lines:{p75:number,p90:number}, commits:{p75:number,p90:number} }} thresholds
 * @returns {'A'|'B'|'C'|'D'}
 */
export function routeTier(stats, changedPaths, thresholds) {
  const { changedFiles, additions, deletions, commits } = stats;
  const totalLines = (additions ?? 0) + (deletions ?? 0);
  const semantic = scoreSemanticPaths(changedPaths);

  if (semantic.isTrivial) return "A";

  // Size-based tier (0=B, 1=C, 2=D)
  let sizeTier = 0;
  if (
    changedFiles > thresholds.files.p90 ||
    totalLines > thresholds.lines.p90 ||
    commits > thresholds.commits.p90
  ) {
    sizeTier = 2;
  } else if (
    changedFiles > thresholds.files.p75 ||
    totalLines > thresholds.lines.p75 ||
    commits > thresholds.commits.p75
  ) {
    sizeTier = 1;
  }

  // Semantic boost: only `high` complexity raises the tier (CI/workflow changes).
  // `medium` complexity (multi-folder code changes) does not bump — it reflects
  // breadth, not necessarily the need for AI enhancement.
  const boost = semantic.complexity === "high" ? 1 : 0;
  const effective = Math.min(2, sizeTier + boost);

  if (effective >= 2) return "D";
  if (effective >= 1) return "C";
  return "B";
}

// =============================================================================
// QUALITY GATE
// =============================================================================

// Phrases that indicate a vague or generic AI summary.
const WEAK_PHRASES = [
  "various improvements",
  "miscellaneous",
  "several changes",
  "some updates",
  "multiple files",
  "this pr",
  "todo",
  "[insert",
  "see changes",
  "no description",
  "overall improvements",
];

/**
 * Returns true when the given text is likely a weak or unhelpful AI summary.
 *
 * Checks for:
 * - Too short (< 80 chars)
 * - Known generic/vague phrases
 * - High ratio of file-extension references to words (file-dump pattern)
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isWeakSummary(text) {
  if (!text || text.trim().length < 80) return true;

  const lower = text.toLowerCase();
  if (WEAK_PHRASES.some((p) => lower.includes(p))) return true;

  // File-dump detection: more than 20% of tokens look like source filenames.
  // The pattern requires an alphabetic extension to avoid matching decimals (1.5)
  // or version strings (v1.2.3).
  const fileRefs = (text.match(/\b\w[\w-]*\.[a-z]{2,4}\b/g) ?? []).length;
  const wordCount = (text.match(/\b\w+\b/g) ?? []).length;
  if (wordCount > 0 && fileRefs / wordCount > 0.2) return true;

  return false;
}

// =============================================================================
// AI ENHANCEMENT
// =============================================================================

/**
 * Calls the GitHub Models API with the given prompt and model.
 * Returns the generated text or null on any error (network, auth, rate-limit).
 *
 * Uses `fetch` (Node 18+ built-in). Token comes from GH_TOKEN / GITHUB_TOKEN,
 * which GitHub Actions sets automatically — no extra secrets needed.
 *
 * @param {string} prompt
 * @param {string} model  GitHub Models model identifier
 * @returns {Promise<string|null>}
 */
async function fetchAiEnhancement(prompt, model) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(MODELS_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds the user-facing prompt for AI summary enhancement.
 *
 * @param {string} currentSummary  The deterministic summary text.
 * @param {string} noteContext     Condensed context from the changed notes.
 * @returns {string}
 */
function buildEnhancementPrompt(currentSummary, noteContext) {
  return (
    `Current summary:\n${currentSummary}\n\n` +
    `Context from design notes:\n${noteContext}\n\n` +
    "Write an improved summary paragraph (2–4 sentences, no headers, no markdown)."
  );
}

/**
 * Tries to improve the `## Summary` section of a generated description using AI.
 *
 * Strategy by tier:
 *   C — one attempt with the cheap model; fall back to deterministic if weak.
 *   D — cheap attempt first; if weak, one premium attempt; fall back if still weak.
 *
 * The rest of the description (Changes, Workflow Artifacts, etc.) is kept intact.
 * Returns null when no improvement was produced, so the caller can keep the original.
 *
 * @param {string} description     Full deterministic PR description.
 * @param {Array}  notes           Parsed note objects.
 * @param {'C'|'D'} tier
 * @returns {Promise<string|null>}
 */
async function enhancedSummary(description, notes, tier) {
  // Extract the existing summary content (between ## Summary and the next section)
  const summaryRe = /^(## Summary\s*\n\n)([\s\S]*?)(?=\n## |\n---\n|$)/m;
  const match = description.match(summaryRe);
  if (!match) return null;

  const currentSummary = match[2].trim();

  // Build condensed note context — permanent notes first, max 3, 400 chars each
  const permanent = sortNotesByPriority(notes.filter((n) => classifyNote(n) === "permanent"));
  const contextNotes = (permanent.length > 0 ? permanent : notes).slice(0, 3);
  const noteContext = contextNotes
    .map((n) => {
      const title = n.frontmatter.title ?? baseName(n.file);
      const snippet = n.body.slice(0, 400).replace(/\n+/g, " ").trim();
      return `[${title}] ${snippet}`;
    })
    .join("\n");

  const prompt = buildEnhancementPrompt(currentSummary, noteContext);

  // Try cheap model first
  const cheapResult = await fetchAiEnhancement(prompt, MODEL_CHEAP);
  if (cheapResult && !isWeakSummary(cheapResult)) {
    return description.replace(summaryRe, `## Summary\n\n${cheapResult}\n\n`);
  }

  // Tier D only: escalate to premium if cheap result was weak
  if (tier === "D") {
    const premiumResult = await fetchAiEnhancement(prompt, MODEL_PREMIUM);
    if (premiumResult && !isWeakSummary(premiumResult)) {
      return description.replace(summaryRe, `## Summary\n\n${premiumResult}\n\n`);
    }
  }

  return null;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Returns a human-readable label for a routing tier. */
function tierLabel(tier) {
  const map = { A: "trivial", B: "normal", C: "complex", D: "very complex" };
  return map[tier] ?? "unknown";
}

/** Returns a compact description of PR size statistics for logging. */
function describeStats(stats) {
  const { changedFiles, additions, deletions, commits } = stats;
  return `${changedFiles} file(s), +${additions}/-${deletions} lines, ${commits} commit(s)`;
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
    const groups = [
      ["Research", researchNotes],
      ["Plan", planNotes],
      ["Review", reviewNotes],
      ["Context", contextNotes],
    ];
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
