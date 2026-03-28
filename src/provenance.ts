import type { CommitStats, GitOps, LastCommit } from "./git.js";
import type { NoteLifecycle } from "./storage.js";
import type { Confidence, Provenance } from "./structured-content.js";
export type { InterpretedHistoryEntry } from "./temporal-interpretation.js";

const RECENTLY_CHANGED_DAYS = 5;
const HIGH_CONFIDENCE_DAYS = 30;
const MEDIUM_CONFIDENCE_DAYS = 90;
const HIGH_CONFIDENCE_CENTRALITY = 5;

function classifyTemporalChange(
  commit: LastCommit,
  stats: CommitStats
): "metadata-only change" | "minor edit" | "substantial update" {
  const metadataPrefixes = ["relate:", "unrelate:", "move:", "migrate:", "forget:"];
  if (stats.additions === 0 && stats.deletions === 0) {
    return "metadata-only change";
  }

  if (metadataPrefixes.some((prefix) => commit.message.startsWith(prefix))) {
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
    return changeType === "metadata-only change"
      ? changeType
      : `${changeType} (${lineSummary})`;
  }

  const fileSummary = `${stats.filesChanged} ${stats.filesChanged === 1 ? "file" : "files"} changed`;
  return changeType === "metadata-only change"
    ? `${changeType} (${fileSummary})`
    : `${changeType} (${lineSummary}, ${fileSummary})`;
}

export function buildTemporalHistoryEntry(
  commit: LastCommit,
  stats: CommitStats | null,
  verbose: boolean
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
  filePath: string
): Promise<Provenance | undefined> {
  const commit = await git.getLastCommit(filePath);
  if (!commit) return undefined;

  const commitDate = new Date(commit.timestamp);
  const now = new Date();
  const daysSinceUpdate = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    lastUpdatedAt: commit.timestamp,
    lastCommitHash: commit.hash,
    lastCommitMessage: commit.message,
    recentlyChanged: daysSinceUpdate < RECENTLY_CHANGED_DAYS,
  };
}

export function computeConfidence(
  lifecycle: NoteLifecycle,
  updatedAt: string,
  centrality: number
): Confidence {
  const now = new Date();
  const updatedDate = new Date(updatedAt);
  const daysSinceUpdate = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));

  if (lifecycle === "permanent" && centrality >= HIGH_CONFIDENCE_CENTRALITY && daysSinceUpdate < HIGH_CONFIDENCE_DAYS) {
    return "high";
  }

  if (daysSinceUpdate < MEDIUM_CONFIDENCE_DAYS) {
    return "medium";
  }

  return "low";
}
