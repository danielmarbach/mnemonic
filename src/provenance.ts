import type { CommitStats, GitOps, LastCommit } from "./git.js";
import type { NoteLifecycle, NoteRole } from "./storage.js";
import type { Confidence, Provenance } from "./structured-content.js";
export type { InterpretedHistoryEntry } from "./temporal-interpretation.js";
import { daysSince } from "./date-utils.js";
import { metadataPrefixes } from "./git-constants.js";

const RECENTLY_CHANGED_DAYS = 5;

const SIGNAL_ROLE_WEIGHTS: Record<NoteRole, number> = {
  summary: 0.15,
  decision: 0.1,
  plan: 0.08,
  research: 0.05,
  review: 0.05,
  context: 0.05,
  reference: 0.05,
};

const SIGNAL_CENTRALITY_LOG_FACTOR = 0.05;
const SIGNAL_CENTRALITY_MAX = 0.15;
const SIGNAL_LIFECYCLE_PERMANENT = 0.1;
const SIGNAL_RECENCY_MAX = 0.1;
const SIGNAL_RECENCY_WINDOW_DAYS = 90;

const CONFIDENCE_HIGH_THRESHOLD = 0.35;
const CONFIDENCE_MEDIUM_THRESHOLD = 0.15;

const FALLBACK_HIGH_CONFIDENCE_DAYS = 30;
const FALLBACK_MEDIUM_CONFIDENCE_DAYS = 90;
const FALLBACK_HIGH_CONFIDENCE_CENTRALITY = 5;

const DECAY_HALF_LIFE_TEMPORARY_WORK_DAYS = 30;
const DECAY_HALF_LIFE_TEMPORARY_CONTEXT_DAYS = 45;
const DECAY_HALF_LIFE_PERMANENT_CORE_DAYS = 365;
const DECAY_HALF_LIFE_PERMANENT_DEFAULT_DAYS = 180;
const DECAY_HALF_LIFE_SUPERSEDED_DAYS = 30;
const DECAY_CENTRALITY_EXTENSION_FACTOR = 0.1;
const DECAY_CENTRALITY_EXTENSION_MAX = 2;
const DECAY_STALENESS_REVIEW_THRESHOLD = 0.5;

export type DecayMaintenanceHint = "review" | "consolidate" | "prune-superseded";
export type DecayBasis =
  | "temporary"
  | "permanent"
  | "superseded"
  | "plan"
  | "research"
  | "review"
  | "decision"
  | "summary"
  | "reference"
  | "centrality-extension";

export interface DecayInfo {
  ageDays: number;
  halfLifeDays: number;
  freshness: number;
  staleness: number;
  basis: readonly DecayBasis[];
  maintenanceHint?: DecayMaintenanceHint;
}

function classifyTemporalChange(
  commit: LastCommit,
  stats: CommitStats,
): "metadata-only change" | "minor edit" | "substantial update" {
  if (stats.additions === 0 && stats.deletions === 0) {
    return "metadata-only change";
  }

  if (metadataPrefixes.some((prefix) => commit.message.toLowerCase().startsWith(prefix))) {
    return "metadata-only change";
  }

  const totalChangedLines = stats.additions + stats.deletions;
  if (stats.filesChanged >= 3 || totalChangedLines >= 25) {
    return "substantial update";
  }

  return "minor edit";
}

function formatTemporalSummary(stats: CommitStats, changeType: string, verbose: boolean): string {
  const lineSummary = `+${stats.additions}/-${stats.deletions} lines`;
  if (!verbose) {
    return changeType === "metadata-only change" ? changeType : `${changeType} (${lineSummary})`;
  }

  const fileSummary = `${stats.filesChanged} ${stats.filesChanged === 1 ? "file" : "files"} changed`;
  return changeType === "metadata-only change"
    ? `${changeType} (${fileSummary})`
    : `${changeType} (${lineSummary}, ${fileSummary})`;
}

export function buildTemporalHistoryEntry(
  commit: LastCommit,
  stats: CommitStats | null,
  verbose: boolean,
): {
  commitHash: string;
  timestamp: string;
  message: string;
  summary?: string;
  stats?: {
    additions: number;
    deletions: number;
    filesChanged: number;
    changeType: "metadata-only change" | "minor edit" | "substantial update";
  };
} {
  const base = {
    commitHash: commit.hash,
    timestamp: commit.timestamp,
    message: commit.message,
  };

  if (!stats) {
    return base;
  }

  const changeType = classifyTemporalChange(commit, stats);
  return {
    ...base,
    summary: formatTemporalSummary(stats, changeType, verbose),
    stats: {
      additions: stats.additions,
      deletions: stats.deletions,
      filesChanged: stats.filesChanged,
      changeType,
    },
  };
}

export async function getNoteProvenance(
  git: GitOps,
  filePath: string,
  _now: Date = new Date(),
): Promise<Provenance | undefined> {
  const commit = await git.getLastCommit(filePath);
  if (!commit) return undefined;

  const daysSinceUpdate = Math.floor(daysSince(commit.timestamp));

  return {
    lastUpdatedAt: commit.timestamp,
    lastCommitHash: commit.hash,
    lastCommitMessage: commit.message,
    recentlyChanged: daysSinceUpdate < RECENTLY_CHANGED_DAYS,
  };
}

export function computeSignalStrength(params: {
  lifecycle: NoteLifecycle;
  updatedAt: string;
  role?: NoteRole;
  centrality: number;
}): number {
  const daysSinceUpdateNum = Math.floor(daysSince(params.updatedAt));

  const roleWeight = params.role ? (SIGNAL_ROLE_WEIGHTS[params.role] ?? 0) : 0;
  const centrality = Number.isFinite(params.centrality) ? Math.max(0, params.centrality) : 0;
  const centralityWeight = Math.min(
    SIGNAL_CENTRALITY_MAX,
    Math.log(centrality + 1) * SIGNAL_CENTRALITY_LOG_FACTOR,
  );
  const lifecycleWeight = params.lifecycle === "permanent" ? SIGNAL_LIFECYCLE_PERMANENT : 0;
  const recencyWeight =
    SIGNAL_RECENCY_MAX * Math.max(0, 1 - daysSinceUpdateNum / SIGNAL_RECENCY_WINDOW_DAYS);

  const result = roleWeight + centralityWeight + lifecycleWeight + recencyWeight;
  return Number.isFinite(result) ? result : 0;
}

function baseDecayHalfLifeDays(params: {
  lifecycle: NoteLifecycle;
  role?: NoteRole;
  superseded?: boolean;
}): { halfLifeDays: number; basis: readonly DecayBasis[] } {
  if (params.superseded) {
    return { halfLifeDays: DECAY_HALF_LIFE_SUPERSEDED_DAYS, basis: ["superseded"] };
  }

  if (params.lifecycle === "temporary") {
    if (params.role === "plan" || params.role === "research" || params.role === "review") {
      return {
        halfLifeDays: DECAY_HALF_LIFE_TEMPORARY_WORK_DAYS,
        basis: ["temporary", params.role],
      };
    }
    return { halfLifeDays: DECAY_HALF_LIFE_TEMPORARY_CONTEXT_DAYS, basis: ["temporary"] };
  }

  if (params.role === "decision" || params.role === "summary" || params.role === "reference") {
    return { halfLifeDays: DECAY_HALF_LIFE_PERMANENT_CORE_DAYS, basis: ["permanent", params.role] };
  }

  return { halfLifeDays: DECAY_HALF_LIFE_PERMANENT_DEFAULT_DAYS, basis: ["permanent"] };
}

export function computeDecayInfo(params: {
  lifecycle: NoteLifecycle;
  updatedAt: string;
  role?: NoteRole;
  centrality?: number;
  superseded?: boolean;
  now?: Date;
}): DecayInfo {
  const rawAgeDays = Math.floor(daysSince(params.updatedAt, params.now));
  const ageDays = Number.isFinite(rawAgeDays) ? rawAgeDays : 0;
  const base = baseDecayHalfLifeDays(params);
  const rawCentrality = params.centrality ?? 0;
  const centrality = Number.isFinite(rawCentrality) ? Math.max(0, rawCentrality) : 0;
  const centralityMultiplier = params.superseded
    ? 1
    : Math.min(
        DECAY_CENTRALITY_EXTENSION_MAX,
        1 + Math.log(centrality + 1) * DECAY_CENTRALITY_EXTENSION_FACTOR,
      );
  const rawHalfLifeDays = base.halfLifeDays * centralityMultiplier;
  const halfLifeDays =
    Number.isFinite(rawHalfLifeDays) && rawHalfLifeDays > 0 ? rawHalfLifeDays : base.halfLifeDays;
  const freshness = Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
  const staleness = 1 - freshness;
  const basis: readonly DecayBasis[] =
    centralityMultiplier > 1 ? [...base.basis, "centrality-extension"] : base.basis;

  let maintenanceHint: DecayMaintenanceHint | undefined;
  if (params.superseded && staleness >= DECAY_STALENESS_REVIEW_THRESHOLD) {
    maintenanceHint = "prune-superseded";
  } else if (params.lifecycle === "temporary" && staleness >= DECAY_STALENESS_REVIEW_THRESHOLD) {
    maintenanceHint =
      params.role === "plan" || params.role === "research" || params.role === "review"
        ? "consolidate"
        : "review";
  }

  return {
    ageDays,
    halfLifeDays,
    freshness: Number.isFinite(freshness) ? freshness : 1,
    staleness: Number.isFinite(staleness) ? staleness : 0,
    basis,
    maintenanceHint,
  };
}

export function computeConfidence(
  lifecycle: NoteLifecycle,
  updatedAt: string,
  centrality: number,
  signalStrength?: number,
): Confidence {
  if (signalStrength !== undefined) {
    if (signalStrength >= CONFIDENCE_HIGH_THRESHOLD) return "high";
    if (signalStrength >= CONFIDENCE_MEDIUM_THRESHOLD) return "medium";
    return "low";
  }

  const daysSinceUpdateNum = Math.floor(daysSince(updatedAt));

  if (
    lifecycle === "permanent" &&
    centrality >= FALLBACK_HIGH_CONFIDENCE_CENTRALITY &&
    daysSinceUpdateNum < FALLBACK_HIGH_CONFIDENCE_DAYS
  ) {
    return "high";
  }

  if (daysSinceUpdateNum < FALLBACK_MEDIUM_CONFIDENCE_DAYS) {
    return "medium";
  }

  return "low";
}
