import type { Note } from "./storage.js";
import type { Storage } from "./storage.js";
import type { NoteProjection } from "./structured-content.js";

const MAX_SUMMARY_LENGTH = 280;
const MAX_HEADINGS = 8;
const MAX_PROJECTION_TEXT_LENGTH = 1200;

// ── Summary extraction ────────────────────────────────────────────────────────

/**
 * Extract a summary from a note using a three-step fallback:
 * 1. First non-empty paragraph after title/frontmatter
 * 2. First bullet list block converted to plain text
 * 3. First 200 chars of plain text body
 */
export function extractProjectionSummary(note: Note): string {
  const body = note.content.trim();
  if (!body) return "";

  // Strip leading heading lines (# Title, ## Title, etc.) from the body
  const lines = body.split("\n");
  let start = 0;
  while (start < lines.length && /^#{1,6}\s/.test(lines[start]!.trim())) {
    start++;
  }
  const bodyWithoutLeadingHeading = lines.slice(start).join("\n").trim();

  // Step 1: first non-empty paragraph (text block separated by blank lines)
  const paragraphs = bodyWithoutLeadingHeading.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    // Skip headings, code blocks, and list-only blocks
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (trimmed.startsWith("```")) continue;
    // If it's purely a list block, skip to step 2
    const paraLines = trimmed.split("\n");
    const isListBlock = paraLines.every(l => /^\s*[-*+]|\s*\d+\.\s/.test(l.trim()) || l.trim() === "");
    if (!isListBlock) {
      const plain = stripMarkdownInline(trimmed);
      return truncate(collapseWhitespace(plain), MAX_SUMMARY_LENGTH);
    }
  }

  // Step 2: first bullet list block converted to plain text
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const paraLines = trimmed.split("\n");
    const isListBlock = paraLines.some(l => /^\s*[-*+]|\s*\d+\.\s/.test(l.trim()));
    if (isListBlock) {
      const plain = paraLines
        .map(l => l.replace(/^\s*[-*+]\s*/, "").replace(/^\s*\d+\.\s*/, "").trim())
        .filter(Boolean)
        .join("; ");
      return truncate(collapseWhitespace(stripMarkdownInline(plain)), MAX_SUMMARY_LENGTH);
    }
  }

  // Step 3: first 200 chars of plain text body
  const plain = stripMarkdownInline(bodyWithoutLeadingHeading);
  const collapsed = collapseWhitespace(plain);
  return truncate(collapsed, Math.min(200, MAX_SUMMARY_LENGTH));
}

// ── Heading extraction ────────────────────────────────────────────────────────

/**
 * Extract headings (# ## ###) from markdown content.
 * Returns plain text, in order, deduplicated, max 8 headings.
 */
export function extractHeadings(markdown: string): string[] {
  const seen = new Set<string>();
  const headings: string[] = [];

  for (const line of markdown.split("\n")) {
    const match = /^(#{1,3})\s+(.+)/.exec(line.trim());
    if (!match) continue;
    const text = stripMarkdownInline(match[2]!).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    headings.push(text);
    if (headings.length >= MAX_HEADINGS) break;
  }

  return headings;
}

// ── Projection text ───────────────────────────────────────────────────────────

/**
 * Build the projection text string used for embeddings.
 * Max 1200 chars; truncates headings section if needed.
 */
export function buildProjectionText(projection: Pick<NoteProjection, "title" | "lifecycle" | "tags" | "summary" | "headings">): string {
  const parts: string[] = [
    `Title: ${projection.title}`,
    projection.lifecycle ? `Lifecycle: ${projection.lifecycle}` : "",
    projection.tags.length > 0 ? `Tags: ${projection.tags.join(", ")}` : "",
    projection.summary ? `Summary: ${projection.summary}` : "",
    projection.headings.length > 0 ? `Headings: ${projection.headings.join(" | ")}` : "",
  ].filter(Boolean);

  const text = parts.join("\n");
  if (text.length <= MAX_PROJECTION_TEXT_LENGTH) {
    return text;
  }

  // Truncate headings if needed to stay within limit
  const withoutHeadings = parts.slice(0, -1).join("\n");
  if (withoutHeadings.length >= MAX_PROJECTION_TEXT_LENGTH) {
    return withoutHeadings.slice(0, MAX_PROJECTION_TEXT_LENGTH);
  }

  const headingsPrefix = "Headings: ";
  const available = MAX_PROJECTION_TEXT_LENGTH - withoutHeadings.length - 1; // -1 for \n
  const truncatedHeadings = headingsPrefix + projection.headings.join(" | ").slice(0, available - headingsPrefix.length);
  return `${withoutHeadings}\n${truncatedHeadings}`;
}

// ── Projection model ──────────────────────────────────────────────────────────

/**
 * Build a full NoteProjection from a Note.
 */
export function buildProjection(note: Note): NoteProjection {
  const summary = extractProjectionSummary(note);
  const headings = extractHeadings(note.content);
  const partial = {
    title: note.title,
    lifecycle: note.lifecycle,
    tags: note.tags,
    summary,
    headings,
  };
  const projectionText = buildProjectionText(partial);

  return {
    noteId: note.id,
    title: note.title,
    summary,
    headings,
    tags: note.tags,
    lifecycle: note.lifecycle,
    updatedAt: note.updatedAt,
    projectionText,
    generatedAt: new Date().toISOString(),
  };
}

// ── Staleness detection ───────────────────────────────────────────────────────

/**
 * A projection is stale when:
 * - projection is missing → stale (caller handles null case)
 * - projection.updatedAt missing → stale
 * - updatedAt differs AND projected content actually changed
 *
 * Relationship-only changes bump note.updatedAt without affecting projectionText.
 * Comparing projectionText avoids unnecessary re-embeds in those cases.
 */
export function isProjectionStale(note: Note, projection: NoteProjection): boolean {
  if (!projection.updatedAt) return true;
  if (projection.updatedAt === note.updatedAt) return false;
  const currentText = buildProjectionText({
    title: note.title,
    lifecycle: note.lifecycle,
    tags: note.tags,
    summary: extractProjectionSummary(note),
    headings: extractHeadings(note.content),
  });
  return currentText !== projection.projectionText;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/**
 * Read a stored projection, or null if not found.
 */
export async function getProjection(storage: Storage, noteId: string): Promise<NoteProjection | null> {
  return storage.readProjection(noteId);
}

/**
 * Build (or return cached) projection for a note.
 * Always returns a valid projection; builds on demand if missing or stale.
 * Saves the fresh projection to storage.
 */
export async function getOrBuildProjection(storage: Storage, note: Note): Promise<NoteProjection> {
  const existing = await storage.readProjection(note.id);
  if (existing && !isProjectionStale(note, existing)) {
    return existing;
  }
  const fresh = buildProjection(note);
  await storage.writeProjection(fresh).catch(() => {
    // Best-effort save; never block the caller
  });
  return fresh;
}

/**
 * Save a projection to storage.
 */
export async function saveProjection(storage: Storage, projection: NoteProjection): Promise<void> {
  return storage.writeProjection(projection);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

/**
 * Strip common inline markdown: bold, italic, code spans, links, images.
 */
function stripMarkdownInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // links
    .replace(/`([^`]+)`/g, "$1")              // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // bold **
    .replace(/__([^_]+)__/g, "$1")            // bold __
    .replace(/\*([^*]+)\*/g, "$1")            // italic *
    .replace(/_([^_]+)_/g, "$1")              // italic _
    .replace(/~~([^~]+)~~/g, "$1")            // strikethrough
    .trim();
}
