import type { ServerContext } from "../server-context.js";
import type { ProjectInfo } from "../project.js";
import {
  aggregateMergeRisk,
  buildConsolidateNoteEvidence,
  buildGroupWarnings,
  mergeRelationshipsFromNotes,
  normalizeMergePlanSourceIds,
  resolveEffectiveConsolidationMode,
} from "../consolidate.js";
import { cosineSimilarity, embed, embedModel } from "../embeddings.js";
import { classifyTheme, titleCaseTheme } from "../project-introspection.js";
import { getErrorMessage } from "../error-utils.js";
import { makeId, slugify } from "../helpers/index.js";
import { memoryId, isoDateString } from "../brands.js";
import { formatCommitBody, shouldBlockProtectedBranchCommit as shouldBlockProtectedBranchCommitFromModule, wouldRelationshipCleanupTouchProjectVault as wouldRelationshipCleanupTouchProjectVaultFromModule } from "../helpers/git-commit.js";
import { buildPersistenceStatus, buildMutationRetryContract, formatPersistenceSummary, pushAfterMutation as pushAfterMutationFromModule } from "../helpers/persistence.js";
import type { MutationRetryContract } from "../structured-content.js";
import { type NoteEntry, storageLabel, addVaultChange, removeRelationshipsToNoteIds as removeRelationshipsToNoteIdsFromModule } from "../helpers/vault.js";
import { toProjectRef } from "../helpers/project.js";
import { embedTextForNote as embedTextForNoteFromModule } from "../helpers/embed.js";
import type { Note } from "../storage.js";
import type { Vault } from "../vault.js";
import type { ConsolidationMode, ProjectMemoryPolicy } from "../project-memory-policy.js";
import type { ConsolidateResult, ConsolidateExecuteMergeEvidence } from "../structured-content.js";
import type { CommitResult, PushResult } from "../git.js";

// Re-export helpers that close over ctx for convenience
async function shouldBlockProtectedBranchCommit(ctx: ServerContext, options: Omit<Parameters<typeof shouldBlockProtectedBranchCommitFromModule>[0], "ctx">) {
  return shouldBlockProtectedBranchCommitFromModule({ ctx, ...options });
}

async function wouldRelationshipCleanupTouchProjectVault(ctx: ServerContext, noteIds: string[]) {
  return wouldRelationshipCleanupTouchProjectVaultFromModule(ctx, noteIds);
}

async function pushAfterMutation(ctx: ServerContext, vault: Vault) {
  return pushAfterMutationFromModule(ctx, vault);
}

async function removeRelationshipsToNoteIds(ctx: ServerContext, noteIds: string[]) {
  return removeRelationshipsToNoteIdsFromModule(ctx, noteIds);
}

async function embedTextForNote(storage: import("../storage.js").Storage, note: Note) {
  return embedTextForNoteFromModule(storage, note);
}

// ── Consolidate helper functions ────────────────────────────────────────────

export async function detectDuplicates(
  entries: NoteEntry[],
  threshold: number,
  project: ProjectInfo | undefined,
  evidence: boolean,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const lines: string[] = [];
  lines.push(`Duplicate detection for ${project?.name ?? "global"} (similarity > ${threshold}):`);
  lines.push("");

  const checked = new Set<string>();
  let foundCount = 0;
  const duplicates: Array<{ noteA: { id: string; title: string }; noteB: { id: string; title: string }; similarity: number }> = [];
  const duplicatePairs: NonNullable<ConsolidateResult["duplicatePairs"]> = [];
  const embeddings = await loadEmbeddingsByNoteId(entries);
  const allNotes = entries.map((entry) => entry.note);

  for (let i = 0; i < entries.length; i++) {
    const entryA = entries[i]!;
    if (checked.has(entryA.note.id)) continue;

    const embeddingA = embeddings.get(entryA.note.id);
    if (!embeddingA) continue;

    for (let j = i + 1; j < entries.length; j++) {
      const entryB = entries[j]!;
      if (checked.has(entryB.note.id)) continue;

      const embeddingB = embeddings.get(entryB.note.id);
      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA, embeddingB);
      if (similarity >= threshold) {
        const noteAEvidence = buildConsolidateNoteEvidence(entryA.note, allNotes, entryA.note);
        const noteBEvidence = buildConsolidateNoteEvidence(entryB.note, allNotes, entryA.note);
        const groupWarnings = buildGroupWarnings([entryA.note, entryB.note], entryA.note);
        const pairRisk = aggregateMergeRisk([noteAEvidence.mergeRisk, noteBEvidence.mergeRisk]);
        foundCount++;
        lines.push(`${foundCount}. ${entryA.note.title} (${entryA.note.id})`);
        lines.push(`   └── ${entryB.note.title} (${entryB.note.id})`);
        lines.push(`   Similarity: ${similarity.toFixed(3)}`);
        if (evidence) {
          lines.push(`   A: ${noteAEvidence.lifecycle}, ${noteAEvidence.role ?? "untyped"} | ${Math.round(noteAEvidence.ageDays)}d old | rel: ${noteAEvidence.relatedCount} | supersedes: ${noteAEvidence.supersededCount ?? 0} | risk: ${noteAEvidence.mergeRisk}`);
          lines.push(`   B: ${noteBEvidence.lifecycle}, ${noteBEvidence.role ?? "untyped"} | ${Math.round(noteBEvidence.ageDays)}d old | rel: ${noteBEvidence.relatedCount} | supersedes: ${noteBEvidence.supersededCount ?? 0} | risk: ${noteBEvidence.mergeRisk}`);
          if (groupWarnings.length > 0) {
            lines.push(`   Warnings: ${groupWarnings.join("; ")}`);
          }
          lines.push(`   Merge risk: ${pairRisk}`);
        }
        lines.push("");
        checked.add(entryA.note.id);
        checked.add(entryB.note.id);
        
        duplicates.push({
          noteA: { id: entryA.note.id, title: entryA.note.title },
          noteB: { id: entryB.note.id, title: entryB.note.title },
          similarity,
        });
        if (evidence) {
          duplicatePairs.push({
            similarity,
            noteA: noteAEvidence,
            noteB: noteBEvidence,
            warnings: groupWarnings.length > 0 ? groupWarnings : undefined,
            mergeRisk: pairRisk,
          });
        }
      }
    }
  }

  if (foundCount === 0) {
    lines.push("No duplicates found above the similarity threshold.");
  } else {
    lines.push(`Found ${foundCount} potential duplicate pair(s).`);
    lines.push("Use 'suggest-merges' strategy for actionable recommendations.");
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "detect-duplicates",
    project: toProjectRef(project),
    notesProcessed: entries.length,
    notesModified: 0,
    duplicatePairs: evidence ? duplicatePairs : undefined,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

export function findClusters(
  entries: NoteEntry[],
  project: ProjectInfo | undefined,
): { content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult } {
  const lines: string[] = [];
  lines.push(`Cluster analysis for ${project?.name ?? "global"}:`);
  lines.push("");

  // Group by theme
  const themed = new Map<string, NoteEntry[]>();
  for (const entry of entries) {
    const theme = classifyTheme(entry.note);
    const bucket = themed.get(theme) ?? [];
    bucket.push(entry);
    themed.set(theme, bucket);
  }

  // Find relationship clusters
  const idToEntry = new Map(entries.map((e) => [e.note.id, e]));
  const visited = new Set<string>();
  const clusters: NoteEntry[][] = [];

  for (const entry of entries) {
    if (visited.has(entry.note.id)) continue;

    const cluster: NoteEntry[] = [];
    const queue = [entry];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.note.id)) continue;
      visited.add(current.note.id);
      cluster.push(current);

      // Add related notes to queue
      for (const rel of current.note.relatedTo ?? []) {
        const related = idToEntry.get(rel.id);
        if (related && !visited.has(rel.id)) {
          queue.push(related);
        }
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  // Output theme groups
  const themeGroups: Array<{ name: string; count: number; examples: string[] }> = [];
  lines.push("By Theme:");
  for (const [theme, bucket] of themed) {
    if (bucket.length > 1) {
      lines.push(`  ${titleCaseTheme(theme)} (${bucket.length} notes)`);
      const examples = bucket.slice(0, 3).map((entry) => entry.note.title);
      for (const entry of bucket.slice(0, 3)) {
        lines.push(`    - ${entry.note.title}`);
      }
      if (bucket.length > 3) {
        lines.push(`    ... and ${bucket.length - 3} more`);
      }
      themeGroups.push({ name: theme, count: bucket.length, examples });
    }
  }

  // Output relationship clusters
  const relationshipClusters: Array<{ hub: { id: string; title: string }; notes: { id: string; title: string }[] }> = [];
  if (clusters.length > 0) {
    lines.push("");
    lines.push("Connected Clusters (via relationships):");
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]!;
      lines.push(`  Cluster ${i + 1} (${cluster.length} notes):`);
      const hub = cluster.reduce((max, e) =>
        (e.note.relatedTo?.length ?? 0) > (max.note.relatedTo?.length ?? 0) ? e : max
      );
      lines.push(`    Hub: ${hub.note.title}`);
      const clusterNotes: { id: string; title: string }[] = [];
      for (const entry of cluster) {
        if (entry.note.id !== hub.note.id) {
          lines.push(`    - ${entry.note.title}`);
          clusterNotes.push({ id: entry.note.id, title: entry.note.title });
        }
      }
      relationshipClusters.push({
        hub: { id: hub.note.id, title: hub.note.title },
        notes: clusterNotes,
      });
    }
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "find-clusters",
    project: toProjectRef(project),
    notesProcessed: entries.length,
    notesModified: 0,
    themeGroups,
    relationshipClusters,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

export async function suggestMerges(
  entries: NoteEntry[],
  threshold: number,
  defaultConsolidationMode: ConsolidationMode,
  project: ProjectInfo | undefined,
  explicitMode?: ConsolidationMode,
  evidence: boolean = false,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const lines: string[] = [];
  const modeLabel = explicitMode ?? `${defaultConsolidationMode} (project/default; all-temporary merges auto-delete)`;
  lines.push(`Merge suggestions for ${project?.name ?? "global"} (mode: ${modeLabel}):`);
  lines.push("");

  const checked = new Set<string>();
  let suggestionCount = 0;
  const suggestions: Array<{
    targetTitle: string;
    sourceIds: string[];
    similarities: Array<{ id: string; similarity: number }>;
  }> = [];
  const mergeSuggestions: NonNullable<ConsolidateResult["mergeSuggestions"]> = [];
  const embeddings = await loadEmbeddingsByNoteId(entries);
  const allNotes = entries.map((entry) => entry.note);

  for (let i = 0; i < entries.length; i++) {
    const entryA = entries[i]!;
    if (checked.has(entryA.note.id)) continue;

    const embeddingA = embeddings.get(entryA.note.id);
    if (!embeddingA) continue;

    const similar: Array<{ entry: NoteEntry; similarity: number }> = [];

    for (let j = i + 1; j < entries.length; j++) {
      const entryB = entries[j]!;
      if (checked.has(entryB.note.id)) continue;

      const embeddingB = embeddings.get(entryB.note.id);
      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA, embeddingB);
      if (similarity >= threshold) {
        similar.push({ entry: entryB, similarity });
      }
    }

    if (similar.length > 0) {
      suggestionCount++;
      similar.sort((a, b) => b.similarity - a.similarity);
      const sources = [entryA, ...similar.map((s) => s.entry)];
      const effectiveMode = resolveEffectiveConsolidationMode(
        sources.map((source) => source.note),
        defaultConsolidationMode,
        explicitMode,
      );

      lines.push(`${suggestionCount}. MERGE ${sources.length} NOTES`);
      lines.push(`   Into: "${entryA.note.title} (consolidated)"`);
      lines.push("   Sources:");
      for (const src of sources) {
        const simStr = src.note.id === entryA.note.id ? "" : ` (${similar.find((s) => s.entry.note.id === src.note.id)?.similarity.toFixed(3)})`;
        lines.push(`     - ${src.note.title} (${src.note.id})${simStr}`);
      }
      const modeDescription = ((): string => {
        switch (effectiveMode) {
          case "supersedes":
            return "preserves history";
          case "delete":
            return "removes sources";
          default: {
            const _exhaustive: never = effectiveMode;
            return _exhaustive;
          }
        }
      })();

      const noteEvidence = sources.map((source) => buildConsolidateNoteEvidence(source.note, allNotes, entryA.note));
      const mergeWarnings = buildGroupWarnings(sources.map((source) => source.note), entryA.note);
      const mergeRisk = aggregateMergeRisk(noteEvidence.map((e) => e.mergeRisk));

      lines.push(`   Mode: ${effectiveMode} (${modeDescription})`);
      if (evidence) {
        for (const note of noteEvidence) {
          lines.push(`   Evidence: ${note.title} | ${note.lifecycle}, ${note.role ?? "untyped"} | ${Math.round(note.ageDays)}d | rel:${note.relatedCount} | risk:${note.mergeRisk}`);
        }
        if (mergeWarnings.length > 0) {
          lines.push(`   Warnings: ${mergeWarnings.join("; ")}`);
        }
        lines.push(`   Merge risk: ${mergeRisk}`);
      }
      lines.push("   To execute:");
      lines.push(`     consolidate({ strategy: "execute-merge", mergePlan: {`);
      lines.push(`       sourceIds: [${sources.map((s) => `"${s.note.id}"`).join(", ")}],`);
      lines.push(`       targetTitle: "${entryA.note.title} (consolidated)"`);
      lines.push(`     }})`);
      lines.push("");

      suggestions.push({
        targetTitle: `${entryA.note.title} (consolidated)`,
        sourceIds: sources.map((s) => s.note.id),
        similarities: similar.map((s) => ({ id: s.entry.note.id, similarity: s.similarity })),
      });
      if (evidence) {
        mergeSuggestions.push({
          targetTitle: `${entryA.note.title} (consolidated)`,
          sourceIds: sources.map((source) => source.note.id),
          mode: effectiveMode,
          notes: noteEvidence,
          warnings: mergeWarnings.length > 0 ? mergeWarnings : undefined,
          mergeRisk,
        });
      }

      checked.add(entryA.note.id);
      for (const s of similar) checked.add(s.entry.note.id);
    }
  }

  if (suggestionCount === 0) {
    lines.push("No merge suggestions found. Try lowering the threshold or manual review.");
  } else {
    lines.push(`Generated ${suggestionCount} merge suggestion(s). Review carefully before executing.`);
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "suggest-merges",
    project: toProjectRef(project),
    notesProcessed: entries.length,
    notesModified: 0,
    mergeSuggestions: evidence ? mergeSuggestions : undefined,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

async function loadEmbeddingsByNoteId(entries: NoteEntry[]): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();

  await Promise.all(entries.map(async (entry) => {
    const record = await entry.vault.storage.readEmbedding(entry.note.id);
    if (record) {
      embeddings.set(entry.note.id, record.embedding);
    }
  }));

  return embeddings;
}

export async function executeMerge(
  ctx: ServerContext,
  entries: NoteEntry[],
  mergePlan: { sourceIds: string[]; targetTitle: string; content?: string; description?: string; summary?: string; tags?: string[] },
  defaultConsolidationMode: ConsolidationMode,
  project: ProjectInfo | undefined,
  cwd?: string,
  explicitMode?: ConsolidationMode,
  policy?: ProjectMemoryPolicy,
  allowProtectedBranch: boolean = false,
  evidence: boolean = true,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const { vaultManager } = ctx;
  const sourceIds = normalizeMergePlanSourceIds(mergePlan.sourceIds);
  const targetTitle = mergePlan.targetTitle.trim();
  const { content: customContent, description, summary, tags } = mergePlan;

  if (sourceIds.length < 2) {
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "execute-merge",
      project: toProjectRef(project),
      notesProcessed: entries.length,
      notesModified: 0,
      warnings: ["execute-merge requires at least two distinct sourceIds."],
    };
    return { content: [{ type: "text", text: "execute-merge requires at least two distinct sourceIds." }], structuredContent };
  }

  if (!targetTitle) {
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "execute-merge",
      project: toProjectRef(project),
      notesProcessed: entries.length,
      notesModified: 0,
      warnings: ["execute-merge requires a non-empty targetTitle."],
    };
    return { content: [{ type: "text", text: "execute-merge requires a non-empty targetTitle." }], structuredContent };
  }

  // Find all source entries
  const sourceEntries: NoteEntry[] = [];
  for (const id of sourceIds) {
    const entry = entries.find((e) => e.note.id === id);
    if (!entry) {
      const structuredContent: ConsolidateResult = {
        action: "consolidated",
        strategy: "execute-merge",
        project: toProjectRef(project),
        notesProcessed: entries.length,
        notesModified: 0,
        warnings: [`Source note '${id}' not found.`],
      };
      return { content: [{ type: "text", text: `Source note '${id}' not found.` }], structuredContent };
    }
    sourceEntries.push(entry);
  }

  const consolidationMode = resolveEffectiveConsolidationMode(
    sourceEntries.map((entry) => entry.note),
    defaultConsolidationMode,
    explicitMode,
  );

  const existingTargetEntry = findExistingExecuteMergeTarget(entries, sourceEntries, targetTitle);
  const projectVault = cwd ? await vaultManager.getProjectVaultIfExists(cwd) : null;
  const targetVault = existingTargetEntry?.vault ?? projectVault ?? vaultManager.main;

  let touchesProjectVault = targetVault.isProject || sourceEntries.some((entry) => entry.vault.isProject);
  if (!touchesProjectVault && consolidationMode === "delete") {
    touchesProjectVault = await wouldRelationshipCleanupTouchProjectVault(ctx, sourceIds);
  }
  if (touchesProjectVault) {
    const projectLabel = project
      ? `${project.name} (${project.id})`
      : "this context";
    const protectedBranchCheck = await shouldBlockProtectedBranchCommit(ctx, {
      cwd,
      writeScope: "project",
      automaticCommit: true,
      projectLabel,
      policy,
      allowProtectedBranch,
      toolName: "consolidate",
    });
    if (protectedBranchCheck.blocked) {
      const message = protectedBranchCheck.message ?? "Protected branch policy blocked this commit.";
      const structuredContent: ConsolidateResult = {
        action: "consolidated",
        strategy: "execute-merge",
        project: toProjectRef(project),
        notesProcessed: entries.length,
        notesModified: 0,
        warnings: [message],
      };
      return { content: [{ type: "text", text: message }], structuredContent };
    }
  }

  const now = isoDateString(new Date().toISOString());

  // Build consolidated content
  const sections: string[] = [];
  if (customContent) {
    if (description) {
      sections.push(description);
      sections.push("");
    }
    sections.push(customContent);
  } else {
    if (description) {
      sections.push(description);
      sections.push("");
    }
    sections.push("## Consolidated from:");
    for (const entry of sourceEntries) {
      sections.push(`### ${entry.note.title}`);
      sections.push(`*Source: \`${entry.note.id}\`*`);
      sections.push("");
      sections.push(entry.note.content);
      sections.push("");
    }
  }

  // Combine tags (deduplicated)
  const combinedTags = tags ?? Array.from(new Set(sourceEntries.flatMap((e) => e.note.tags)));

  // Collect all unique relationships from sources (excluding relationships among sources)
  const sourceIdsSet = new Set(sourceIds);
  const relationshipSources = existingTargetEntry
    ? [...sourceEntries.map((entry) => entry.note), existingTargetEntry.note]
    : sourceEntries.map((entry) => entry.note);
  const allRelationships = mergeRelationshipsFromNotes(relationshipSources, sourceIdsSet);

  // Create or update the consolidated note
  const targetId = existingTargetEntry?.note.id ?? makeId(targetTitle);
  const consolidatedNote: Note = {
    id: targetId,
    title: targetTitle,
    content: sections.join("\n").trim(),
    tags: combinedTags,
    lifecycle: "permanent",
    project: project?.id,
    projectName: project?.name,
    relatedTo: allRelationships,
    createdAt: existingTargetEntry?.note.createdAt ?? now,
    updatedAt: now,
    memoryVersion: 1,
  };

  // Write consolidated note
  await targetVault.storage.writeNote(consolidatedNote);

  let embeddingStatus: { status: "written" | "skipped"; reason?: string } = { status: "written" };

  // Generate embedding for consolidated note
  try {
    const text = await embedTextForNote(targetVault.storage, consolidatedNote);
    const vector = await embed(text);
    await targetVault.storage.writeEmbedding({
      id: targetId,
      model: embedModel,
      embedding: vector,
      updatedAt: now,
    });
  } catch (err) {
    embeddingStatus = { status: "skipped", reason: getErrorMessage(err) };
    console.error(`[embedding] Failed for consolidated note '${targetId}': ${err}`);
  }

  const vaultChanges = new Map<Vault, string[]>();

  // Handle sources based on consolidation mode
  switch (consolidationMode) {
    case "delete": {
      // Delete all sources
      for (const entry of sourceEntries) {
        await entry.vault.storage.deleteNote(entry.note.id);
        addVaultChange(vaultChanges, entry.vault, vaultManager.noteRelPath(entry.vault, entry.note.id));
      }

      const cleanupChanges = await removeRelationshipsToNoteIds(ctx, sourceIds);
      for (const [vault, files] of cleanupChanges) {
        for (const file of files) {
          addVaultChange(vaultChanges, vault, file);
        }
      }
      break;
    }
    case "supersedes": {
      // Mark sources with supersedes relationship
      for (const entry of sourceEntries) {
        const updatedRels = [...(entry.note.relatedTo ?? [])];
        if (!updatedRels.some((r) => r.id === targetId)) {
          updatedRels.push({ id: targetId, type: "supersedes" });
        }
        await entry.vault.storage.writeNote({
          ...entry.note,
          relatedTo: updatedRels,
          updatedAt: now,
        });
        addVaultChange(vaultChanges, entry.vault, vaultManager.noteRelPath(entry.vault, entry.note.id));
      }
      break;
    }
    default: {
      const _exhaustive: never = consolidationMode;
      throw new Error(`Unknown consolidation mode: ${_exhaustive}`);
    }
  }

  // Add consolidated note to changes
  addVaultChange(vaultChanges, targetVault, vaultManager.noteRelPath(targetVault, targetId));

  // Commit changes per vault
  let targetCommitStatus: CommitResult = { status: "skipped", reason: "no-changes" };
  let targetPushStatus: PushResult = { status: "skipped", reason: "no-remote" };
  let targetCommitBody: string | undefined;
  let targetCommitMessage: string | undefined;
  let targetCommitFiles: string[] | undefined;
  for (const [vault, files] of vaultChanges) {
    const isTargetVault = vault === targetVault;

    // Determine action and summary based on mode
    let action: string;
    let sourceSummary: string;
    switch (consolidationMode) {
      case "delete":
        action = "consolidate(delete)";
        sourceSummary = "Deleted as part of consolidation";
        break;
      case "supersedes":
        action = "consolidate(supersedes)";
        sourceSummary = "Marked as superseded by consolidation";
        break;
      default: {
        const _exhaustive: never = consolidationMode;
        throw new Error(`Unknown consolidation mode: ${_exhaustive}`);
      }
    }

    const defaultSummary = `Consolidated ${sourceIds.length} notes into new note`;
    const commitSummary = isTargetVault ? (summary ?? defaultSummary) : sourceSummary;
    const commitBody = isTargetVault
      ? formatCommitBody({
          summary: commitSummary,
          noteId: targetId,
          noteTitle: targetTitle,
          projectName: project?.name,
          mode: consolidationMode,
          noteIds: sourceIds,
          description: `Sources: ${sourceIds.join(", ")}`,
        })
      : formatCommitBody({
          summary: commitSummary,
          noteIds: files.map((f) => f.replace(/\.mnemonic\/notes\/(.+)\.md$/, "$1").replace(/notes\/(.+)\.md$/, "$1")),
        });
    const commitMessage = `${action}: ${targetTitle}`;
    const commitStatus = await vault.git.commitWithStatus(commitMessage, files, commitBody);
    const pushStatus = commitStatus.status === "committed"
      ? await pushAfterMutation(ctx, vault)
      : { status: "skipped" as const, reason: "commit-failed" as const };
    if (isTargetVault) {
      targetCommitStatus = commitStatus;
      targetPushStatus = pushStatus;
      targetCommitBody = commitBody;
      targetCommitMessage = commitMessage;
      targetCommitFiles = [...files];
    }
  }

  const retry = targetCommitMessage && targetCommitFiles
    ? buildMutationRetryContract({
        commit: targetCommitStatus,
        commitMessage: targetCommitMessage,
        commitBody: targetCommitBody,
        files: targetCommitFiles,
        cwd,
        vault: targetVault,
        mutationApplied: true,
      })
    : undefined;

  const persistence = buildPersistenceStatus({
    storage: targetVault.storage,
    id: targetId,
    embedding: embeddingStatus,
    commit: targetCommitStatus,
    push: targetPushStatus,
    commitMessage: targetCommitMessage,
    commitBody: targetCommitBody,
    retry,
  });

  const lines: string[] = [];
  lines.push(`Consolidated ${sourceIds.length} notes into '${targetId}'`);
  lines.push(`Mode: ${consolidationMode}`);
  lines.push(`Stored in: ${storageLabel(targetVault)}`);
  if (existingTargetEntry) {
    lines.push("Idempotency: reused existing target note.");
  }
  lines.push(formatPersistenceSummary(persistence));

  switch (consolidationMode) {
    case "supersedes":
      lines.push("Sources preserved with 'supersedes' relationship.");
      lines.push("Use 'prune-superseded' later to clean up if desired.");
      break;
    case "delete":
      lines.push("Source notes deleted.");
      break;
    default: {
      const _exhaustive: never = consolidationMode;
      throw new Error(`Unknown consolidation mode: ${_exhaustive}`);
    }
  }

  let executeMergeEvidence: ConsolidateExecuteMergeEvidence | undefined;
  if (evidence) {
    const allNotes = entries.map((entry) => entry.note);
    const noteEvidence = sourceEntries.map((entry) =>
      buildConsolidateNoteEvidence(entry.note, allNotes, sourceEntries[0]?.note),
    );
    const mergeWarnings = buildGroupWarnings(
      sourceEntries.map((entry) => entry.note),
      sourceEntries[0]?.note,
    );
    const mergeRisk = aggregateMergeRisk(noteEvidence.map((e) => e.mergeRisk));
    lines.push("  Evidence:");
    for (const note of noteEvidence) {
      lines.push(`    ${note.title} | ${note.lifecycle}, ${note.role ?? "untyped"} | ${Math.round(note.ageDays)}d | rel:${note.relatedCount} | risk:${note.mergeRisk}`);
    }
    if (mergeWarnings.length > 0) {
      lines.push(`  Warnings: ${mergeWarnings.join("; ")}`);
    }
    lines.push(`  Merge risk: ${mergeRisk}`);
    executeMergeEvidence = {
      notes: noteEvidence,
      warnings: mergeWarnings.length > 0 ? mergeWarnings : undefined,
      mergeRisk,
    };
  }

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "execute-merge",
    project: toProjectRef(project),
    notesProcessed: entries.length,
    notesModified: vaultChanges.size,
    executeMergeEvidence,
    persistence,
    retry,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

function findExistingExecuteMergeTarget(
  entries: NoteEntry[],
  sourceEntries: NoteEntry[],
  targetTitle: string,
): NoteEntry | undefined {
  const normalizedTitle = targetTitle.trim();
  const targetSlug = slugify(normalizedTitle);
  const sourceIds: Set<string> = new Set(sourceEntries.map((entry) => entry.note.id));
  let sharedTargetIds: Set<string> | undefined;

  for (const entry of sourceEntries) {
    const supersededTargetIds: Set<string> = new Set(
      (entry.note.relatedTo ?? [])
        .filter((rel) => rel.type === "supersedes")
        .map((rel) => rel.id as string)
        .filter((id) => !sourceIds.has(id)),
    );

    if (supersededTargetIds.size === 0) {
      return undefined;
    }

    sharedTargetIds = sharedTargetIds
      ? new Set([...sharedTargetIds].filter((id) => supersededTargetIds.has(id)))
      : supersededTargetIds;

    if (sharedTargetIds.size === 0) {
      return undefined;
    }
  }

  const candidates = entries
    .filter((entry) => sharedTargetIds?.has(entry.note.id))
    .filter((entry) => entry.note.title.trim() === normalizedTitle)
    .filter((entry) => !targetSlug || entry.note.id === targetSlug || entry.note.id.startsWith(`${targetSlug}-`))
    .sort((left, right) => right.note.updatedAt.localeCompare(left.note.updatedAt));

  return candidates[0];
}

export async function pruneSuperseded(
  ctx: ServerContext,
  entries: NoteEntry[],
  consolidationMode: ConsolidationMode,
  project: ProjectInfo | undefined,
  cwd?: string,
  policy?: ProjectMemoryPolicy,
  allowProtectedBranch: boolean = false,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const { vaultManager } = ctx;

  if (consolidationMode !== "delete") {
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "prune-superseded",
      project: toProjectRef(project),
      notesProcessed: entries.length,
      notesModified: 0,
      warnings: [`prune-superseded requires consolidationMode="delete". Current mode: ${consolidationMode}.`],
    };
    return {
      content: [{
        type: "text",
        text: `prune-superseded requires consolidationMode="delete". Current mode: ${consolidationMode}.\nSet mode explicitly or update project policy.`,
      }],
      structuredContent,
    };
  }

  const lines: string[] = [];
  lines.push(`Pruning superseded notes for ${project?.name ?? "global"}:`);
  lines.push("");

  // Find all notes that have a supersedes relationship pointing to them
  const supersededIds = new Set<string>();
  const supersededBy = new Map<string, string>();

  for (const entry of entries) {
    for (const rel of entry.note.relatedTo ?? []) {
      if (rel.type === "supersedes") {
        supersededIds.add(entry.note.id);
        supersededBy.set(entry.note.id, rel.id);
      }
    }
  }

  if (supersededIds.size === 0) {
    lines.push("No superseded notes found.");
    const structuredContent: ConsolidateResult = {
      action: "consolidated",
      strategy: "prune-superseded",
      project: toProjectRef(project),
      notesProcessed: entries.length,
      notesModified: 0,
    };
    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
  }

  const supersededList = Array.from(supersededIds);
  let touchesProjectVault = supersededList.some((id) => entries.find((e) => e.note.id === id)?.vault.isProject);
  if (!touchesProjectVault) {
    touchesProjectVault = await wouldRelationshipCleanupTouchProjectVault(ctx, supersededList);
  }
  if (touchesProjectVault) {
    const projectLabel = project
      ? `${project.name} (${project.id})`
      : "this context";
    const protectedBranchCheck = await shouldBlockProtectedBranchCommit(ctx, {
      cwd,
      writeScope: "project",
      automaticCommit: true,
      projectLabel,
      policy,
      allowProtectedBranch,
      toolName: "consolidate",
    });
    if (protectedBranchCheck.blocked) {
      const message = protectedBranchCheck.message ?? "Protected branch policy blocked this commit.";
      const structuredContent: ConsolidateResult = {
        action: "consolidated",
        strategy: "prune-superseded",
        project: toProjectRef(project),
        notesProcessed: entries.length,
        notesModified: 0,
        warnings: [message],
      };
      return { content: [{ type: "text", text: message }], structuredContent };
    }
  }

  lines.push(`Found ${supersededIds.size} superseded note(s) to prune:`);
  const vaultChanges = new Map<Vault, string[]>();

  for (const id of supersededIds) {
    const entry = entries.find((e) => e.note.id === id);
    if (!entry) continue;

    const targetId = supersededBy.get(id);
    lines.push(`  - ${entry.note.title} (${id}) -> superseded by ${targetId}`);

    await entry.vault.storage.deleteNote(memoryId(id));
    addVaultChange(vaultChanges, entry.vault, vaultManager.noteRelPath(entry.vault, id));
  }

  const cleanupChanges = await removeRelationshipsToNoteIds(ctx, Array.from(supersededIds));
  for (const [vault, files] of cleanupChanges) {
    for (const file of files) {
      addVaultChange(vaultChanges, vault, file);
    }
  }

  // Commit changes per vault
  let retry: MutationRetryContract | undefined;
  for (const [vault, files] of vaultChanges) {
    const prunedIds = files.map((f) => f.replace(/\.mnemonic\/notes\/(.+)\.md$/, "$1").replace(/notes\/(.+)\.md$/, "$1"));
    const commitBody = formatCommitBody({
      noteIds: prunedIds,
      description: `Pruned ${prunedIds.length} superseded note(s)\nNotes: ${prunedIds.join(", ")}`,
    });
    const commitMessage = `prune: removed ${files.length} superseded note(s)`;
    const commitStatus = await vault.git.commitWithStatus(commitMessage, files, commitBody);
    if (!retry) {
      retry = buildMutationRetryContract({
        commit: commitStatus,
        commitMessage,
        commitBody,
        files,
        cwd,
        vault,
        mutationApplied: true,
      });
    }
    if (commitStatus.status === "committed") {
      await pushAfterMutation(ctx, vault);
    }
  }

  lines.push("");
  lines.push(`Pruned ${supersededIds.size} note(s).`);

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "prune-superseded",
    project: toProjectRef(project),
    notesProcessed: entries.length,
    notesModified: vaultChanges.size,
    retry,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}

export async function dryRunAll(
  entries: NoteEntry[],
  threshold: number,
  defaultConsolidationMode: ConsolidationMode,
  project: ProjectInfo | undefined,
  explicitMode?: ConsolidationMode,
  evidence: boolean = false,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ConsolidateResult }> {
  const lines: string[] = [];
  lines.push(`Consolidation analysis for ${project?.name ?? "global"}:`);
  const modeLabel = explicitMode ?? `${defaultConsolidationMode} (project/default; all-temporary merges auto-delete)`;
  lines.push(`Mode: ${modeLabel} | Threshold: ${threshold}`);
  lines.push("");

  // Run all analysis strategies
  const dupes = await detectDuplicates(entries, threshold, project, evidence);
  lines.push("=== DUPLICATE DETECTION ===");
  lines.push(dupes.content[0]?.text ?? "No output");
  lines.push("");

  const clusters = findClusters(entries, project);
  lines.push("=== CLUSTER ANALYSIS ===");
  lines.push(clusters.content[0]?.text ?? "No output");
  lines.push("");

  const merges = await suggestMerges(entries, threshold, defaultConsolidationMode, project, explicitMode, evidence);
  lines.push("=== MERGE SUGGESTIONS ===");
  lines.push(merges.content[0]?.text ?? "No output");

  const structuredContent: ConsolidateResult = {
    action: "consolidated",
    strategy: "dry-run",
    project: toProjectRef(project),
    notesProcessed: entries.length,
    notesModified: 0,
    duplicatePairs: dupes.structuredContent.duplicatePairs,
    mergeSuggestions: merges.structuredContent.mergeSuggestions,
    themeGroups: clusters.structuredContent.themeGroups,
    relationshipClusters: clusters.structuredContent.relationshipClusters,
  };

  return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
}