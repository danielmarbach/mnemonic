import type { NoteMetadata, NoteLifecycle } from "../storage.js";
import { hasNoteContent } from "../storage.js";
import type { Vault } from "../vault.js";
import { memoryId } from "../brands.js";
import { analyzeNoteContent, getEffectiveMetadata } from "../role-suggestions.js";
import {
  computeRecallMetadataBoost,
  recallCandidateIdentity,
  type ScoredRecallCandidate,
  type TemporalQueryHint,
  shouldApplyTemporalFiltering,
  computeTemporalRecencyBoost,
  isWithinTemporalFilterWindow,
} from "../recall.js";
import { getOrBuildProjection, getProjection, isProjectionStale } from "../projections.js";
import { attempt } from "../error-utils.js";
import {
  getSessionCachedProjection,
  setSessionCachedProjection,
  getSessionCachedProjectionTokens,
  setSessionCachedProjectionTokens,
  getOrBuildVaultNoteList,
} from "../cache.js";
import {
  tokenize,
  computeLexicalScore,
  prepareTfIdfCorpusFromTokenizedDocuments,
  rankDocumentsByTfIdf,
  LEXICAL_RETRIEVAL_CANDIDATE_LIMIT,
  LEXICAL_RETRIEVAL_RESULT_LIMIT,
  LEXICAL_RETRIEVAL_THRESHOLD,
} from "../lexical.js";
import type {
  RecallDiversity,
  RecallRetrievalCoverage,
  NoteProjection,
  NoteContentSignals,
} from "../structured-content.js";

// ── Recall candidate context ──────────────────────────────────────────────────

export function buildRecallCandidateContext(
  note: NoteMetadata,
  contentSignals?: NoteContentSignals,
) {
  const signals = contentSignals ?? analyzeNoteContent(hasNoteContent(note) ? note.content : "");
  const metadata = getEffectiveMetadata(note, {
    contentSignals: signals,
  });
  return {
    metadata,
    metadataBoost: computeRecallMetadataBoost(metadata),
    lifecycle: note.lifecycle,
    relatedCount: note.relatedTo?.length ?? 0,
    connectionDiversity: new Set((note.relatedTo ?? []).map((rel) => rel.type)).size,
    structureScore: Math.min(
      0.04,
      [
        signals.hasSubheading ? 0.02 : 0,
        signals.hasListMarker ? 0.01 : 0,
        signals.hasAtLeast400Characters ? 0.01 : 0,
      ].reduce((sum, value) => sum + value, 0),
    ),
  };
}

// ── Lexical rescue ────────────────────────────────────────────────────────────

// Bounded policy priors remain smaller than meaningful multi-channel RRF agreement.
export const PROJECT_SCOPE_BOOST = 0.005;
export const ATTACHMENT_BOOST = PROJECT_SCOPE_BOOST / 2;
// Re-exported for discoverability; defined next to the gate predicate in
// ../recall.ts to avoid a circular import.
export { GLOBAL_BAR_DELTA } from "../recall.js";
// Document chunks fuse into the unified recall ranking with a prior smaller than
// ATTACHMENT_BOOST so notes outrank chunks by default while documents stay visible
// (rank just below notes; a dramatically stronger chunk can still rise).
export const DOCUMENT_CHUNK_PRIOR = ATTACHMENT_BOOST / 2;

interface LexicalCandidateOptions {
  excludeExisting: boolean;
  candidateLimit: number;
  resultLimit: number;
  minimumScore: number;
}

const ALWAYS_ON_LEXICAL_OPTIONS: LexicalCandidateOptions = {
  excludeExisting: false,
  candidateLimit: LEXICAL_RETRIEVAL_CANDIDATE_LIMIT,
  resultLimit: LEXICAL_RETRIEVAL_RESULT_LIMIT,
  minimumScore: LEXICAL_RETRIEVAL_THRESHOLD,
};

export async function collectLexicalCandidates(
  vaults: Vault[],
  query: string,
  temporalQueryHint: TemporalQueryHint | undefined,
  project: { id: string; name: string } | undefined,
  scope: "project" | "global" | "all" | undefined,
  tags: string[] | undefined,
  lifecycle: NoteLifecycle | undefined,
  existingIds: ScoredRecallCandidate[],
  options: LexicalCandidateOptions = ALWAYS_ON_LEXICAL_OPTIONS,
): Promise<ScoredRecallCandidate[]> {
  const projectId = project?.id;
  const applyTemporalFilter = shouldApplyTemporalFiltering(temporalQueryHint);
  const temporalFilterWindowDays = applyTemporalFilter
    ? temporalQueryHint?.filterWindowDays
    : undefined;
  const existingIdSet = new Set(existingIds.map((candidate) => recallCandidateIdentity(candidate)));
  const lexicalPool: Array<{
    id: string;
    identityKey: string;
    vault: Vault;
    isCurrentProject: boolean;
    isAttachedVault: boolean;
    updatedAt: string;
    projectionText: string;
    projectionTokens: string[];
    context: ReturnType<typeof buildRecallCandidateContext>;
  }> = [];

  for (const vault of vaults) {
    const notes = projectId
      ? ((await getOrBuildVaultNoteList(projectId, vault)) ?? [])
      : await vault.storage.listNotes().catch(() => []);
    for (const note of notes) {
      const identityKey = `${vault.storage.vaultPath}::${note.id}`;
      if (options.excludeExisting && existingIdSet.has(identityKey)) continue;

      if (tags && tags.length > 0) {
        const noteTags = new Set(note.tags);
        if (!tags.every((t) => noteTags.has(t))) continue;
      }

      if (lifecycle && note.lifecycle !== lifecycle) continue;

      const isCurrentProject = project && note.project === project.id;
      const isAttachedVault = vault.provenance === "project-attached";

      if (scope === "project" && !isCurrentProject && !isAttachedVault) continue;
      // Location-based, matching the semantic channel: "global" scope admits all
      // main-vault notes, including project-tagged personal notes ("repo you
      // don't own" case asserted by vault-routing integration tests).
      if (scope === "global" && vault.provenance !== "main") continue;
      if (
        applyTemporalFilter &&
        temporalFilterWindowDays !== undefined &&
        !isWithinTemporalFilterWindow(note.updatedAt, temporalFilterWindowDays)
      ) {
        continue;
      }

      const cachedProjection = projectId
        ? getSessionCachedProjection(projectId, vault.storage.vaultPath, note.id)
        : undefined;
      // The cached note list is metadata-only (no content field). A stale or
      // missing projection must be (re)built from the full note body, so load
      // the full note before building — otherwise we would persist degraded
      // projections (empty summaries) that feed embedding/lexical text. Cached
      // projections are also validated with isProjectionStale so a cached
      // legacy projection without contentSignals does not bypass lazy migration.
      let projection: NoteProjection | undefined =
        cachedProjection && !isProjectionStale(note, cachedProjection)
          ? cachedProjection
          : undefined;
      if (!projection) {
        const stored = await getProjection(vault.storage, note.id).catch(() => undefined);
        if (stored && !isProjectionStale(note, stored)) {
          projection = stored;
        } else {
          const fullNote = hasNoteContent(note)
            ? note
            : await vault.storage.readNote(memoryId(note.id)).catch(() => null);
          if (fullNote) {
            projection = await getOrBuildProjection(vault.storage, fullNote).catch(() => undefined);
          }
        }
      }
      if (!projection) continue;

      const projectionTokens = projectId
        ? (getSessionCachedProjectionTokens(
            projectId,
            vault.storage.vaultPath,
            note.id,
            projection.projectionText,
          ) ?? tokenize(projection.projectionText))
        : tokenize(projection.projectionText);
      lexicalPool.push({
        id: note.id,
        identityKey,
        vault,
        isCurrentProject: Boolean(isCurrentProject),
        isAttachedVault: Boolean(isAttachedVault),
        updatedAt: note.updatedAt,
        projectionText: projection.projectionText,
        projectionTokens,
        context: buildRecallCandidateContext(note, projection.contentSignals),
      });

      if (projectId) {
        // Write the (re)built projection back to the session cache even when a
        // stale cached projection already existed, so the next recall reuses it
        // without a body read.
        if (cachedProjection === undefined || cachedProjection !== projection) {
          setSessionCachedProjection(projectId, vault.storage.vaultPath, note.id, projection);
        }
        setSessionCachedProjectionTokens(
          projectId,
          vault.storage.vaultPath,
          note.id,
          projection.projectionText,
          projectionTokens,
        );
      }
    }
  }

  const documents = lexicalPool.map((candidate) => ({
    id: candidate.identityKey,
    text: candidate.projectionText,
  }));
  const preparedCorpus = prepareTfIdfCorpusFromTokenizedDocuments(
    lexicalPool.map((candidate) => ({
      id: candidate.identityKey,
      text: candidate.projectionText,
      tokens: candidate.projectionTokens,
    })),
  );
  const rankedScores = new Map(
    rankDocumentsByTfIdf(query, documents, options.candidateLimit, preparedCorpus).map(
      (candidate) => [candidate.id, candidate.score],
    ),
  );

  const candidates: ScoredRecallCandidate[] = [];
  for (const candidate of lexicalPool) {
    const lexicalChannelScore = rankedScores.get(candidate.identityKey);
    if (
      lexicalChannelScore === undefined ||
      lexicalChannelScore <= 0 ||
      lexicalChannelScore < options.minimumScore
    ) {
      continue;
    }

    const temporalPrior = temporalQueryHint
      ? computeTemporalRecencyBoost(candidate.updatedAt, temporalQueryHint)
      : 0;
    const projectPrior = candidate.isCurrentProject
      ? PROJECT_SCOPE_BOOST
      : candidate.isAttachedVault
        ? ATTACHMENT_BOOST
        : 0;
    const metadataPrior = candidate.context.metadataBoost;
    candidates.push({
      id: candidate.id,
      identityKey: `${candidate.vault.storage.vaultPath}::${candidate.id}`,
      score: 0,
      semanticScoreForPromotion: 0,
      semanticScore: undefined,
      semanticConfidencePrior: 0,
      lexicalScore: computeLexicalScore(query, candidate.projectionText),
      lexicalChannelScore,
      lexicalChannelCandidate: true,
      boosted: projectPrior + metadataPrior + temporalPrior,
      projectPrior,
      temporalPrior,
      metadataPrior,
      vault: candidate.vault,
      isCurrentProject: candidate.isCurrentProject,
      lifecycle: candidate.context.lifecycle,
      relatedCount: candidate.context.relatedCount,
      connectionDiversity: candidate.context.connectionDiversity,
      structureScore: candidate.context.structureScore,
      metadata: candidate.context.metadata,
    });
  }

  return candidates
    .sort((a, b) => {
      const scoreDelta = (b.lexicalChannelScore ?? 0) - (a.lexicalChannelScore ?? 0);
      return scoreDelta !== 0
        ? scoreDelta
        : recallCandidateIdentity(a).localeCompare(recallCandidateIdentity(b));
    })
    .slice(0, options.resultLimit);
}

// ── Tag discovery helpers ─────────────────────────────────────────────────────

export type DiscoverTagStat = {
  count: number;
  examples: string[];
  lifecycles: Set<NoteLifecycle>;
  contextMatches: number;
  exactCandidateMatch: boolean;
};

export function tokenizeTagDiscoveryText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function countTokenOverlap(tokens: Set<string>, other: Iterable<string>): number {
  let matches = 0;
  for (const token of other) {
    if (tokens.has(token)) {
      matches++;
    }
  }
  return matches;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasExactTagContextMatch(tag: string, values: Array<string | undefined>): boolean {
  const normalizedTag = tag.toLowerCase();
  const pattern = new RegExp(`(^|[^a-z0-9_-])${escapeRegex(normalizedTag)}([^a-z0-9_-]|$)`);
  return values.some((value) => (value ? pattern.test(value.toLowerCase()) : false));
}

export async function identifyHighPriorityAnchors(
  vaults: Vault[],
  projectId: string,
): Promise<{ anchorIds: Set<string>; anchorLookup: Map<string, string> }> {
  const anchorIds = new Set<string>();
  const anchorLookup = new Map<string, string>();

  for (const vault of vaults) {
    const vaultResult = await attempt("recall:anchor-scan", async () => {
      const notes = await getOrBuildVaultNoteList(projectId, vault);
      if (!notes) return undefined;
      // Passive supersedes convention: a note carrying a `supersedes` edge is
      // itself the superseded source, so it must not be treated as a
      // high-priority anchor (the canonical successor may be).
      const supersededNotes = new Set<string>();
      for (const note of notes) {
        if (note.project !== projectId) continue;
        const isSuperseded = (note.relatedTo ?? []).some((rel) => rel.type === "supersedes");
        if (isSuperseded) supersededNotes.add(note.id);
      }
      for (const note of notes) {
        if (note.project !== projectId) continue;
        if (
          (note.alwaysLoad === true || note.role === "summary") &&
          !supersededNotes.has(note.id)
        ) {
          anchorIds.add(note.id);
          anchorLookup.set(note.id, note.title);
        }
      }
      return undefined;
    });
    if (!vaultResult.ok) continue;
  }

  return { anchorIds, anchorLookup };
}

export async function computeRecallDiversity(
  results: Array<{ id: string; tags: string[]; lifecycle: NoteLifecycle; role?: string }>,
): Promise<RecallDiversity | undefined> {
  const result = await attempt("recall:diversity", () => {
    const allTags = new Set<string>();
    const roleCounts = new Map<string, number>();
    const lifecycleCounts = new Map<string, number>();

    for (const r of results) {
      for (const tag of r.tags) {
        allTags.add(tag);
      }
      if (r.role) {
        roleCounts.set(r.role, (roleCounts.get(r.role) ?? 0) + 1);
      }
      lifecycleCounts.set(r.lifecycle, (lifecycleCounts.get(r.lifecycle) ?? 0) + 1);
    }

    return {
      themeCount: allTags.size,
      roleMix: Object.fromEntries(roleCounts) as Record<string, number>,
      lifecycleMix: Object.fromEntries(lifecycleCounts) as Record<string, number>,
    };
  });
  if (!result.ok) return undefined;
  return result.value;
}

export async function computeRecallRetrievalCoverage(
  resultIds: string[],
  anchorIds: Set<string>,
  anchorLookup: Map<string, string>,
  maxMissing = 5,
): Promise<RecallRetrievalCoverage | undefined> {
  const result = await attempt("recall:coverage", () => {
    const resultIdSet = new Set(resultIds);
    const anchorsInResults = [...anchorIds].filter((id) => resultIdSet.has(id)).length;
    const highPriorityAnchorsTotal = anchorIds.size;
    const fraction = highPriorityAnchorsTotal > 0 ? anchorsInResults / highPriorityAnchorsTotal : 0;

    const missingAnchors = [...anchorIds]
      .filter((id) => !resultIdSet.has(id))
      .slice(0, maxMissing)
      .map((id) => ({ id, title: anchorLookup.get(id) ?? "(unknown)" }));

    return {
      anchorsInResults,
      highPriorityAnchorsTotal,
      fraction,
      missingAnchors,
    };
  });
  if (!result.ok) return undefined;
  return result.value;
}
