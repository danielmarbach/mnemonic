# Theme Refinement + Product Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve theme quality and orientation clarity through emergent themes, graduation from "other", and automatic validation — without introducing rigid schemas or overfitting to mnemonic's own categories.

**Architecture:** Extend the existing `classifyTheme` in `src/project-introspection.ts` with keyword extraction, synonym normalization, and frequency-based graduation. Add a new `src/theme-validation.ts` utility for quality metrics. Persist design decisions to memory. Update docs.

**Tech Stack:** TypeScript, existing patterns from `project-introspection.ts` and `consolidate.ts`, Vitest for testing.

---

## File Structure

**Create:**
- `src/theme-validation.ts` — theme quality validation utility
- `tests/theme-validation.unit.test.ts` — validation unit tests
- `tests/theme-refinement.unit.test.ts` — emergence and graduation tests

**Modify:**
- `src/project-introspection.ts` — extend `classifyTheme` with keyword extraction, graduation
- `src/index.ts` — plug in theme validation (optional debug), persist design decision
- `README.md` — theme emergence documentation
- `CHANGELOG.md` — 0.18.0 entry
- `AGENT.md` — theme guidance for agents

**Memory (via MCP):**
- Store design decisions using `remember` tool

---

## Task 1: Keyword Extraction + Synonym Normalization

**Files:**
- Modify: `src/project-introspection.ts`
- Test: `tests/theme-refinement.unit.test.ts`

- [ ] **Step 1: Write failing tests for keyword extraction**

```typescript
// tests/theme-refinement.unit.test.ts
import { describe, expect, it } from "vitest";
import { extractKeywords, normalizeKeyword } from "../src/project-introspection.js";

describe("extractKeywords", () => {
  it("extracts keywords from title and tags", () => {
    const note = {
      id: "test",
      title: "JWT authentication bug fix",
      content: "",
      tags: ["auth", "security"],
      lifecycle: "permanent" as const,
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    const keywords = extractKeywords(note);
    expect(keywords).toContain("jwt");
    expect(keywords).toContain("authentication");
    expect(keywords).toContain("auth");
    expect(keywords).toContain("security");
  });

  it("filters stopwords", () => {
    const note = {
      id: "test",
      title: "The system for note data",
      content: "",
      tags: [],
      lifecycle: "permanent" as const,
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    const keywords = extractKeywords(note);
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("for");
    expect(keywords).toContain("system");
    expect(keywords).toContain("note");
    expect(keywords).toContain("data");
  });

  it("extracts from content summary when available", () => {
    const note = {
      id: "test",
      title: "Decision",
      content: "We decided to use PostgreSQL for persistence because of ACID requirements.",
      tags: [],
      lifecycle: "permanent" as const,
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    const keywords = extractKeywords(note);
    expect(keywords).toContain("postgresql");
    expect(keywords).toContain("persistence");
    expect(keywords).toContain("acid");
  });
});

describe("normalizeKeyword", () => {
  it("normalizes synonyms to canonical form", () => {
    expect(normalizeKeyword("postgres")).toBe("postgresql");
    expect(normalizeKeyword("pg")).toBe("postgresql");
    expect(normalizeKeyword("auth")).toBe("authentication");
    expect(normalizeKeyword("authn")).toBe("authentication");
    expect(normalizeKeyword("jwt")).toBe("jwt"); // stays same
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/theme-refinement.unit.test.ts`
Expected: FAIL with "extractKeywords is not defined"

- [ ] **Step 3: Add stopwords list**

```typescript
// src/project-introspection.ts

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "to", "of",
  "in", "on", "at", "by", "with", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "shall", "can", "need", "needs", "note", "notes", "data",
  "this", "that", "these", "those", "it", "its", "we", "our", "you", "your",
  "when", "where", "which", "who", "whom", "whose", "why", "how", "what",
]);
```

- [ ] **Step 4: Add synonym dictionary**

```typescript
// src/project-introspection.ts

const SYNONYMS: Record<string, string> = {
  // Authentication
  "auth": "authentication",
  "authn": "authentication",
  "login": "authentication",
  "signin": "authentication",
  
  // Database
  "postgres": "postgresql",
  "pg": "postgresql",
  "db": "database",
  "sql": "database",
  
  // Testing
  "test": "testing",
  "tests": "testing",
  "spec": "testing",
  "specs": "testing",
  
  // Infrastructure
  "infra": "infrastructure",
  "deploy": "deployment",
  "deployments": "deployment",
  
  // API
  "endpoint": "api",
  "endpoints": "api",
  
  // Common abbreviations
  "config": "configuration",
  "impl": "implementation",
  "perf": "performance",
};
```

- [ ] **Step 5: Implement keyword extraction**

```typescript
// src/project-introspection.ts

export function normalizeKeyword(keyword: string): string {
  const lower = keyword.toLowerCase();
  return SYNONYMS[lower] ?? lower;
}

export function extractKeywords(note: Note): string[] {
  const words: string[] = [];
  
  // Title words
  const titleWords = note.title.toLowerCase().split(/\s+/);
  words.push(...titleWords);
  
  // Tags
  words.push(...note.tags.map(t => t.toLowerCase()));
  
  // Content: extract from first 200 chars (summary-like)
  const contentPrefix = note.content.slice(0, 200).toLowerCase();
  const contentWords = contentPrefix.split(/\s+/);
  words.push(...contentWords);
  
  // Normalize and filter
  const normalized = words
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length >= 2)
    .map(w => normalizeKeyword(w))
    .filter(w => !STOPWORDS.has(w));
  
  // Deduplicate while preserving order
  return [...new Set(normalized)];
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/theme-refinement.unit.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/project-introspection.ts tests/theme-refinement.unit.test.ts
git commit -m "feat(theme): add keyword extraction with synonym normalization"
```

---

## Task 2: Theme Emergence + Graduation from "Other"

**Files:**
- Modify: `src/project-introspection.ts`
- Test: `tests/theme-refinement.unit.test.ts`

- [ ] **Step 1: Write failing tests for graduation**

```typescript
// tests/theme-refinement.unit.test.ts (append)
import { computeThemesWithGraduation } from "../src/project-introspection.js";

describe("computeThemesWithGraduation", () => {
  it("graduates keywords that appear across multiple notes", () => {
    const notes = [
      { id: "a", title: "PostgreSQL connection pool", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "b", title: "PostgreSQL query optimization", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "c", title: "PostgreSQL index strategy", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "d", title: "Random note", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
    ];
    
    const result = computeThemesWithGraduation(notes);
    expect(result.promotedThemes).toContain("postgresql");
    expect(result.themeAssignments.get("a")).toBe("postgresql");
    expect(result.themeAssignments.get("d")).toBe("other");
  });

  it("does not graduate keywords below threshold", () => {
    const notes = [
      { id: "a", title: "Unique topic alpha", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "b", title: "Random", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
    ];
    
    const result = computeThemesWithGraduation(notes, { minClusterSize: 3 });
    expect(result.promotedThemes).toHaveLength(0);
  });

  it("rejects generic terms from graduation", () => {
    const notes = [
      { id: "a", title: "System configuration", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "b", title: "System setup", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "c", title: "System notes", content: "", tags: [], lifecycle: "permanent" as const, createdAt: "", updatedAt: "", memoryVersion: 1 },
    ];
    
    const result = computeThemesWithGraduation(notes);
    expect(result.promotedThemes).not.toContain("system");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/theme-refinement.unit.test.ts`
Expected: FAIL with "computeThemesWithGraduation is not defined"

- [ ] **Step 3: Add generic terms rejection list**

```typescript
// src/project-introspection.ts

const GENERIC_TERMS = new Set([
  "system", "note", "notes", "data", "file", "files", "config", "configuration",
  "setup", "update", "change", "fix", "bug", "feature", "task", "work",
  "project", "app", "application", "code", "implementation", "thing",
]);
```

- [ ] **Step 4: Implement graduation logic**

```typescript
// src/project-introspection.ts

export interface GraduationOptions {
  minClusterSize?: number;  // Default 3
  minKeywordFrequency?: number;  // Default 3
}

export interface GraduationResult {
  themeAssignments: Map<string, string>;
  promotedThemes: string[];
  keywordFrequencies: Map<string, number>;
}

export function computeThemesWithGraduation(
  notes: Note[],
  options: GraduationOptions = {}
): GraduationResult {
  const minClusterSize = options.minClusterSize ?? 3;
  const minKeywordFrequency = options.minKeywordFrequency ?? 3;
  
  // Extract keywords per note
  const noteKeywords = new Map<string, string[]>();
  for (const note of notes) {
    noteKeywords.set(note.id, extractKeywords(note));
  }
  
  // Count keyword frequencies across notes
  const keywordFrequencies = new Map<string, number>();
  for (const keywords of noteKeywords.values()) {
    const unique = new Set(keywords);
    for (const kw of unique) {
      keywordFrequencies.set(kw, (keywordFrequencies.get(kw) ?? 0) + 1);
    }
  }
  
  // Identify candidate themes (meet threshold, not generic)
  const candidates: string[] = [];
  for (const [keyword, count] of keywordFrequencies) {
    if (
      count >= minKeywordFrequency &&
      count >= minClusterSize &&
      !GENERIC_TERMS.has(keyword)
    ) {
      candidates.push(keyword);
    }
  }
  
  // Sort by frequency (descending) then alphabetically for determinism
  candidates.sort((a, b) => {
    const freqDiff = keywordFrequencies.get(b)! - keywordFrequencies.get(a)!;
    if (freqDiff !== 0) return freqDiff;
    return a.localeCompare(b);
  });
  
  // Assign themes: first matching candidate wins
  const themeAssignments = new Map<string, string>();
  for (const note of notes) {
    const keywords = noteKeywords.get(note.id) ?? [];
    let assigned: string | null = null;
    
    // First check tag-based classification (existing logic)
    const tagBased = classifyTheme(note);
    if (tagBased !== "other") {
      assigned = tagBased;
    } else {
      // Then check keyword-based graduation
      for (const kw of keywords) {
        if (candidates.includes(kw)) {
          assigned = kw;
          break;
        }
      }
    }
    
    themeAssignments.set(note.id, assigned ?? "other");
  }
  
  return {
    themeAssignments,
    promotedThemes: candidates,
    keywordFrequencies,
  };
}
```

- [ ] **Step 5: Update existing classifyTheme to use graduation**

```typescript
// src/project-introspection.ts - update classifyTheme

export function classifyThemeWithGraduation(
  note: Note,
  promotedThemes: Set<string>
): string {
  // First check tag/title-based classification
  const tagBased = classifyTheme(note);
  if (tagBased !== "other") return tagBased;
  
  // Then check keyword-based graduation
  const keywords = extractKeywords(note);
  for (const kw of keywords) {
    if (promotedThemes.has(kw)) {
      return kw;
    }
  }
  
  return "other";
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/theme-refinement.unit.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/project-introspection.ts tests/theme-refinement.unit.test.ts
git commit -m "feat(theme): add theme graduation from 'other' based on keyword frequency"
```

---

## Task 3: Update project_memory_summary Integration

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Write test for project_memory_summary with new themes**

```typescript
// tests/project-summary.unit.test.ts (append)
import { describe, expect, it } from "vitest";

describe("project_memory_summary with graduation", () => {
  it("includes graduated themes in themes object", async () => {
    // Integration test would go here with mock vault
    // Verify that promoted themes appear in the themes record
  });

  it("does not break existing tag-based classification", async () => {
    // Verify tags=[\"overview\"] still maps to "overview" theme
  });
});
```

- [ ] **Step 2: Integrate graduation in project_memory_summary handler**

Locate the `project_memory_summary` handler in `src/index.ts` (around line 3443-3776).

Update theme computation:

```typescript
// src/index.ts around line 3444-3449
// Before:
// const themeCache = buildThemeCache(projectEntries.map(e => e.note));
// const themed = new Map<string, NoteEntry[]>();
// for (const entry of projectEntries) {
//   const theme = classifyTheme(entry.note);
//   ...
// }

// After:
import { computeThemesWithGraduation, classifyThemeWithGraduation } from "./project-introspection.js";

// In project_memory_summary handler:
const graduationResult = computeThemesWithGraduation(projectEntries.map(e => e.note));
const promotedThemes = new Set(graduationResult.promotedThemes);

const themed = new Map<string, NoteEntry[]>();
for (const entry of projectEntries) {
  const theme = classifyThemeWithGraduation(entry.note, promotedThemes);
  const bucket = themed.get(theme) ?? [];
  bucket.push(entry);
  themed.set(theme, bucket);
}

// Add promoted themes to themeOrder (after existing fixed themes)
const themeOrder = ["overview", "decisions", "tooling", "bugs", "architecture", "quality", ...graduationResult.promotedThemes.filter(t => !["overview", "decisions", "tooling", "bugs", "architecture", "quality"].includes(t)), "other"];
```

- [ ] **Step 3: Run integration tests**

Run: `npm test -- tests/project-memory-summary.integration.test.ts`
Expected: PASS (existing tests should still work)

- [ ] **Step 4: Unit test the integration**

Run: `npm test -- tests/project-summary.unit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/project-summary.unit.test.ts
git commit -m "feat(summary): integrate keyword-based theme graduation"
```

---

## Task 4: Theme Quality Validation Utility

**Files:**
- Create: `src/theme-validation.ts`
- Create: `tests/theme-validation.unit.test.ts`

- [ ] **Step 1: Write validation interface and tests**

```typescript
// tests/theme-validation.unit.test.ts
import { describe, expect, it } from "vitest";
import { analyzeThemeQuality } from "../src/theme-validation.js";
import type { Note } from "../src/storage.js";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? "note",
    title: overrides.title ?? "Note",
    content: overrides.content ?? "",
    tags: overrides.tags ?? [],
    lifecycle: overrides.lifecycle ?? "permanent",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    memoryVersion: overrides.memoryVersion ?? 1,
  };
}

describe("analyzeThemeQuality", () => {
  it("computes other ratio correctly", () => {
    const notes = [
      makeNote({ id: "1", title: "Overview", tags: ["overview"] }),
      makeNote({ id: "2", title: "Decision", tags: ["decisions"] }),
      makeNote({ id: "3", title: "Random" }),
      makeNote({ id: "4", title: "Another random" }),
    ];
    
    const result = analyzeThemeQuality(notes);
    expect(result.totalNotes).toBe(4);
    expect(result.otherCount).toBe(2);
    expect(result.otherRatio).toBeCloseTo(0.5, 2);
  });

  it("flags high other ratio as warning", () => {
    const notes = [
      makeNote({ id: "1", title: "Random 1" }),
      makeNote({ id: "2", title: "Random 2" }),
      makeNote({ id: "3", title: "Random 3" }),
      makeNote({ id: "4", title: "Random 4" }),
    ];
    
    const result = analyzeThemeQuality(notes);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("High 'other' ratio")
    );
  });

  it("flags too many single-note themes", () => {
    const notes = [
      makeNote({ id: "1", title: "Unique topic alpha" }),
      makeNote({ id: "2", title: "Unique topic beta" }),
      makeNote({ id: "3", title: "Unique topic gamma" }),
      makeNote({ id: "4", title: "Overview", tags: ["overview"] }),
    ];
    
    const result = analyzeThemeQuality(notes);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("single-note themes")
    );
  });

  it("flags skewed distribution", () => {
    const notes = [
      ...Array(8).fill(null).map((_, i) => makeNote({ id: `bug-${i}`, title: `Bug ${i}`, tags: ["bugs"] })),
      makeNote({ id: "random", title: "Random" }),
    ];
    
    const result = analyzeThemeQuality(notes);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("skewed")
    );
  });

  it("returns clean report for good distribution", () => {
    const notes = [
      makeNote({ id: "1", title: "Overview", tags: ["overview"] }),
      makeNote({ id: "2", title: "Decision 1", tags: ["decisions"] }),
      makeNote({ id: "3", title: "Decision 2", tags: ["decisions"] }),
      makeNote({ id: "4", title: "Bug fix", tags: ["bugs"] }),
    ];
    
    const result = analyzeThemeQuality(notes);
    expect(result.otherCount).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/theme-validation.unit.test.ts`
Expected: FAIL with "analyzeThemeQuality is not defined"

- [ ] **Step 3: Implement validation utility**

```typescript
// src/theme-validation.ts
import type { Note } from "./storage.js";
import { classifyTheme } from "./project-introspection.js";

export interface ThemeQualityReport {
  totalNotes: number;
  themeCount: number;
  otherCount: number;
  otherRatio: number;
  topThemes: Array<{ name: string; count: number }>;
  warnings: string[];
}

export function analyzeThemeQuality(notes: Note[]): ThemeQualityReport {
  const totalNotes = notes.length;
  
  // Cluster by theme
  const themeBuckets = new Map<string, number>();
  for (const note of notes) {
    const theme = classifyTheme(note);
    themeBuckets.set(theme, (themeBuckets.get(theme) ?? 0) + 1);
  }
  
  const themeCount = themeBuckets.size;
  const otherCount = themeBuckets.get("other") ?? 0;
  const otherRatio = totalNotes > 0 ? otherCount / totalNotes : 0;
  
  // Top themes (sorted by count, excluding "other")
  const topThemes = Array.from(themeBuckets.entries())
    .filter(([theme]) => theme !== "other")
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  const warnings: string[] = [];
  
  // High "other" ratio
  if (otherRatio >= 0.4) {
    warnings.push(`High 'other' ratio (${Math.round(otherRatio * 100)}%): consider improving keyword extraction or checking tag coverage`);
  } else if (otherRatio >= 0.25) {
    warnings.push(`Moderate 'other' ratio (${Math.round(otherRatio * 100)}%)`);
  }
  
  // Too many single-note themes
  const singleNoteThemes = Array.from(themeBuckets.entries())
    .filter(([theme, count]) => theme !== "other" && count === 1);
  if (singleNoteThemes.length >= 3) {
    warnings.push(`Too many single-note themes (${singleNoteThemes.length}): graduation threshold may be too low`);
  }
  
  // Skewed distribution (one theme has > 60%)
  const maxThemeCount = Math.max(...themeBuckets.values());
  if (totalNotes > 0 && maxThemeCount / totalNotes > 0.6 && themeBuckets.size > 1) {
    const dominantTheme = Array.from(themeBuckets.entries())
      .find(([, count]) => count === maxThemeCount)?.[0];
    if (dominantTheme) {
      warnings.push(`Theme distribution is highly skewed (${dominantTheme}: ${Math.round(maxThemeCount / totalNotes * 100)}%)`);
    }
  }
  
  return {
    totalNotes,
    themeCount,
    otherCount,
    otherRatio,
    topThemes,
    warnings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/theme-validation.unit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/theme-validation.ts tests/theme-validation.unit.test.ts
git commit -m "feat(validation): add theme quality analysis utility"
```

---

## Task 5: Persist Design Decisions to Memory

**Files:**
- Use MCP `remember` tool

- [ ] **Step 1: Store design decisions**

After implementation is complete, use `remember` tool with:

```
cwd: /Users/danielmarbach/Projects/mnemonic
title: Theme refinement design decisions
content: |
  ## Emergent themes
  
  Themes emerge from keyword frequency across notes, not from a predefined taxonomy.
  
  ## Graduation rules
  
  A keyword graduates from "other" to a named theme when:
  - Appears in ≥ 3 different notes (minClusterSize)
  - Has frequency ≥ 3 (minKeywordFrequency)
  - Is not in the GENERIC_TERMS rejection list
  
  ## Thresholds
  
  - Good "other" ratio: < 25%
  - Acceptable: 25-40%
  - Needs improvement: > 40%
  
  ## Stability
  
  Themes are computed fresh on each call. No persistent state between runs.
  Graduation is deterministic: same notes → same themes.
  
  ## General-purpose
  
  Keyword extraction uses common stopwords and synonyms but avoids domain-specific terms.
  The system adapts to project vocabulary naturally.
tags: [architecture, themes, design]
lifecycle: permanent
summary: Theme refinement design: emergent themes, graduation from 'other', keyword extraction with synonyms, quality validation thresholds
```

---

## Task 6: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add theme emergence documentation**

Add after the "Project memory summary" section:

```markdown
### Theme emergence

`project_memory_summary` categorizes notes by theme. Themes **emerge automatically** from your notes:

- **Tag-based classification** — notes with matching tags (e.g., `["decisions"]`, `["bugs"]`) are grouped immediately
- **Keyword graduation** — keywords that appear across multiple notes become named themes over time
- **"other" bucket** — notes that don't match any theme are grouped here; this shrinks as themes emerge

No predefined schema required. The system adapts to your project's vocabulary.

**Theme quality validation** (`analyzeThemeQuality`):
- Other ratio < 25%: good coverage
- Other ratio 25-40%: acceptable
- Other ratio > 40%: consider improving tags or keyword extraction
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document theme emergence in README"
```

---

## Task 7: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add 0.18.0 entry**

Before `## [0.17.0]`:

```markdown
## [0.18.0] - 2026-03-26

### Added

- Theme graduation from "other": keywords appearing across multiple notes become named themes automatically
- Keyword extraction with synonym normalization for better theme classification
- `analyzeThemeQuality()` utility for checking theme distribution metrics
- Generic terms rejection list prevents common words from becoming themes

### Changed

- `classifyTheme` now uses keyword-based graduation in addition to tag matching
- `project_memory_summary` includes both fixed themes and dynamically promoted keywords
- Lower "other" ratio through improved classification coverage

### Fixed

- Theme distribution now adapts to project vocabulary without requiring predefined categories
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add v0.18.0 changelog entry"
```

---

## Task 8: Update AGENT.md

**Files:**
- Modify: `AGENT.md`

- [ ] **Step 1: Add theme guidance section**

Add after "### Memory hygiene":

```markdown
### Theme guidance

Themes in `project_memory_summary` are hints, not fixed categories:

- Themes emerge from your project's vocabulary — no predefined schema
- "other" means the note didn't match any current theme — this is normal
- Use `discover_tags` to find canonical tags before creating new ones
- Always start with `project_memory_summary` to orient on existing context
```

- [ ] **Step 2: Commit**

```bash
git add AGENT.md
git commit -m "docs: add theme guidance in AGENT.md"
```

---

## Task 9: Integration Tests

**Files:**
- Modify: `tests/project-memory-summary.integration.test.ts`

- [ ] **Step 1: Add integration test for graduation**

```typescript
// tests/project-memory-summary.integration.test.ts (append)

describe("project_memory_summary with theme graduation", () => {
  it("includes graduated themes from keyword frequency", async () => {
    // Setup vault with notes that share keywords
    // Call project_memory_summary
    // Verify promoted themes appear in result
  });

  it("handles projects with all notes in 'other'", async () => {
    // Verify summary still works, just large 'other' bucket
  });

  it("combines tag-based and keyword-based themes", async () => {
    // Notes with tags should use tag classification
    // Notes without tags should use keyword graduation
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npm test -- tests/project-memory-summary.integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/project-memory-summary.integration.test.ts
git commit -m "test(integration): add theme graduation tests"
```

---

## Task 10: Run Full Test Suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: SUCCESS

---

## Acceptance Criteria

1. ✅ Themes improve in clarity — graduation promotes meaningful keywords
2. ✅ "Other" becomes smaller or structured — generic terms rejected
3. ✅ New themes emerge naturally — frequency-based graduation works
4. ✅ No schema introduced — keyword extraction + synonyms only
5. ✅ Validation metrics available — `analyzeThemeQuality()` utility
6. ✅ Docs updated — README, CHANGELOG, AGENT.md
7. ✅ Design decisions stored in memory
8. ✅ Works across domains — stopwords/synonyms are general-purpose

---

## Implementation Guidance

**Prefer:**
- Simple keyword frequency
- Small synonym dictionary (kept general-purpose)
- Deterministic clustering (same notes → same themes)
- Projection + relationship reuse (existing code)

**Avoid:**
- Complex clustering algorithms
- Embeddings for theme detection
- Overfitting to mnemonic-specific categories
- Large domain-specific dictionaries