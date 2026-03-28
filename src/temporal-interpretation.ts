import type { CommitStats, LastCommit } from "./git.js";

export type ChangeCategory =
  | "create"
  | "refine"
  | "expand"
  | "clarify"
  | "connect"
  | "restructure"
  | "reverse"
  | "unknown";

export interface InterpretHistoryContext {
  isFirstCommit?: boolean;
  previousEntry?: TemporalHistoryEntry;
  relationshipChanged?: boolean;
}

export interface TemporalHistoryEntry {
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
}

export interface InterpretedHistoryEntry {
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
  changeCategory: ChangeCategory;
  changeDescription: string;
}

function hasStats(entry: TemporalHistoryEntry): entry is TemporalHistoryEntry & { stats: NonNullable<TemporalHistoryEntry["stats"]> } {
  return entry.stats !== undefined;
}

export function classifyChange(
  entry: TemporalHistoryEntry,
  context?: InterpretHistoryContext
): ChangeCategory {
  if (context?.isFirstCommit) {
    return "create";
  }

  const commit = {
    hash: entry.commitHash,
    timestamp: entry.timestamp,
    message: entry.message,
  };

  const metadataPrefixes = ["relate:", "unrelate:", "move:", "migrate:", "forget:"];
  if (metadataPrefixes.some((prefix) => commit.message.toLowerCase().startsWith(prefix))) {
    return "connect";
  }

  if (!hasStats(entry)) {
    return "unknown";
  }

  const stats = entry.stats;

  if (stats.additions === 0 && stats.deletions === 0) {
    return context?.relationshipChanged ? "connect" : "unknown";
  }

  const totalChanged = stats.additions + stats.deletions;
  const netGrowth = stats.additions - stats.deletions;
  const churnRatio = totalChanged > 0 ? Math.abs(netGrowth) / totalChanged : 0;

  if (context?.relationshipChanged && Math.abs(netGrowth) < 20) {
    return "connect";
  }

  if (stats.changeType === "metadata-only change") {
    return context?.relationshipChanged ? "connect" : "refine";
  }

  if (totalChanged < 10 && churnRatio > 0.7) {
    return "refine";
  }

  if (stats.additions > stats.deletions * 2 && netGrowth > 20) {
    return "expand";
  }

  if (totalChanged >= 50 || stats.changeType === "substantial update") {
    if (churnRatio < 0.3 && stats.additions > stats.deletions) {
      return "expand";
    }
    if (stats.deletions > stats.additions * 2 && stats.deletions >= 30) {
      return "reverse";
    }
    return "restructure";
  }

  if (totalChanged >= 10 && totalChanged < 50) {
    if (churnRatio > 0.5) {
      return "clarify";
    }
    if (netGrowth > 10) {
      return "expand";
    }
    return "refine";
  }

  return "refine";
}

function generateChangeDescription(
  category: ChangeCategory,
  entry: TemporalHistoryEntry,
  context?: InterpretHistoryContext
): string {
  const hasContent = hasStats(entry);
  const isSubstantial = hasContent &&
    (entry.stats!.changeType === "substantial update" ||
     entry.stats!.additions + entry.stats!.deletions > 50);

  switch (category) {
    case "create":
      return isSubstantial
        ? "Created this note with substantial initial content."
        : "Created this note.";

    case "refine":
      return "Minor refinement to existing content.";

    case "expand":
      return isSubstantial
        ? "Added substantial explanatory content."
        : "Expanded the note with additional detail.";

    case "clarify":
      return "Clarified wording and constraints.";

    case "connect":
      return "Connected this note to related work.";

    case "restructure":
      return "Substantially reorganized the note.";

    case "reverse":
      return "Substantially changed the direction or position of the note.";

    case "unknown":
    default:
      if (isSubstantial) return "Substantially updated the note.";
      return hasContent ? "Minor update to the note." : "Updated the note.";
  }
}

export function interpretHistoryEntry(
  entry: TemporalHistoryEntry,
  context?: InterpretHistoryContext
): InterpretedHistoryEntry {
  const changeCategory = classifyChange(entry, context);
  const changeDescription = generateChangeDescription(changeCategory, entry, context);

  return {
    commitHash: entry.commitHash,
    timestamp: entry.timestamp,
    message: entry.message,
    summary: entry.summary,
    stats: entry.stats,
    changeCategory,
    changeDescription,
  };
}

export function summarizeHistory(
  entries: InterpretedHistoryEntry[]
): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  if (entries.length === 1) {
    const first = entries[0];
    if (first.changeCategory === "create") {
      return "This note was created and has not been modified since.";
    }
    return `This note was ${first.changeCategory === "unknown" ? "updated" : first.changeCategory}d.`;
  }

  const first = entries[entries.length - 1];
  const categories = entries.map((e) => e.changeCategory);
  const categoryCounts = categories.reduce((acc, cat) => {
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<ChangeCategory, number>);

  const nonCreateCategories = categories.filter((c) => c !== "create");
  const dominantCategory = nonCreateCategories.length > 0
    ? nonCreateCategories.sort((a, b) => (categoryCounts[b] || 0) - (categoryCounts[a] || 0))[0]
    : "create";

  const hasConnect = categoryCounts["connect"] > 0;
  const hasExpansion = (categoryCounts["expand"] || 0) + (categoryCounts["clarify"] || 0) > 0;
  const hasRestructure = categoryCounts["restructure"] > 0;

  if (entries.length === 2 && first.changeCategory === "create") {
    const second = entries[0];
    if (second.changeCategory === "refine") {
      return "This note was created and then refined.";
    }
    if (second.changeCategory === "expand") {
      return "This note was created and then expanded with additional detail.";
    }
    if (second.changeCategory === "clarify") {
      return "This note was created and then clarified.";
    }
  }

  if (dominantCategory === "refine" && !hasExpansion && !hasRestructure) {
    return "This note was created and then refined incrementally.";
  }

  if (dominantCategory === "expand" || (hasExpansion && !hasRestructure)) {
    if (hasConnect) {
      return "The core content remained stable; later edits expanded rationale and linked related notes.";
    }
    return "The core decision remained stable while rationale and examples expanded.";
  }

  if (dominantCategory === "clarify") {
    if (hasConnect) {
      return "Most changes clarified the note and connected it to related work.";
    }
    return "Most changes were clarifications rather than decision changes.";
  }

  if (hasRestructure) {
    return "The note evolved through several substantial revisions before settling into its current form.";
  }

  if (hasConnect) {
    return "The note was connected to related work through incremental updates.";
  }

  if (dominantCategory === "unknown") {
    const substantialCount = entries.filter(
      e => e.stats?.changeType === "substantial update"
    ).length;
    if (substantialCount >= 2) {
      return "The note grew through multiple substantial updates.";
    }
    const totalAdditions = entries.reduce((sum, e) => sum + (e.stats?.additions ?? 0), 0);
    if (totalAdditions > 100) {
      return "The note expanded significantly through several updates.";
    }
  }

  return "This note has been updated several times.";
}

export function enrichTemporalHistory(
  entries: TemporalHistoryEntry[]
): {
  interpretedHistory: InterpretedHistoryEntry[];
  historySummary?: string;
} {
  if (entries.length === 0) {
    return { interpretedHistory: [] };
  }

  const relationshipPrefixes = ["relate:", "unrelate:"];
  const interpretedHistory = entries.map((entry, index) => {
    const relationshipChanged = relationshipPrefixes.some(
      (prefix) => entry.message.toLowerCase().startsWith(prefix)
    );
    const context: InterpretHistoryContext = {
      isFirstCommit: index === entries.length - 1,
      previousEntry: index < entries.length - 1 ? entries[index + 1] : undefined,
      relationshipChanged,
    };
    return interpretHistoryEntry(entry, context);
  });

  const historySummary = summarizeHistory(interpretedHistory);

  return {
    interpretedHistory,
    historySummary,
  };
}
