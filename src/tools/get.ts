import { z } from "zod";
import { performance } from "perf_hooks";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server-context.js";
import type { Note } from "../storage.js";
import { hasNoteContent } from "../storage.js";
import type { Vault } from "../vault.js";
import { memoryId } from "../brands.js";
import {
  GetResultSchema,
  EntityRefSchema,
  type GetResult,
  type RelationshipPreview,
} from "../structured-content.js";
import {
  ensureBranchSynced,
  resolveProject,
  noteProjectRef,
  projectParam,
} from "../helpers/project.js";
import { storageLabel } from "../helpers/vault.js";
import { formatRelationshipPreview } from "../helpers/index.js";
import { getSessionCachedNote, setSessionCachedNote, recordSessionNoteAccess } from "../cache.js";
import { getRelationshipPreview } from "../relationships.js";
import {
  isDocumentEntityRef,
  parseEntityRef as parseDocumentEntityRef,
} from "../document-entity-ref.js";
import { getCurrentGeneration } from "../generation-storage.js";

// Extract attachment ID from a document ID (format: attachmentId::normalizedPath)
function extractAttachmentId(documentId: string): string {
  const sepIndex = documentId.indexOf("::");
  return sepIndex === -1 ? documentId : documentId.slice(0, sepIndex);
}

export function registerGetTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get",
    {
      title: "Get Memory",
      description:
        "Use after `recall`, `list`, or `recent_memories` when you need the full note content.\n\n" +
        "Use this when:\n" +
        "- You already know the memory id and need the full note content\n" +
        "- A previous tool returned ids that you now want to inspect exactly\n" +
        "- You have a document or chunk retrieval handle (doc: or chunk: prefix) and need the full content\n\n" +
        "Do not use this when:\n" +
        "- You are still searching by topic; use `recall`\n" +
        "- You want to browse many notes; use `list`\n\n" +
        "Returns: full note content, metadata, storage label. With includeRelationships: bounded 1-hop previews.\n\n" +
        "Document-source entities (doc:/chunk: IDs) return source text with media type info. " +
        "Returns documents (source text, media type, attachment info), items (ordered discriminated notes + documents), and itemErrors (per-item errors for stale/evicted/oversized/unknown references). " +
        "Mutation follow-ups (update, forget, etc.) apply only to memory results.\n\n" +
        "Typical next step:\n" +
        "- Use `update`, `forget`, `move_memory`, or `relate` after inspection.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        ids: z
          .array(EntityRefSchema)
          .min(1)
          .describe(
            "One or more memory ids, or document/chunk retrieval handles (doc:... / chunk:...), to fetch",
          ),
        cwd: projectParam,
        includeRelationships: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include bounded direct relationship previews (1-hop expansion, max 3 shown)"),
      }),
      outputSchema: GetResultSchema,
    },
    async ({ ids, cwd, includeRelationships }) => {
      const t0Get = performance.now();
      await ensureBranchSynced(ctx, cwd);

      const project = await resolveProject(ctx, cwd);
      const found: GetResult["notes"] = [];
      const documents: NonNullable<GetResult["documents"]> = [];
      const items: NonNullable<GetResult["items"]> = [];
      const itemErrors: NonNullable<GetResult["itemErrors"]> = [];
      const notFound: string[] = [];

      for (const id of ids) {
        // Check if this is a document/chunk entity reference
        if (isDocumentEntityRef(id)) {
          const parsed = parseDocumentEntityRef(id);
          if (parsed.kind === "unknown") {
            itemErrors.push({
              id,
              error: "Invalid document/chunk reference format",
              code: "unknown-document",
            });
            continue;
          }

          if (parsed.kind === "document") {
            // Look up document in current generation
            const attachmentId = extractAttachmentId(parsed.documentId);
            const generation = getCurrentGeneration(attachmentId);
            if (!generation) {
              itemErrors.push({
                id,
                error: "Document not found in current generation",
                code: "index-unavailable",
              });
              continue;
            }

            const doc = generation.documents.get(parsed.documentId);
            if (!doc) {
              itemErrors.push({
                id,
                error: "Document not found in generation",
                code: "unknown-document",
              });
              continue;
            }

            const content = generation.extractedText.get(parsed.documentId);
            if (!content) {
              itemErrors.push({
                id,
                error: "Document content not available",
                code: "index-unavailable",
              });
              continue;
            }

            const docResult = {
              documentId: doc.documentId as unknown as string,
              sourcePath: doc.sourcePath,
              sourceMediaType: doc.sourceMediaType,
              content,
              contentMediaType: doc.extractedContentMediaType,
              attachmentId: generation.manifest.attachmentId,
              generationId: generation.manifest.generationId as unknown as string,
              indexedCommit: generation.manifest.indexedCommit,
            };
            documents.push(docResult);
            items.push({ kind: "document" as const, ...docResult });
          } else if (parsed.kind === "chunk") {
            // Chunk reference — chunkId is always present on ChunkEntityRef
            const attachmentId = extractAttachmentId(parsed.documentId);
            const generation = getCurrentGeneration(attachmentId);
            if (!generation) {
              itemErrors.push({
                id,
                error: "Chunk not found in current generation",
                code: "index-unavailable",
              });
              continue;
            }

            const chunk = generation.chunks.get(parsed.chunkId);
            if (!chunk) {
              itemErrors.push({
                id,
                error: "Chunk not found in generation",
                code: "unknown-document",
              });
              continue;
            }

            const doc = generation.documents.get(parsed.documentId);
            const docResult = {
              documentId: chunk.documentId as unknown as string,
              sourcePath: doc?.sourcePath ?? "",
              sourceMediaType: doc?.sourceMediaType ?? "text/markdown",
              content: chunk.content,
              contentMediaType: chunk.contentMediaType,
              attachmentId: generation.manifest.attachmentId,
              generationId: generation.manifest.generationId as unknown as string,
              indexedCommit: generation.manifest.indexedCommit,
            };
            documents.push(docResult);
            items.push({ kind: "document" as const, ...docResult });
          } else if (parsed.kind === "memory") {
            // Unreachable: the isDocumentEntityRef(id) guard above excludes
            // bare memory IDs (no doc:/chunk: prefix). Handled explicitly so
            // the exhaustiveness check below narrows to never.
            itemErrors.push({
              id,
              error: "Memory ID resolved in document/chunk branch",
              code: "unknown-document",
            });
            continue;
          } else {
            // Exhaustiveness check: if a new EntityRef variant is added,
            // TypeScript will error here because parsed is not narrowed to never.
            const _exhaustive: never = parsed;
            void _exhaustive;
            throw new Error("Unhandled entity kind");
          }
          continue;
        }

        // Memory ID — existing behavior
        let result: { note: Note; vault: Vault } | null = null;
        if (project) {
          for (const vault of ctx.vaultManager.allKnownVaults(project.id)) {
            const cached = getSessionCachedNote(project.id, vault.storage.vaultPath, id);
            if (cached !== undefined) {
              if (hasNoteContent(cached)) {
                result = { note: cached, vault };
                break;
              }
              // Metadata-only cache entry — load full content from storage.
              const full = await vault.storage.readNote(memoryId(id));
              if (full) {
                result = { note: full, vault };
                break;
              }
            }
          }
        }
        if (!result) {
          result = await ctx.vaultManager.findNote(id, cwd, { projectId: project?.id });
        }
        if (!result) {
          notFound.push(id);
          continue;
        }
        const { note, vault } = result;

        let relationships: RelationshipPreview | undefined;
        if (includeRelationships) {
          relationships = await getRelationshipPreview(
            note,
            ctx.vaultManager.allKnownVaults(project?.id),
            {
              activeProjectId: project?.id,
              sourceVaultPath: vault.storage.vaultPath,
              limit: 3,
            },
          );
        }

        const noteResult = {
          id: note.id,
          title: note.title,
          content: note.content,
          project: noteProjectRef(note),
          tags: note.tags,
          lifecycle: note.lifecycle,
          role: note.role,
          alwaysLoad: note.alwaysLoad,
          relatedTo: note.relatedTo,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          vault: storageLabel(vault),
          relationships,
        };
        found.push(noteResult);
        items.push({ kind: "note" as const, ...noteResult });

        if (project) {
          setSessionCachedNote(project.id, vault.storage.vaultPath, note);
          recordSessionNoteAccess(project.id, vault.storage.vaultPath, note.id, "get");
        }
      }

      const lines: string[] = [];
      for (const note of found) {
        lines.push(`## ${note.title} (${note.id})`);
        lines.push(
          `project: ${note.project?.name ?? "global"} | stored: ${note.vault} | lifecycle: ${note.lifecycle}${note.role ? ` | role: ${note.role}` : ""}`,
        );
        if (note.tags.length > 0) lines.push(`tags: ${note.tags.join(", ")}`);
        lines.push("");
        lines.push(note.content);
        if (note.relationships) {
          lines.push("");
          lines.push(formatRelationshipPreview(note.relationships));
        }
        lines.push("");
      }
      for (const doc of documents) {
        lines.push(`## Document: ${doc.sourcePath} (${doc.documentId})`);
        lines.push(
          `sourceMediaType: ${doc.sourceMediaType} | contentMediaType: ${doc.contentMediaType} | attachment: ${doc.attachmentId} | generation: ${doc.generationId}`,
        );
        lines.push("");
        lines.push(doc.content);
        lines.push("");
      }
      if (itemErrors.length > 0) {
        for (const err of itemErrors) {
          lines.push(`Error: ${err.id} — ${err.error} (${err.code})`);
        }
      }
      if (notFound.length > 0) {
        lines.push(`Not found: ${notFound.join(", ")}`);
      }

      const structuredContent: GetResult = {
        action: "got",
        count: found.length + documents.length,
        notes: found,
        notFound,
        documents: documents.length > 0 ? documents : undefined,
        items: items.length > 0 ? items : undefined,
        itemErrors: itemErrors.length > 0 ? itemErrors : undefined,
      };

      console.error(`[get:timing] ${(performance.now() - t0Get).toFixed(1)}ms`);
      return { content: [{ type: "text", text: lines.join("\n").trim() }], structuredContent };
    },
  );
}
