import { describe, expect, it, beforeEach, vi } from "vitest";

import { isoDateString, memoryId } from "../src/brands.js";
import {
  buildRecallCandidateContext,
  collectLexicalCandidates,
  computeRecallDiversity,
  computeRecallRetrievalCoverage,
} from "../src/tools/recall-helpers.js";
import { buildProjection } from "../src/projections.js";
import { analyzeNoteContent } from "../src/role-suggestions.js";
import {
  invalidateActiveProjectCache,
  getOrBuildVaultNoteList,
  getSessionCachedProjection,
  setSessionCachedProjection,
} from "../src/cache.js";
import type { Note, NoteLifecycle, NoteMetadata } from "../src/storage.js";
import type { NoteContentSignals, NoteProjection } from "../src/structured-content.js";
import type { Vault } from "../src/vault.js";

describe("buildRecallCandidateContext equivalence", () => {
  const NOW = isoDateString("2026-04-20T00:00:00.000Z");

  // A rich full note exercising inferred role + importance, headings, lists,
  // body length >= 400, and relationships.
  function richNote(): Note {
    return {
      id: memoryId("n1"),
      title: "Recall signal persistence",
      tags: ["recall", "projections"],
      lifecycle: "permanent",
      content: `
## Overview

This note documents how the recall pipeline persists body-derived structural signals so
that steady-state metadata-only reads reproduce the exact ranking the system produced when
it still loaded full note bodies. The change keeps embedding text stable while making the
derived projection the single source of truth for structural scoring.

## Background

Previously every recall cached full notes and derived the suggested role, the suggested
importance, and the structure score directly from the body content. The metadata split
removed the body from the cached corpus, so those structural signals disappeared from the
recall ranking entirely.

## Design

- Persist NoteContentSignals in the derived NoteProjection
- Keep the field optional so legacy projection files remain readable
- Rebuild legacy projections lazily once, then serve metadata plus signals
- Preserve projectionText and embedding identity exactly

## Trade-offs

- Pro: no full-corpus hydration on steady-state recall
- Pro: old projections migrate without a database migration
- Con: first recall after upgrade reads each note body once
- Con: derived projections must be kept in sync with the body
`.trim(),
      relatedTo: [
        { id: memoryId("r1"), type: "explains" as const },
        { id: memoryId("r2"), type: "supersedes" as const },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  beforeEach(() => {
    invalidateActiveProjectCache();
  });

  it("equals full-note context when metadata is paired with projection contentSignals", () => {
    const note = richNote();
    const projection = buildProjection(note);
    const { content: _, ...metadata } = note;

    expect(buildRecallCandidateContext(metadata, projection.contentSignals)).toEqual(
      buildRecallCandidateContext(note),
    );
  });

  it("derives an inferred role, importance, and non-zero structureScore from the rich note", () => {
    const note = richNote();
    const context = buildRecallCandidateContext(note);
    expect(context.metadata.role).toBeDefined();
    expect(context.metadata.importance).toBeDefined();
    expect(context.metadata.roleSource).toBe("suggested");
    expect(context.metadata.importanceSource).toBe("suggested");
    expect(context.structureScore).toBeGreaterThan(0);
    expect(context.relatedCount).toBe(2);
  });

  it("uses persisted signals for structure scoring instead of reading the body", () => {
    const note = richNote();
    const metadata = { ...note } as NoteMetadata;
    // metadata-only view of the note (no content field)
    const signals = analyzeNoteContent(note.content);
    const context = buildRecallCandidateContext(metadata, signals);
    expect(context.structureScore).toBe(
      Math.min(
        0.04,
        (signals.hasSubheading ? 0.02 : 0) +
          (signals.hasListMarker ? 0.01 : 0) +
          (signals.hasAtLeast400Characters ? 0.01 : 0),
      ),
    );
  });
});

describe("collectLexicalCandidates projection I/O behavior", () => {
  const NOW = isoDateString("2026-04-20T00:00:00.000Z");

  const signals: NoteContentSignals = {
    headingCount: 2,
    bulletCount: 4,
    checklistCount: 0,
    numberedCount: 0,
    colonPairCount: 0,
    tableRowCount: 0,
    paragraphCount: 2,
    shortLineCount: 2,
    hasSubheading: true,
    hasListMarker: true,
    hasAtLeast400Characters: false,
  };

  function projectionFor(id: string, opts: { legacy?: boolean } = {}): NoteProjection {
    const p: NoteProjection = {
      noteId: id,
      title: "Shared Note",
      summary: "shared summary about test recall",
      headings: ["Overview", "Design"],
      tags: [],
      lifecycle: "permanent",
      updatedAt: NOW,
      projectionText: "Title: Shared Note\nSummary: shared summary about test recall",
      generatedAt: NOW,
      contentSignals: signals,
    };
    if (opts.legacy) {
      delete p.contentSignals;
    }
    return p;
  }

  function metadataNote(id: string, project: string): NoteMetadata {
    return {
      id: memoryId(id),
      title: "Shared Note",
      tags: [],
      lifecycle: "permanent",
      project,
      relatedTo: [{ id: memoryId("r1"), type: "explains" as const }],
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  // Full note used when a legacy projection forces a body read + rebuild.
  function fullNote(id: string, project: string): Note {
    return {
      ...metadataNote(id, project),
      content:
        "## Overview\n\nShared summary about test recall and projections.\n\n- one\n- two\n- three\n- four",
    };
  }

  function makeVault(
    vaultPath: string,
    provenance: Vault["provenance"],
    notes: NoteMetadata[],
    readProjection: () => NoteProjection | null,
    readNoteImpl?: () => Note | null,
  ): {
    vault: Vault;
    readNote: ReturnType<typeof vi.fn>;
    writeProjection: ReturnType<typeof vi.fn>;
    readProjection: ReturnType<typeof vi.fn>;
  } {
    const readNote = readNoteImpl
      ? vi.fn().mockImplementation(async () => readNoteImpl())
      : vi.fn().mockResolvedValue(null);
    const writeProjection = vi.fn().mockResolvedValue(undefined);
    const readProjectionMock = vi.fn().mockImplementation(readProjection);
    const storage = {
      vaultPath,
      notesDir: `${vaultPath}/notes`,
      embeddingsDir: `${vaultPath}/embeddings`,
      projectionsDir: `${vaultPath}/projections`,
      init: vi.fn(),
      listNotes: vi.fn(),
      listNotesMetadata: vi.fn().mockResolvedValue(notes),
      listEmbeddings: vi.fn().mockResolvedValue([]),
      readNote,
      readNoteMetadata: vi.fn(),
      writeNote: vi.fn(),
      deleteNote: vi.fn(),
      readEmbedding: vi.fn(),
      writeEmbedding: vi.fn(),
      readProjection: readProjectionMock,
      writeProjection,
    } as unknown as Vault["storage"];
    return {
      vault: {
        storage,
        git: {} as Vault["git"],
        provenance,
        notesRelDir: ".mnemonic/notes",
        vaultFolderName: ".mnemonic",
        writable: true,
      } as unknown as Vault,
      readNote,
      writeProjection,
      readProjection: readProjectionMock,
    };
  }

  beforeEach(() => {
    invalidateActiveProjectCache();
  });

  it("metadata plus a current projection with signals does not call readNote()", async () => {
    const note = metadataNote("n1", "p");
    const { vault, readNote, writeProjection } = makeVault(
      "/vault/local",
      "project-local",
      [note],
      () => projectionFor("n1"),
    );

    await collectLexicalCandidates(
      [vault],
      "shared test recall",
      undefined,
      { id: "p", name: "P" },
      "project",
      undefined,
      undefined,
      [],
    );

    expect(readNote).not.toHaveBeenCalled();
    expect(writeProjection).not.toHaveBeenCalled();
  });

  it("a legacy projection causes one full read and one projection rebuild", async () => {
    const note = metadataNote("n1", "p");
    const { vault, readNote, writeProjection } = makeVault(
      "/vault/local",
      "project-local",
      [note],
      () => projectionFor("n1", { legacy: true }),
      () => fullNote("n1", "p"),
    );

    await collectLexicalCandidates(
      [vault],
      "shared test recall",
      undefined,
      { id: "p", name: "P" },
      "project",
      undefined,
      undefined,
      [],
    );

    expect(readNote).toHaveBeenCalledTimes(1);
    expect(writeProjection).toHaveBeenCalledTimes(1);
  });

  it("a second recall reuses the migrated projection without another full read", async () => {
    const note = metadataNote("n1", "p");
    const { vault, readNote, writeProjection } = makeVault(
      "/vault/local",
      "project-local",
      [note],
      () => projectionFor("n1", { legacy: true }),
      () => fullNote("n1", "p"),
    );

    await collectLexicalCandidates(
      [vault],
      "shared test recall",
      undefined,
      { id: "p", name: "P" },
      "project",
      undefined,
      undefined,
      [],
    );
    await collectLexicalCandidates(
      [vault],
      "shared test recall",
      undefined,
      { id: "p", name: "P" },
      "project",
      undefined,
      undefined,
      [],
    );

    expect(readNote).toHaveBeenCalledTimes(1);
    expect(writeProjection).toHaveBeenCalledTimes(1);
  });

  it("replaces a stale cached projection so the next recall avoids a body read", async () => {
    const note = metadataNote("n1", "p");
    // A projection whose updatedAt predates the note (e.g. after a
    // relationship-only update bumps the note timestamp).
    const staleFullNote = fullNote("n1", "p");
    const freshProjection = buildProjection(staleFullNote);
    const stale = { ...freshProjection, updatedAt: "2026-01-01T00:00:00.000Z" };

    const { vault, readNote } = makeVault(
      "/vault/local",
      "project-local",
      [note],
      () => stale,
      () => staleFullNote,
    );

    // Build the vault cache first so the seed below takes effect —
    // setSessionCachedProjection is a no-op until an active cache exists for
    // the project.
    await getOrBuildVaultNoteList("p", vault);

    // Seed the session cache with the stale projection so the recall hits the
    // "cached projection exists but is stale" path.
    setSessionCachedProjection("p", "/vault/local", "n1", stale);

    await collectLexicalCandidates(
      [vault],
      "shared test recall",
      undefined,
      { id: "p", name: "P" },
      "project",
      undefined,
      undefined,
      [],
    );
    await collectLexicalCandidates(
      [vault],
      "shared test recall",
      undefined,
      { id: "p", name: "P" },
      "project",
      undefined,
      undefined,
      [],
    );

    // First recall hydrates once to rebuild; the rebuilt projection is written
    // back to the session cache so the second recall reuses it without a read.
    expect(readNote).toHaveBeenCalledTimes(1);

    const cached = getSessionCachedProjection("p", "/vault/local", "n1");
    expect(cached).toBeDefined();
    expect(cached!.updatedAt).toBe(note.updatedAt);
  });

  it("attached and local metadata produce identical candidate context with the same signals", async () => {
    const localNote = metadataNote("n1", "p");
    const attachedNote = metadataNote("n1", "attached-slug");
    const local = makeVault("/vault/local", "project-local", [localNote], () =>
      projectionFor("n1"),
    );
    const attached = makeVault("/vault/attached", "project-attached", [attachedNote], () =>
      projectionFor("n1"),
    );

    const results = await collectLexicalCandidates(
      [local.vault, attached.vault],
      "shared test recall",
      undefined,
      { id: "p", name: "P" },
      "project",
      undefined,
      undefined,
      [],
    );

    const localCandidate = results.find((c) => c.identityKey!.startsWith("/vault/local::"));
    const attachedCandidate = results.find((c) => c.identityKey!.startsWith("/vault/attached::"));
    expect(localCandidate).toBeDefined();
    expect(attachedCandidate).toBeDefined();
    expect(localCandidate!.metadata).toEqual(attachedCandidate!.metadata);
    expect(localCandidate!.metadataPrior).toBe(attachedCandidate!.metadataPrior);
    expect(localCandidate!.structureScore).toBe(attachedCandidate!.structureScore);
    expect(localCandidate!.relatedCount).toBe(attachedCandidate!.relatedCount);
    expect(localCandidate!.connectionDiversity).toBe(attachedCandidate!.connectionDiversity);
  });
});

describe("computeRecallDiversity", () => {
  it("returns diversity metrics from recall results", async () => {
    const results = [
      {
        id: "a",
        tags: ["workflow", "plan"],
        lifecycle: "temporary" as NoteLifecycle,
        role: "plan",
      },
      {
        id: "b",
        tags: ["workflow", "decision"],
        lifecycle: "permanent" as NoteLifecycle,
        role: "decision",
      },
      { id: "c", tags: ["bug"], lifecycle: "temporary" as NoteLifecycle, role: "context" },
    ];
    const diversity = await computeRecallDiversity(results);
    expect(diversity).toBeDefined();
    expect(diversity!.themeCount).toBe(4);
    expect(diversity!.roleMix).toEqual({ plan: 1, decision: 1, context: 1 });
    expect(diversity!.lifecycleMix).toEqual({ temporary: 2, permanent: 1 });
  });

  it("counts unique tags across all results", async () => {
    const results = [
      { id: "a", tags: ["x", "y"], lifecycle: "permanent" as NoteLifecycle, role: "summary" },
      { id: "b", tags: ["y", "z"], lifecycle: "permanent" as NoteLifecycle, role: "summary" },
    ];
    const diversity = await computeRecallDiversity(results);
    expect(diversity!.themeCount).toBe(3);
  });

  it("omits role when undefined", async () => {
    const results = [{ id: "a", tags: ["test"], lifecycle: "temporary" as NoteLifecycle }];
    const diversity = await computeRecallDiversity(results);
    expect(diversity!.roleMix).toEqual({});
    expect(diversity!.lifecycleMix).toEqual({ temporary: 1 });
  });

  it("returns undefined on computation failure", async () => {
    const results = null as unknown as Array<{
      id: string;
      tags: string[];
      lifecycle: NoteLifecycle;
      role?: string;
    }>;
    const diversity = await computeRecallDiversity(results);
    expect(diversity).toBeUndefined();
  });

  it("returns empty diversity for empty results", async () => {
    const diversity = await computeRecallDiversity([]);
    expect(diversity).toBeDefined();
    expect(diversity!.themeCount).toBe(0);
    expect(diversity!.roleMix).toEqual({});
    expect(diversity!.lifecycleMix).toEqual({});
  });
});

describe("computeRecallRetrievalCoverage", () => {
  it("computes coverage fraction for anchors in results", async () => {
    const anchorIds = new Set(["a1", "a2", "a3"]);
    const anchorLookup = new Map([
      ["a1", "Anchor One"],
      ["a2", "Anchor Two"],
      ["a3", "Anchor Three"],
    ]);
    const resultIds = ["a1", "other", "a3"];

    const coverage = await computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage).toBeDefined();
    expect(coverage!.anchorsInResults).toBe(2);
    expect(coverage!.highPriorityAnchorsTotal).toBe(3);
    expect(coverage!.fraction).toBeCloseTo(2 / 3);
    expect(coverage!.missingAnchors).toEqual([{ id: "a2", title: "Anchor Two" }]);
  });

  it("returns fraction 0 when no anchors exist", async () => {
    const anchorIds = new Set<string>();
    const anchorLookup = new Map<string, string>();
    const resultIds = ["x", "y"];

    const coverage = await computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage!.highPriorityAnchorsTotal).toBe(0);
    expect(coverage!.fraction).toBe(0);
    expect(coverage!.missingAnchors).toEqual([]);
  });

  it("returns fraction 1 when all anchors are in results", async () => {
    const anchorIds = new Set(["a1", "a2"]);
    const anchorLookup = new Map([
      ["a1", "Anchor One"],
      ["a2", "Anchor Two"],
    ]);
    const resultIds = ["a1", "a2", "other"];

    const coverage = await computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage!.anchorsInResults).toBe(2);
    expect(coverage!.fraction).toBe(1);
    expect(coverage!.missingAnchors).toEqual([]);
  });

  it("caps missing anchors at maxMissing", async () => {
    const anchorIds = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
    const anchorLookup = new Map([
      ["a1", "A1"],
      ["a2", "A2"],
      ["a3", "A3"],
      ["a4", "A4"],
      ["a5", "A5"],
      ["a6", "A6"],
      ["a7", "A7"],
    ]);
    const resultIds = ["other"];

    const coverage = await computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup, 3);
    expect(coverage!.missingAnchors.length).toBe(3);
  });

  it("uses unknown title for missing anchor lookup", async () => {
    const anchorIds = new Set(["orphan"]);
    const anchorLookup = new Map<string, string>();
    const resultIds: string[] = [];

    const coverage = await computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage!.missingAnchors).toEqual([{ id: "orphan", title: "(unknown)" }]);
  });

  it("returns undefined on computation failure", async () => {
    const coverage = await computeRecallRetrievalCoverage(null as any, null as any, null as any);
    expect(coverage).toBeUndefined();
  });
});
