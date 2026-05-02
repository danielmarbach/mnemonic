import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { performance } from "perf_hooks";

import { memoryId } from "../brands.js";
import { cosineSimilarity } from "../embeddings.js";
import { getNoteProvenance, computeConfidence } from "../provenance.js";
import { getRelationshipPreview } from "../relationships.js";
import { formatRelationshipPreview } from "../helpers/index.js";
import { resolveProject, ensureBranchSynced } from "../helpers/project.js";
import {
  formatProjectPolicyLine,
  projectNotFoundResponse,
  collectVisibleNotes,
  type NoteEntry,
} from "../helpers/vault.js";
import {
  classifyThemeWithGraduation,
  computeThemesWithGraduation,
  summarizePreview,
  titleCaseTheme,
  daysSinceUpdate,
  withinThemeScore,
  anchorScore,
  computeConnectionDiversity,
  workingStateScore,
  extractNextAction,
} from "../project-introspection.js";
import { getEffectiveMetadata } from "../role-suggestions.js";
import type { Vault } from "../vault.js";
import {
  ProjectSummaryResultSchema,
  type ProjectSummaryResult,
  type ThemeSection,
  type AnchorNote,
  type Confidence,
  type RelationshipPreview,
} from "../structured-content.js";

export function registerProjectMemorySummaryTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "project_memory_summary",
    {
      title: "Project Memory Summary",
      description:
        "Generate a high-level summary of what is already known for a project.\n\n" +
        "Use this when:\n" +
        "- You want fast orientation before starting work\n" +
        "- You need a synthesized overview instead of raw note listings\n\n" +
        "Do not use this when:\n" +
        "- You need exact note contents; use `get`\n" +
        "- You need direct semantic matches for a query; use `recall`\n\n" +
        "Returns:\n" +
        "- A synthesized project-level summary based on stored memories\n" +
        "- Bounded 1-hop relationship previews on orientation entry points (primaryEntry and suggestedNext)\n\n" +
        "- Optional compact working-state recovery hints when relevant temporary notes exist\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `recall` or `list` to drill down into specific areas.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
        maxPerTheme: z.number().int().min(1).max(5).optional().default(3),
        recentLimit: z.number().int().min(1).max(10).optional().default(5),
        anchorLimit: z.number().int().min(1).max(10).optional().default(5),
        includeRelatedGlobal: z.boolean().optional().default(false),
        relatedGlobalLimit: z.number().int().min(1).max(5).optional().default(3),
      }),
      outputSchema: ProjectSummaryResultSchema,
    },
    async ({ cwd, maxPerTheme, recentLimit, anchorLimit, includeRelatedGlobal, relatedGlobalLimit }) => {
      const t0Summary = performance.now();
      await ensureBranchSynced(ctx, cwd);

      // Pre-resolve project so we can pass its id to collectVisibleNotes for session caching
      const preProject = await resolveProject(ctx, cwd);
      const { project, entries } = await collectVisibleNotes(ctx, cwd, "all", undefined, "any", preProject?.id);
      if (!project) {
        return projectNotFoundResponse(cwd);
      }

      // Separate project-scoped notes (for themes/anchors) from global notes
      const projectEntries = entries.filter(e =>
        e.note.project === project.id || e.vault.isProject
      );

      // Empty-project case: no project-scoped notes exist
      if (projectEntries.length === 0) {
        const structuredContent: ProjectSummaryResult = {
          action: "project_summary_shown",
          project: { id: project.id, name: project.name },
          notes: { total: 0, projectVault: 0, mainVault: 0, privateProject: 0 },
          themes: {},
          recent: [],
          anchors: [],
          orientation: {
            primaryEntry: { id: "", title: "No notes", rationale: "Empty project vault" },
            suggestedNext: [],
          },
        };
        return { content: [{ type: "text", text: `No memories found for project ${project.name}.` }], structuredContent };
      }

      const policyLine = await formatProjectPolicyLine(ctx, project.id);

      const projectNoteIds = new Set(projectEntries.map(e => e.note.id));

      // Compute promoted themes from keywords (graduation system)
      const graduationResult = computeThemesWithGraduation(projectEntries.map(e => e.note));
      const promotedThemes = new Set(graduationResult.promotedThemes);
      const themeCache = graduationResult.themeAssignments;

      const inboundReferences = new Map<string, number>();
      const linkedByPermanentNotes = new Map<string, number>();
      for (const entry of projectEntries) {
        for (const rel of entry.note.relatedTo ?? []) {
          if (!projectNoteIds.has(rel.id)) {
            continue;
          }

          inboundReferences.set(rel.id, (inboundReferences.get(rel.id) ?? 0) + 1);
          if (entry.note.lifecycle === "permanent") {
            linkedByPermanentNotes.set(rel.id, (linkedByPermanentNotes.get(rel.id) ?? 0) + 1);
          }
        }
      }

      const effectiveMetadataById = new Map(
        projectEntries.map((entry) => {
          const inbound = inboundReferences.get(entry.note.id) ?? 0;
          const visibleOutbound = (entry.note.relatedTo ?? []).filter((rel) => projectNoteIds.has(rel.id)).length;
          const metadata = getEffectiveMetadata(entry.note, {
            inboundReferences: inbound,
            linkedByPermanentNotes: linkedByPermanentNotes.get(entry.note.id) ?? 0,
            anchorCandidate: entry.note.lifecycle === "permanent" && (visibleOutbound > 0 || inbound > 0),
          });
          return [entry.note.id, {
            metadata,
            inbound,
            visibleOutbound,
          }] as const;
        })
      );

      // Categorize by theme with graduation (project-scoped only)
      const themed = new Map<string, NoteEntry[]>();
      for (const entry of projectEntries) {
        const theme = classifyThemeWithGraduation(entry.note, promotedThemes);
        const bucket = themed.get(theme) ?? [];
        bucket.push(entry);
        themed.set(theme, bucket);
      }

      // Theme order: fixed themes first, then promoted themes alphabetically, then "other"
      const fixedThemes = ["overview", "decisions", "tooling", "bugs", "architecture", "quality"];
      const dynamicThemes = graduationResult.promotedThemes.filter(t => !fixedThemes.includes(t));
      const themeOrder = [...fixedThemes, ...dynamicThemes.sort(), "other"];

      // Collapse thin dynamic-theme buckets (< 2 notes) into "other" to reduce noise.
      // Fixed themes are kept even when small; only keyword-graduated themes are collapsed.
      const fixedThemeSet = new Set(fixedThemes);
      for (const [theme, bucket] of Array.from(themed.entries())) {
        if (!fixedThemeSet.has(theme) && theme !== "other" && bucket.length < 2) {
          const otherBucket = themed.get("other") ?? [];
          otherBucket.push(...bucket);
          themed.set("other", otherBucket);
          themed.delete(theme);
        }
      }

      // Calculate notes distribution (project-scoped only)
      const projectVaultCount = projectEntries.filter(e => e.vault.isProject).length;
      const mainVaultProjectEntries = projectEntries.filter(e => !e.vault.isProject);
      const mainVaultCount = mainVaultProjectEntries.length;
      const totalProjectNotes = projectEntries.length;

      // Build output sections
      const sections: string[] = [];
      sections.push(`Project summary: **${project.name}**`);
      sections.push(`- id: \`${project.id}\``);
      sections.push(`- ${policyLine.replace(/^Policy:\s*/, "policy: ")}`);
      sections.push(`- memories: ${totalProjectNotes} (project-vault: ${projectVaultCount}, main-vault: ${mainVaultCount})`);
      if (mainVaultProjectEntries.length > 0) {
        sections.push(`- private project memories: ${mainVaultProjectEntries.length}`);
      }

      const themes: Record<string, ThemeSection> = {};
      for (const theme of themeOrder) {
        const bucket = themed.get(theme);
        if (!bucket || bucket.length === 0) continue;
        
        // Sort by within-theme score
        const sorted = [...bucket].sort((a, b) => 
          withinThemeScore(b.note, effectiveMetadataById.get(b.note.id)?.metadata) - withinThemeScore(a.note, effectiveMetadataById.get(a.note.id)?.metadata)
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
      const recent = [...projectEntries]
        .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
        .slice(0, recentLimit);
      
      sections.push(`\nRecent activity (start here):`);
      sections.push(...recent.map(e => `- ${e.note.updatedAt} — ${e.note.title}`));

      const temporaryEntries = projectEntries
        .filter((entry) => entry.note.lifecycle === "temporary")
        .map((entry) => {
          const metadata = effectiveMetadataById.get(entry.note.id)?.metadata;
          const score = workingStateScore(entry.note, metadata);
          const nextAction = extractNextAction(entry.note);
          const relatedCount = entry.note.relatedTo?.length ?? 0;
          const days = daysSinceUpdate(entry.note.updatedAt);
          const rationaleParts = [`updated ${days < 1 ? "today" : `${Math.round(days)}d ago`}`];
          if (relatedCount > 0) rationaleParts.push(`${relatedCount} linked note${relatedCount === 1 ? "" : "s"}`);
          if (nextAction) rationaleParts.push("explicit next action");
          if (metadata?.role === "plan" || metadata?.role === "context") rationaleParts.push(`${metadata.role} note`);

          return {
            entry,
            score,
            rationale: rationaleParts.join(", "),
            preview: summarizePreview(entry.note.content, 120),
            nextAction,
          };
        })
        .filter((candidate) => candidate.score > -Infinity)
        .sort((a, b) => b.score - a.score || b.entry.note.updatedAt.localeCompare(a.entry.note.updatedAt))
        .slice(0, 3);

      const workingState = temporaryEntries.length > 0
        ? {
            summary:
              temporaryEntries.length === 1
                ? `1 temporary note may help resume active work.`
                : `${temporaryEntries.length} temporary notes may help resume active work.`,
            recoveryHint: "Orient with project_memory_summary first, then inspect these temporary notes if you need to continue in-progress work.",
            notes: temporaryEntries.map(({ entry, rationale, preview, nextAction }) => ({
              id: entry.note.id,
              title: entry.note.title,
              updatedAt: entry.note.updatedAt,
              rationale,
              preview,
              nextAction,
            })),
          }
        : undefined;

      // Anchor notes with diversity constraint (project-scoped only)
      const scoredAnchorCandidates = projectEntries
        .map(e => {
          const baselineContext = effectiveMetadataById.get(e.note.id);
          const metadata = baselineContext?.metadata;
          return {
            entry: e,
            metadata,
            score: anchorScore(e.note, themeCache, metadata),
            theme: themeCache.get(e.note.id) ?? "other",
            alwaysLoad: metadata?.alwaysLoad === true,
            explicitOrientationRole:
              metadata?.roleSource === "explicit" &&
              (metadata.role === "summary" || metadata.role === "decision"),
            hasVisibleGraphParticipation: (baselineContext?.visibleOutbound ?? 0) > 0 || (baselineContext?.inbound ?? 0) > 0,
          };
        })
        .filter(candidate => candidate.score > -Infinity)
        .filter(candidate => candidate.alwaysLoad || candidate.explicitOrientationRole || candidate.hasVisibleGraphParticipation)
        .sort((a, b) => b.score - a.score || a.entry.note.title.localeCompare(b.entry.note.title));

      // Enforce max 2 per theme for scored anchors
      const anchorThemeCounts = new Map<string, number>();
      const anchors: AnchorNote[] = [];
      const anchorIds = new Set<string>();

      // Add scored anchors with theme diversity constraint
      for (const candidate of scoredAnchorCandidates) {
        if (anchors.length >= 10) break;

        const theme = candidate.theme;
        const themeCount = anchorThemeCounts.get(theme) ?? 0;
        if (themeCount >= 2) continue;

        anchors.push({
          id: candidate.entry.note.id,
          title: candidate.entry.note.title,
          centrality: candidate.entry.note.relatedTo?.length ?? 0,
          connectionDiversity: computeConnectionDiversity(candidate.entry.note, themeCache),
          updatedAt: candidate.entry.note.updatedAt,
        });
        anchorIds.add(candidate.entry.note.id);
        anchorThemeCounts.set(theme, themeCount + 1);
      }

      if (anchors.length > 0) {
        sections.push(`\nAnchors:`);
        sections.push(...anchors.slice(0, 5).map(a => 
          `- ${a.title} (\`${a.id}\`) — centrality: ${a.centrality}, diversity: ${a.connectionDiversity}`
        ));
      }

      // Compute orientation after anchors are computed (for text output)
      let relatedGlobal: ProjectSummaryResult["relatedGlobal"];
      
      if (includeRelatedGlobal) {
        const anchorEmbeddings = await Promise.all(
          anchors.slice(0, 5).map(async a => {
            for (const vault of ctx.vaultManager.allKnownVaults()) {
              const emb = await vault.storage.readEmbedding(memoryId(a.id));
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
              const projection = await entry.vault.storage.readProjection(entry.note.id);
              const preview = projection?.summary
                ? projection.summary.slice(0, 100)
                : summarizePreview(entry.note.content, 100);
              globalCandidates.push({
                id: entry.note.id,
                title: entry.note.title,
                similarity: maxSim,
                preview,
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

      // Compute orientation layer for actionable guidance
      const primaryAnchor = anchors[0];

      // Build noteId -> vault lookup for provenance enrichment
      const noteVaultMap = new Map<string, Vault>();
      for (const entry of projectEntries) {
        noteVaultMap.set(entry.note.id, entry.vault);
      }

      // Helper to enrich an anchor with provenance and confidence
      const enrichOrientationNote = async (anchor: AnchorNote) => {
        const vault = noteVaultMap.get(anchor.id);
        if (!vault) return {};
        const filePath = `${vault.notesRelDir}/${anchor.id}.md`;
        const provenance = await getNoteProvenance(vault.git, filePath);
        const confidence = computeConfidence("permanent", anchor.updatedAt, anchor.centrality);
        return { provenance, confidence };
      };

      // Helper to enrich an anchor with relationships (1-hop expansion)
      const enrichOrientationNoteWithRelationships = async (anchor: AnchorNote) => {
        const vault = noteVaultMap.get(anchor.id);
        if (!vault) return {};
        const note = await vault.storage.readNote(memoryId(anchor.id));
        if (!note) return {};
        const relationships = await getRelationshipPreview(
          note,
          ctx.vaultManager.allKnownVaults(),
          { activeProjectId: project.id, limit: 3 }
        );
        return { relationships };
      };

      const primaryEnriched = primaryAnchor ? await enrichOrientationNote(primaryAnchor) : {};
      const primaryRelationships = primaryAnchor ? await enrichOrientationNoteWithRelationships(primaryAnchor) : {};

      // Select theme-diverse suggestedNext: avoid repeating the primary anchor's theme.
      // Backfills without constraint if not enough theme-distinct candidates exist.
      const primaryTheme = primaryAnchor ? (themeCache.get(primaryAnchor.id) ?? "other") : "other";
      const usedSuggestedThemes = new Set([primaryTheme]);
      const suggestedCandidates: typeof anchors = [];
      for (const anchor of anchors.slice(1)) {
        if (suggestedCandidates.length >= 3) break;
        const anchorTheme = themeCache.get(anchor.id) ?? "other";
        if (!usedSuggestedThemes.has(anchorTheme)) {
          suggestedCandidates.push(anchor);
          usedSuggestedThemes.add(anchorTheme);
        }
      }
      for (const anchor of anchors.slice(1)) {
        if (suggestedCandidates.length >= 3) break;
        if (!suggestedCandidates.includes(anchor)) {
          suggestedCandidates.push(anchor);
        }
      }

      const suggestedEnriched = await Promise.all(suggestedCandidates.map(enrichOrientationNote));
      const suggestedRelationships = await Promise.all(suggestedCandidates.map(enrichOrientationNoteWithRelationships));

      const recentPermanent = recent.find((entry) => entry.note.lifecycle === "permanent");
      const fallbackEntry = recentPermanent ?? recent[0];
      const permanentOverrideUsed = Boolean(recentPermanent && recent[0] && recentPermanent.note.id !== recent[0].note.id);

      // Enrich fallback primaryEntry when no anchors exist
      let fallbackEnriched: { provenance?: { lastUpdatedAt: string; lastCommitHash: string; lastCommitMessage: string; recentlyChanged: boolean }; confidence?: Confidence } = {};
      let fallbackRelationships: { relationships?: RelationshipPreview } = {};
      if (!primaryAnchor && fallbackEntry) {
        const fallbackNote = fallbackEntry.note;
        const vault = noteVaultMap.get(fallbackNote.id);
        if (vault) {
          const filePath = `${vault.notesRelDir}/${fallbackNote.id}.md`;
          const provenance = await getNoteProvenance(vault.git, filePath);
          const confidence = computeConfidence(fallbackNote.lifecycle, fallbackNote.updatedAt, 0);
          fallbackEnriched = { provenance, confidence };
        }
        const preview = await getRelationshipPreview(
          fallbackNote,
          ctx.vaultManager.allKnownVaults(),
          { activeProjectId: project.id, limit: 3 }
        );
        if (preview) fallbackRelationships = { relationships: preview };
      }

      const orientation: ProjectSummaryResult["orientation"] = {
        primaryEntry: primaryAnchor
          ? {
              id: primaryAnchor.id,
              title: primaryAnchor.title,
              rationale: `Centrality ${primaryAnchor.centrality}, connects ${primaryAnchor.connectionDiversity} themes`,
              ...primaryEnriched,
              ...primaryRelationships,
            }
          : {
              id: fallbackEntry?.note.id ?? projectEntries[0]?.note.id ?? "",
              title: fallbackEntry?.note.title ?? projectEntries[0]?.note.title ?? "No notes",
              rationale: permanentOverrideUsed
                ? "Most recent permanent note — no high-centrality anchors found"
                : fallbackEntry
                ? "Most recent note — no high-centrality anchors found"
                : "Only note available",
              ...fallbackEnriched,
              ...fallbackRelationships,
            },
        suggestedNext: suggestedCandidates.map((a, i) => ({
          id: a.id,
          title: a.title,
          rationale: `Centrality ${a.centrality}, connects ${a.connectionDiversity} themes`,
          ...suggestedEnriched[i],
          ...suggestedRelationships[i],
        })),
      };

      // Warning for taxonomy dilution
      const otherBucket = themed.get("other");
      const otherCount = otherBucket?.length ?? 0;
      const otherRatio = projectEntries.length > 0 ? otherCount / projectEntries.length : 0;
      if (otherRatio > 0.3) {
        orientation.warnings = [
          `${Math.round(otherRatio * 100)}% of notes in "other" bucket — consider improving thematic classification`,
        ];
      }

      // Orientation text output
      sections.push(`\nOrientation:`);
      sections.push(`Start with: ${orientation.primaryEntry.title} (\`${orientation.primaryEntry.id}\`)`);
      sections.push(`  Rationale: ${orientation.primaryEntry.rationale}`);
      if (orientation.primaryEntry.confidence) {
        sections.push(`  Confidence: ${orientation.primaryEntry.confidence}`);
      }
      if (orientation.primaryEntry.relationships) {
        sections.push(`  ${formatRelationshipPreview(orientation.primaryEntry.relationships)}`);
      }
      if (orientation.suggestedNext.length > 0) {
        sections.push(`Then check:`);
        for (const next of orientation.suggestedNext) {
          sections.push(`  - ${next.title} (\`${next.id}\`) — ${next.rationale}${next.confidence ? ` [${next.confidence}]` : ""}`);
          if (next.relationships) {
            sections.push(`    ${formatRelationshipPreview(next.relationships)}`);
          }
        }
      }
      if (orientation.warnings && orientation.warnings.length > 0) {
        sections.push(`Warnings:`);
        for (const w of orientation.warnings) {
          sections.push(`  - ${w}`);
        }
      }

      if (workingState) {
        sections.push(`\nWorking state:`);
        sections.push(workingState.summary);
        sections.push(`Recovery hint: ${workingState.recoveryHint}`);
        for (const note of workingState.notes) {
          sections.push(`- ${note.title} (\`${note.id}\`) — ${note.rationale}`);
          sections.push(`  Preview: ${note.preview}`);
          if (note.nextAction) {
            sections.push(`  Next action: ${note.nextAction}`);
          }
        }
      }

      // Related global notes (optional, anchor-based similarity)

      const structuredContent: ProjectSummaryResult = {
        action: "project_summary_shown",
        project: { id: project.id, name: project.name },
        notes: {
          total: totalProjectNotes,
          projectVault: projectVaultCount,
          mainVault: mainVaultCount,
          privateProject: mainVaultProjectEntries.length,
        },
        themes,
        recent: recent.map(e => ({
          id: e.note.id,
          title: e.note.title,
          updatedAt: e.note.updatedAt,
          theme: classifyThemeWithGraduation(e.note, promotedThemes),
        })),
        anchors,
        orientation,
        workingState,
        relatedGlobal,
      };

      console.error(`[summary:timing] ${(performance.now() - t0Summary).toFixed(1)}ms`);
      return { content: [{ type: "text", text: sections.join("\n") }], structuredContent };
    }
  );
}
