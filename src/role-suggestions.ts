import type { Note, NoteImportance, NoteRole } from "./storage.js";

export interface RoleSuggestionContext {
  inboundReferences?: number;
  linkedByPermanentNotes?: number;
  anchorCandidate?: boolean;
}

export interface EffectiveNoteMetadata {
  role?: NoteRole;
  roleSource: "explicit" | "suggested" | "none";
  importance?: NoteImportance;
  importanceSource: "explicit" | "suggested" | "none";
  alwaysLoad?: boolean;
  alwaysLoadSource: "explicit" | "none";
}

type SuggestedImportance = Exclude<NoteImportance, "low">;

interface ContentShape {
  headingCount: number;
  bulletCount: number;
  checklistCount: number;
  numberedCount: number;
  colonPairCount: number;
  tableRowCount: number;
  paragraphCount: number;
  shortLineCount: number;
}

interface RoleScore {
  role: NoteRole;
  score: number;
}

const ROLE_THRESHOLD = 5;
const ROLE_MARGIN = 2;

export function getEffectiveMetadata(
  note: Note,
  context: RoleSuggestionContext = {}
): EffectiveNoteMetadata {
  const effectiveRole = note.role ?? suggestRole(note, context);
  const effectiveImportance = note.importance ?? suggestImportance(note, context);

  return {
    role: effectiveRole,
    roleSource: note.role ? "explicit" : effectiveRole ? "suggested" : "none",
    importance: effectiveImportance,
    importanceSource: note.importance ? "explicit" : effectiveImportance ? "suggested" : "none",
    alwaysLoad: typeof note.alwaysLoad === "boolean" ? note.alwaysLoad : undefined,
    alwaysLoadSource: typeof note.alwaysLoad === "boolean" ? "explicit" : "none",
  };
}

export function suggestRole(
  note: Note,
  context: RoleSuggestionContext = {}
): NoteRole | undefined {
  const shape = analyzeContent(note.content, note.title);
  const inbound = context.inboundReferences ?? 0;
  const linkedByPermanentNotes = context.linkedByPermanentNotes ?? 0;
  const explanatoryRelations = note.relatedTo?.filter((rel) => rel.type === "explains" || rel.type === "supersedes").length ?? 0;
  const totalRelations = note.relatedTo?.length ?? 0;

  const scores: RoleScore[] = [
    {
      role: "summary",
      score:
        (inbound >= 4 ? 3 : 0) +
        (linkedByPermanentNotes >= 2 ? 2 : 0) +
        (shape.headingCount >= 2 ? 1 : 0) +
        (shape.bulletCount >= 4 ? 1 : 0),
    },
    {
      role: "decision",
      score:
        (explanatoryRelations >= 2 ? 5 : 0) +
        (shape.headingCount >= 2 ? 1 : 0) +
        (shape.bulletCount >= 2 ? 1 : 0) +
        (shape.paragraphCount >= 2 ? 1 : 0),
    },
    {
      role: "plan",
      score:
        (shape.numberedCount >= 2 ? 3 : 0) +
        (shape.checklistCount >= 2 ? 2 : 0) +
        (shape.numberedCount + shape.checklistCount + shape.bulletCount >= 4 ? 1 : 0),
    },
    {
      role: "reference",
      score:
        (shape.colonPairCount >= 4 ? 3 : 0) +
        (shape.tableRowCount >= 3 ? 2 : 0) +
        (shape.shortLineCount >= 4 ? 1 : 0),
    },
    {
      role: "context",
      score:
        (note.lifecycle === "permanent" ? 2 : 0) +
        (shape.headingCount >= 2 ? 2 : shape.headingCount >= 1 ? 1 : 0) +
        (shape.paragraphCount >= 2 ? 1 : 0) +
        (inbound >= 1 || totalRelations >= 1 ? 1 : 0),
    },
  ];

  scores.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.role.localeCompare(right.role);
  });

  const [best, second] = scores;
  if (!best || best.score < ROLE_THRESHOLD) {
    return undefined;
  }

  if ((best.score - (second?.score ?? 0)) < ROLE_MARGIN) {
    return undefined;
  }

  return best.role;
}

export function suggestImportance(
  note: Note,
  context: RoleSuggestionContext = {}
): SuggestedImportance | undefined {
  const inbound = context.inboundReferences ?? 0;
  const linkedByPermanentNotes = context.linkedByPermanentNotes ?? 0;
  const outbound = note.relatedTo?.length ?? 0;
  const connections = inbound + outbound + linkedByPermanentNotes;
  const shape = analyzeContent(note.content, note.title);
  const structuralStrength =
    (shape.headingCount >= 2 ? 1 : 0) +
    (shape.bulletCount >= 4 ? 1 : 0) +
    (shape.numberedCount >= 2 ? 1 : 0) +
    (shape.colonPairCount >= 4 ? 1 : 0) +
    (shape.tableRowCount >= 3 ? 1 : 0);
  const anchorBaseline = context.anchorCandidate && note.lifecycle === "permanent" ? 1 : 0;
  const graphSignal = inbound + outbound + linkedByPermanentNotes + anchorBaseline;

  if (
    note.lifecycle === "permanent" &&
    inbound >= 4 &&
    linkedByPermanentNotes >= 2 &&
    (connections + structuralStrength + anchorBaseline) >= 10
  ) {
    return "high";
  }

  if (
    note.lifecycle === "permanent" &&
    graphSignal >= 1 &&
    (connections >= 2 || structuralStrength >= 2)
  ) {
    return "normal";
  }

  return undefined;
}

function analyzeContent(content: string, title: string): ContentShape {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const headingCount = lines.filter((line) => /^#{1,6}\s+/.test(line)).length;
  const checklistCount = lines.filter((line) => /^[-*+]\s+\[(?: |x|X)\]\s+/.test(line)).length;
  const numberedCount = lines.filter((line) => /^\d+[.)]\s+/.test(line)).length;
  const bulletCount = lines.filter((line) => /^[-*+]\s+/.test(line)).length;
  const colonPairCount = lines.filter((line) => /^[^|:#]{2,40}:\s+.+$/.test(line)).length;
  const tableRowCount = lines.filter((line) => line.includes("|")).length;
  const paragraphCount = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .filter((block) => !/^#{1,6}\s+/m.test(block))
    .filter((block) => !/^[-*+]\s+/m.test(block))
    .filter((block) => !/^\d+[.)]\s+/m.test(block))
    .length;
  const shortLineCount = lines.filter((line) => line.length <= 32).length;
  return {
    headingCount,
    bulletCount,
    checklistCount,
    numberedCount,
    colonPairCount,
    tableRowCount,
    paragraphCount,
    shortLineCount,
  };
}
