# Session-Start Orientation: Enhanced project_memory_summary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `project_memory_summary` into a first-class, cheap, deterministic entrypoint that returns themed notes, recent changes, anchor notes, and optional related global notes — without requiring centroid computation or mandatory embeddings.

**Architecture:** Thematic-first curation with scoring functions for within-theme ranking and anchor selection. Embeddings used only for optional related global notes, computed lazily from anchor embeddings (not centroid). All scoring is deterministic and cheap.

**Tech Stack:** TypeScript, existing Vault/Storage abstractions, Zod schemas, structured-content types.

---

## File Structure

| File | Purpose |
|------|---------|
| `src/structured-content.ts` | Add new output types for ProjectSummaryResult |
| `src/project-introspection.ts` | Add scoring functions: theme classification, anchor scoring, global similarity |
| `src/index.ts` | Update project_memory_summary tool implementation |
| `src/__tests__/project-introspection.test.ts` | Test scoring functions |
| `src/__tests__/project-summary.test.ts` | Unit tests for anchor and scoring logic |

---

## Breaking Changes

**Schema change for `ProjectSummaryResult.themes`:**
- Old: `Record<string, number>` (count only)
- New: `Record<string, ThemeSection>` (count + examples with id/title/updatedAt)

This is a breaking change for clients consuming structured content. The text output remains backward-compatible, but code parsing structured content will need to access `themes[theme].count` instead of `themes[theme]` directly.

---

### Task 1: Update structured-content types

**Files:**
- Modify: `src/structured-content.ts`

- [ ] **Step 1: Add ThemeSection interface**

Add after existing interfaces near the ProjectSummaryResult definition:

```typescript
export interface ThemeSection {
  count: number;
  examples: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
}

export interface AnchorNote {
  id: string;
  title: string;
  centrality: number;
  connectionDiversity: number;
  updatedAt: string;
}

export interface RecentNote {
  id: string;
  title: string;
  updatedAt: string;
  theme: string;
}

export interface RelatedGlobalNote {
  id: string;
  title: string;
  similarity: number;
  preview: string;
}

export interface ProjectSummaryNotes {
  total: number;
  projectVault: number;
  mainVault: number;
  privateProject: number;
}

export interface ProjectSummaryResult {
  action: "project_summary_shown";
  project: { id: string; name: string };
  notes: ProjectSummaryNotes;
  themes: Record<string, ThemeSection>;
  recent: RecentNote[];
  anchors: AnchorNote[];
  relatedGlobal?: {
    notes: RelatedGlobalNote[];
    computedAt: string;
  };
}
```

- [ ] **Step 2: Update ProjectSummaryResultSchema**

Replace the existing schema with:

```typescript
export const ThemeSectionSchema = z.object({
  count: z.number(),
  examples: z.array(z.object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.string(),
  })),
});

export const AnchorNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  centrality: z.number(),
  connectionDiversity: z.number(),
  updatedAt: z.string(),
});

export const RecentNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  theme: z.string(),
});

export const RelatedGlobalNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  similarity: z.number(),
  preview: z.string(),
});

export const ProjectSummaryNotesSchema = z.object({
  total: z.number(),
  projectVault: z.number(),
  mainVault: z.number(),
  privateProject: z.number(),
});

export const ProjectSummaryResultSchema = z.object({
  action: z.literal("project_summary_shown"),
  project: z.object({
    id: z.string(),
    name: z.string(),
  }),
  notes: ProjectSummaryNotesSchema,
  themes: z.record(z.string(), ThemeSectionSchema),
  recent: z.array(RecentNoteSchema),
  anchors: z.array(AnchorNoteSchema),
  relatedGlobal: z.object({
    notes: z.array(RelatedGlobalNoteSchema),
    computedAt: z.string(),
  }).optional(),
});
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Pass with new types

- [ ] **Step 4: Commit types**

```bash
git add src/structured-content.ts
git commit -m "feat(types): add session-orientation types for project summary"
```

---

### Task 2: Add scoring functions to project-introspection.ts

**Files:**
- Modify: `src/project-introspection.ts`
- Create: `src/__tests__/project-introspection.test.ts`

- [ ] **Step 1: Import Note type**

Add at top of `src/project-introspection.ts`:

```typescript
import type { Note } from "./storage.js";
```

- [ ] **Step 2: Add helper: days since update**

```typescript
export function daysSinceUpdate(updatedAt: string): number {
  const updated = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 3: Add recency score (inverted)**

```typescript
export function recencyScore(daysSince: number): number {
  // Recent = higher score. Inverted: 1.0 at day 0, decaying to ~0 over time.
  // Cap at 30 days for within-theme ranking
  const capped = Math.min(daysSince, 30);
  return 1.0 - (capped / 30);
}
```

- [ ] **Step 4: Add centrality bonus (log-scaled)**

```typescript
export function centralityBonus(relatedCount: number): number {
  // Log-scaled, capped at 0.2
  // log(relatedTo.count + 1) * 0.1, capped
  return Math.min(0.2, Math.log(relatedCount + 1) * 0.1);
}
```

- [ ] **Step 5: Add within-theme ranking score**

```typescript
export function withinThemeScore(note: Note): number {
  const days = daysSinceUpdate(note.updatedAt);
  const recency = recencyScore(days);
  const centrality = centralityBonus(note.relatedTo?.length ?? 0);
  return recency + centrality;
}
```

- [ ] **Step 6: Add anchor score**

```typescript
export function anchorScore(
  note: Note,
  themeCache: Map<string, string>
): number {
  // Filter: must be permanent
  if (note.lifecycle !== "permanent") return -Infinity;

  const days = daysSinceUpdate(note.updatedAt);
  const recency = 1.0 / (1 + days / 7); // decays over weeks
  
  const centrality = Math.log((note.relatedTo?.length ?? 0) + 1);
  
  // Count distinct themes of related notes (need to compute from cache)
  const connectionDiversity = computeConnectionDiversity(note, themeCache);
  
  return 0.4 * centrality + 0.4 * connectionDiversity + 0.2 * recency;
}

function computeConnectionDiversity(
  note: Note,
  themeCache: Map<string, string>
): number {
  if (!note.relatedTo || note.relatedTo.length === 0) return 0;
  
  const themes = new Set<string>();
  for (const rel of note.relatedTo) {
    const theme = themeCache.get(rel.id);
    if (theme) themes.add(theme);
  }
  return themes.size;
}
```

- [ ] **Step 7: Add theme classification cache builder**

Add to existing `classifyTheme` function's context:

```typescript
export function buildThemeCache(notes: Note[]): Map<string, string> {
  const cache = new Map<string, string>();
  for (const note of notes) {
    cache.set(note.id, classifyTheme(note));
  }
  return cache;
}
```

- [ ] **Step 8: Write failing tests for scoring functions**

Create `src/__tests__/project-introspection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  daysSinceUpdate,
  recencyScore,
  centralityBonus,
  withinThemeScore,
  anchorScore,
  buildThemeCache,
  classifyTheme,
} from "../project-introspection.js";
import type { Note } from "../storage.js";

describe("daysSinceUpdate", () => {
  it("returns 0 for now", () => {
    const now = new Date().toISOString();
    expect(daysSinceUpdate(now)).toBeCloseTo(0, 1);
  });

  it("returns correct days for past date", () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSinceUpdate(sevenDaysAgo)).toBeCloseTo(7, 1);
  });
});

describe("recencyScore", () => {
  it("returns 1.0 for day 0", () => {
    expect(recencyScore(0)).toBe(1.0);
  });

  it("returns 0 for day 30+", () => {
    expect(recencyScore(30)).toBe(0);
    expect(recencyScore(100)).toBe(0);
  });

  it("decays linearly between 0 and 30", () => {
    expect(recencyScore(15)).toBeCloseTo(0.5, 2);
    expect(recencyScore(7)).toBeCloseTo(0.77, 1);
  });
});

describe("centralityBonus", () => {
  it("returns 0 for 0 connections", () => {
    expect(centralityBonus(0)).toBeCloseTo(0, 2);
  });

  it("uses log scaling", () => {
    expect(centralityBonus(3)).toBeCloseTo(Math.log(4) * 0.1, 3);
  });

  it("caps at 0.2", () => {
    expect(centralityBonus(100)).toBe(0.2);
    expect(centralityBonus(1000)).toBe(0.2);
  });
});

describe("withinThemeScore", () => {
  it("combines recency and centrality", () => {
    const note: Note = {
      id: "test-1",
      title: "Test",
      content: "Content",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memoryVersion: 1,
      relatedTo: [{ id: "other-1", type: "related-to" }],
    };
    
    // Recent note with 1 connection: ~1.0 (recency) + ~0.1 (log(2) * 0.1)
    const score = withinThemeScore(note);
    expect(score).toBeGreaterThan(1.0);
    expect(score).toBeLessThan(1.3);
  });
});

describe("anchorScore", () => {
  it("returns -Infinity for temporary notes", () => {
    const note: Note = {
      id: "temp-1",
      title: "Temp",
      content: "Content",
      tags: [],
      lifecycle: "temporary",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memoryVersion: 1,
    };
    
    const cache = new Map();
    expect(anchorScore(note, cache)).toBe(-Infinity);
  });

  it("scores permanent notes with connections", () => {
    const note: Note = {
      id: "anchor-1",
      title: "Anchor",
      content: "Content",
      tags: [],
      lifecycle: "permanent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memoryVersion: 1,
      relatedTo: [
        { id: "note-1", type: "related-to" },
        { id: "note-2", type: "related-to" },
      ],
    };
    
    const cache = new Map([
      ["note-1", "decisions"],
      ["note-2", "architecture"],
    ]);
    
    const score = anchorScore(note, cache);
    expect(score).toBeGreaterThan(0);
  });
});

describe("classifyTheme", () => {
  it("classifies overview notes", () => {
    const note: Note = {
      id: "test",
      title: "Project Overview",
      content: "",
      tags: ["overview"],
      lifecycle: "permanent",
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    expect(classifyTheme(note)).toBe("overview");
  });

  it("classifies by tags", () => {
    const note: Note = {
      id: "test",
      title: "Some Decision",
      content: "",
      tags: ["decisions"],
      lifecycle: "permanent",
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    expect(classifyTheme(note)).toBe("decisions");
  });

  it("defaults to other", () => {
    const note: Note = {
      id: "test",
      title: "Random Note",
      content: "",
      tags: [],
      lifecycle: "permanent",
      createdAt: "",
      updatedAt: "",
      memoryVersion: 1,
    };
    expect(classifyTheme(note)).toBe("other");
  });
});

describe("buildThemeCache", () => {
  it("maps note ids to themes", () => {
    const notes: Note[] = [
      { id: "a", title: "Overview", content: "", tags: ["overview"], lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1 },
      { id: "b", title: "Bug Fix", content: "", tags: ["bugs"], lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1 },
    ];
    
    const cache = buildThemeCache(notes);
    expect(cache.get("a")).toBe("overview");
    expect(cache.get("b")).toBe("bugs");
  });
});
```

- [ ] **Step 9: Run tests, expect failure**

Run: `npm run test -- project-introspection.test.ts`
Expected: FAIL (function not exported yet)

- [ ] **Step 10: Implementation already done in steps 1-7**

All functions are now exported from the file.

- [ ] **Step 11: Run tests, expect pass**

Run: `npm run test -- project-introspection.test.ts`
Expected: PASS

- [ ] **Step 12: Commit scoring functions**

```bash
git add src/project-introspection.ts src/__tests__/project-introspection.test.ts
git commit -m "feat(introspection): add scoring functions for session-orientation"
```

---

### Task 3: Update project_memory_summary tool implementation

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add new imports**

Add after existing imports from `./project-introspection.js`:

```typescript
import {
  classifyTheme,
  summarizePreview,
  titleCaseTheme,
  daysSinceUpdate,
  recencyScore,
  withinThemeScore,
  anchorScore,
  buildThemeCache,
  computeConnectionDiversity,
} from "./project-introspection.js";
```

**Note:** `computeConnectionDiversity` is defined in Task 2, Step 6 and exported from project-introspection.ts.

- [ ] **Step 2: Update inputSchema for project_memory_summary**

Add `includeRelatedGlobal` parameter:

```typescript
inputSchema: z.object({
  cwd: z.string().describe("..."),
  maxPerTheme: z.number().int().min(1).max(5).optional().default(3),
  recentLimit: z.number().int().min(1).max(10).optional().default(5),
  anchorLimit: z.number().int().min(1).max(10).optional().default(5),
  includeRelatedGlobal: z.boolean().optional().default(false),
  relatedGlobalLimit: z.number().int().min(1).max(5).optional().default(3),
}),
```

- [ ] **Step 3: Rewrite the handler logic**

Replace the handler implementation (lines ~3040-3120) with:

```typescript
async ({ cwd, maxPerTheme, recentLimit, anchorLimit, includeRelatedGlobal, relatedGlobalLimit }) => {
  await ensureBranchSynced(cwd);

  const { project, entries } = await collectVisibleNotes(cwd, "all");
  if (!project) {
    return { content: [{ type: "text", text: `Could not detect a project for: ${cwd}` }], isError: true };
  }
  if (entries.length === 0) {
    const structuredContent: ProjectSummaryResult = {
      action: "project_summary_shown",
      project: { id: project.id, name: project.name },
      notes: { total: 0, projectVault: 0, mainVault: 0, privateProject: 0 },
      themes: {},
      recent: [],
      anchors: [],
    };
    return { content: [{ type: "text", text: `No memories found for project ${project.name}.` }], structuredContent };
  }

  const policyLine = await formatProjectPolicyLine(project.id);
  
  // Build theme cache for connection diversity scoring
  const themeCache = buildThemeCache(entries.map(e => e.note));
  
  // Categorize by theme
  const themed = new Map<string, NoteEntry[]>();
  for (const entry of entries) {
    const theme = classifyTheme(entry.note);
    const bucket = themed.get(theme) ?? [];
    bucket.push(entry);
    themed.set(theme, bucket);
  }

  // Theme order for display
  const themeOrder = ["overview", "decisions", "tooling", "bugs", "architecture", "quality", "other"];
  
  // Calculate notes distribution
  const projectVaultCount = entries.filter(e => e.vault.isProject).length;
  const mainVaultCount = entries.length - projectVaultCount;
  const mainVaultProjectEntries = entries.filter(
    e => !e.vault.isProject && e.note.project === project.id
  );
  
  // Build output sections
  const sections: string[] = [];
  sections.push(`Project summary: **${project.name}**`);
  sections.push(`- id: \`${project.id}\``);
  sections.push(`- ${policyLine.replace(/^Policy:\s*/, "policy: ")}`);
  sections.push(`- memories: ${entries.length} (project-vault: ${projectVaultCount}, main-vault: ${mainVaultCount})`);
  if (mainVaultProjectEntries.length > 0) {
    sections.push(`- private project memories: ${mainVaultProjectEntries.length}`);
  }

  const themes: Record<string, ThemeSection> = {};
  for (const theme of themeOrder) {
    const bucket = themed.get(theme);
    if (!bucket || bucket.length === 0) continue;
    
    // Sort by within-theme score
    const sorted = [...bucket].sort((a, b) => 
      withinThemeScore(b.note) - withinThemeScore(a.note)
    );
    const top = sorted.slice(0, maxPerTheme);
    
    sections.push(`\n${titleCaseTheme(theme)}:`);
    sections.push(...top.map(e => `- ${e.note.title} (\`${e.note.id}\`)`));
    
    themes[theme] = {
      count: bucket.length,
      examples: top.map(e => ({
        id: e.note.id,
        title: e.note.title,
        updatedAt: e.note.updatedAt,
      })),
    };
  }

  // Recent notes (project-scoped only)
  const projectEntries = entries.filter(e => 
    e.note.project === project.id || e.vault.isProject
  );
  const recent = [...projectEntries]
    .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
    .slice(0, recentLimit);
  
  sections.push(`\nRecent:`);
  sections.push(...recent.map(e => `- ${e.note.updatedAt} — ${e.note.title}`));

  // Anchor notes with diversity constraint
  const anchorCandidates = entries
    .filter(e => e.note.lifecycle === "permanent" && (e.note.relatedTo?.length ?? 0) > 0)
    .map(e => ({
      entry: e,
      score: anchorScore(e.note, themeCache),
      theme: classifyTheme(e.note),
    }))
    .filter(x => x.score > -Infinity)
    .sort((a, b) => b.score - a.score);

  // Enforce max 2 per theme
  const anchorThemeCounts = new Map<string, number>();
  const anchors: AnchorNote[] = [];
  const taggedAnchors: AnchorNote[] = [];
  
  for (const candidate of anchorCandidates) {
    const theme = candidate.theme;
    const themeCount = anchorThemeCounts.get(theme) ?? 0;
    
    // Check for anchor/alwaysLoad tags
    const isTagged = candidate.entry.note.tags.some(t => 
      t.toLowerCase() === "anchor" || t.toLowerCase() === "alwaysload"
    );
    
    if (isTagged && taggedAnchors.length < 10) {
      taggedAnchors.push({
        id: candidate.entry.note.id,
        title: candidate.entry.note.title,
        centrality: candidate.entry.note.relatedTo?.length ?? 0,
        connectionDiversity: computeConnectionDiversity(candidate.entry.note, themeCache),
        updatedAt: candidate.entry.note.updatedAt,
      });
      continue;
    }
    
    if (themeCount >= 2) continue;
    if (anchors.length >= anchorLimit) break;
    
    anchors.push({
      id: candidate.entry.note.id,
      title: candidate.entry.note.title,
      centrality: candidate.entry.note.relatedTo?.length ?? 0,
      connectionDiversity: computeConnectionDiversity(candidate.entry.note, themeCache),
      updatedAt: candidate.entry.note.updatedAt,
    });
    
    anchorThemeCounts.set(theme, themeCount + 1);
  }
  
  // Combine scored anchors with tagged anchors, dedupe
  const anchorIds = new Set(anchors.map(a => a.id));
  for (const tagged of taggedAnchors) {
    if (!anchorIds.has(tagged.id) && anchors.length < 10) {
      anchors.push(tagged);
      anchorIds.add(tagged.id);
    }
  }

  if (anchors.length > 0) {
    sections.push(`\nAnchors:`);
    sections.push(...anchors.slice(0, 5).map(a => 
      `- ${a.title} (\`${a.id}\`) — centrality: ${a.centrality}, diversity: ${a.connectionDiversity}`
    ));
  }

  // Related global notes (optional, anchor-based similarity)
  let relatedGlobal: ProjectSummaryResult["relatedGlobal"];
  
  if (includeRelatedGlobal) {
    const anchorEmbeddings = await Promise.all(
      anchors.slice(0, 5).map(async a => {
        for (const vault of vaultManager.allKnownVaults()) {
          const emb = await vault.storage.readEmbedding(a.id);
          if (emb) return { id: a.id, embedding: emb.embedding };
        }
        return null;
      })
    );
    
    const validAnchors = anchorEmbeddings.filter((e): e is NonNullable<typeof e> => e !== null);
    
    if (validAnchors.length > 0) {
      // Get global notes (not project-scoped)
      const globalEntries = entries.filter(e => !e.note.project);
      const globalCandidates: Array<{ id: string; title: string; similarity: number; preview: string }> = [];
      
      for (const entry of globalEntries) {
        const emb = await entry.vault.storage.readEmbedding(entry.note.id);
        if (!emb) continue;
        
        // Find max similarity to any anchor
        let maxSim = 0;
        for (const anchor of validAnchors) {
          const sim = cosineSimilarity(anchor.embedding, emb.embedding);
          if (sim > maxSim) maxSim = sim;
        }
        
        if (maxSim > 0.4) {
          globalCandidates.push({
            id: entry.note.id,
            title: entry.note.title,
            similarity: maxSim,
            preview: summarizePreview(entry.note.content, 100),
          });
        }
      }
      
      globalCandidates.sort((a, b) => b.similarity - a.similarity);
      
      if (globalCandidates.length > 0) {
        relatedGlobal = {
          notes: globalCandidates.slice(0, relatedGlobalLimit),
          computedAt: new Date().toISOString(),
        };
        
        sections.push(`\nRelated Global:`);
        sections.push(...relatedGlobal.notes.map(n => 
          `- ${n.title} (\`${n.id}\`) — similarity: ${n.similarity.toFixed(2)}`
        ));
      }
    }
  }

  const structuredContent: ProjectSummaryResult = {
    action: "project_summary_shown",
    project: { id: project.id, name: project.name },
    notes: {
      total: entries.length,
      projectVault: projectVaultCount,
      mainVault: mainVaultCount,
      privateProject: mainVaultProjectEntries.length,
    },
    themes,
    recent: recent.map(e => ({
      id: e.note.id,
      title: e.note.title,
      updatedAt: e.note.updatedAt,
      theme: classifyTheme(e.note),
    })),
    anchors,
    relatedGlobal,
  };

  return { content: [{ type: "text", text: sections.join("\n") }], structuredContent };
}
```

- [ ] **Step 4: Import Note type at top of project-introspection.ts**

Ensure `Note` is imported (already done in Task 2, Step 1):

```typescript
import type { Note } from "./storage.js";
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: Pass

- [ ] **Step 7: Run all tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 8: Commit implementation**

```bash
git add src/index.ts src/project-introspection.ts
git commit -m "feat(project_memory_summary): add anchors, themed scoring, optional global notes"
```

---

### Task 4: Add integration tests

**Files:**
- Create: `src/__tests__/project-summary.test.ts`

**Note:** This task provides placeholder integration tests. The scoring functions are already tested in Task 2. Full integration tests would require MCP client infrastructure and are deferred to manual verification in Task 3, Step 7.

- [ ] **Step 1: Create placeholder test file**

Create `src/__tests__/project-summary.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  withinThemeScore,
  anchorScore,
  computeConnectionDiversity,
  buildThemeCache,
  classifyTheme,
} from "../project-introspection.js";
import type { Note } from "../storage.js";

// Integration tests for project_memory_summary scoring logic.
// Full MCP-tool integration tests would require client infrastructure.
// Core scoring functions are tested in project-introspection.test.ts

describe("project_memory_summary scoring integration", () => {
  describe("within-theme ordering", () => {
    it("ranks recent notes higher than old notes with same connections", () => {
      const now = new Date().toISOString();
      const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const recentNote: Note = {
        id: "recent", title: "Recent", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [{ id: "other", type: "related-to" }],
      };
      
      const oldNote: Note = {
        id: "old", title: "Old", content: "", tags: [],
        lifecycle: "permanent", createdAt: old, updatedAt: old, memoryVersion: 1,
        relatedTo: [{ id: "other", type: "related-to" }],
      };
      
      expect(withinThemeScore(recentNote)).toBeGreaterThan(withinThemeScore(oldNote));
    });
  });

  describe("anchor selection", () => {
    it("rejects temporary notes", () => {
      const tempNote: Note = {
        id: "temp", title: "Temp", content: "", tags: [],
        lifecycle: "temporary", createdAt: "", updatedAt: "", memoryVersion: 1,
        relatedTo: [{ id: "other", type: "related-to" }],
      };
      
      const cache = new Map([["other", "decisions"]]);
      expect(anchorScore(tempNote, cache)).toBe(-Infinity);
    });

    it("scores diverse connections higher", () => {
      const now = new Date().toISOString();
      const diverseNote: Note = {
        id: "diverse", title: "Diverse", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      };
      
      const narrowNote: Note = {
        id: "narrow", title: "Narrow", content: "", tags: [],
        lifecycle: "permanent", createdAt: now, updatedAt: now, memoryVersion: 1,
        relatedTo: [
          { id: "x", type: "related-to" },
          { id: "y", type: "related-to" },
          { id: "z", type: "related-to" },
        ],
      };
      
      const diverseCache = new Map([
        ["a", "decisions"],
        ["b", "architecture"],
        ["c", "tooling"],
      ]);
      
      const narrowCache = new Map([
        ["x", "decisions"],
        ["y", "decisions"],
        ["z", "decisions"],
      ]);
      
      const diverseScore = anchorScore(diverseNote, diverseCache);
      const narrowScore = anchorScore(narrowNote, narrowCache);
      
      expect(diverseScore).toBeGreaterThan(narrowScore);
    });
  });

  describe("connection diversity", () => {
    it("counts distinct themes of related notes", () => {
      const note: Note = {
        id: "test", title: "Test", content: "", tags: [],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
        relatedTo: [
          { id: "a", type: "related-to" },
          { id: "b", type: "related-to" },
          { id: "c", type: "related-to" },
        ],
      };
      
      const cache = new Map([
        ["a", "decisions"],
        ["b", "architecture"],
        ["c", "decisions"],
      ]);
      
      expect(computeConnectionDiversity(note, cache)).toBe(2);
    });

    it("returns 0 for notes without relationships", () => {
      const note: Note = {
        id: "test", title: "Test", content: "", tags: [],
        lifecycle: "permanent", createdAt: "", updatedAt: "", memoryVersion: 1,
      };
      
      const cache = new Map();
      expect(computeConnectionDiversity(note, cache)).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- project-summary.test.ts`
Expected: PASS (unit tests for scoring functions pass)

- [ ] **Step 3: Commit tests**

```bash
git add src/__tests__/project-summary.test.ts
git commit -m "test(project-summary): add unit tests for anchor and scoring logic"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `README.md` or `docs/tools.md` (if exists)

- [ ] **Step 1: Update tool description**

Update `project_memory_summary` description to document new output format and parameters.

- [ ] **Step 2: Commit docs**

```bash
git add README.md docs/tools.md
git commit -m "docs: update project_memory_summary with session-orientation features"
```

---

## Verification

After all tasks complete:

1. Run `npm run typecheck` - must pass
2. Run `npm run test` - all tests pass
3. Manual test: call `project_memory_summary` with `includeRelatedGlobal: true` and verify output structure