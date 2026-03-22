import type { GitOps } from "./git.js";
import type { NoteLifecycle } from "./storage.js";
import type { Confidence, Provenance } from "./structured-content.js";

const RECENTLY_CHANGED_DAYS = 5;
const HIGH_CONFIDENCE_DAYS = 30;
const MEDIUM_CONFIDENCE_DAYS = 90;
const HIGH_CONFIDENCE_CENTRALITY = 5;

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
