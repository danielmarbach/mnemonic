export interface ChangeDetectionInput {
  content?: string;
  originalContent: string;
  title?: string;
  originalTitle: string;
  tags?: string[];
  originalTags: string[];
  lifecycle?: string;
  originalLifecycle: string;
  role?: string;
  originalRole?: string;
  roleExplicitlySet?: boolean;
  alwaysLoad?: boolean;
  originalAlwaysLoad?: boolean;
  semanticPatchApplied?: boolean;
  relatedToChanged?: boolean;
}

export function hasActualChanges(input: ChangeDetectionInput): boolean {
  if (input.semanticPatchApplied) return true;

  if (input.content !== undefined && input.content !== input.originalContent) return true;
  if (input.title !== undefined && input.title !== input.originalTitle) return true;
  if (input.lifecycle !== undefined && input.lifecycle !== input.originalLifecycle) return true;
  if (input.alwaysLoad !== undefined && input.alwaysLoad !== input.originalAlwaysLoad) return true;

  if (input.roleExplicitlySet && input.role !== input.originalRole) return true;

  if (input.tags !== undefined && !arraysEqual(input.tags, input.originalTags)) return true;

  if (input.relatedToChanged) return true;

  return false;
}

export interface FieldsModifiedInput {
  patchedContent?: string;
  originalContent: string;
  contentExplicitlyProvided?: boolean;
  semanticPatchProvided?: boolean;
  newTitle: string;
  originalTitle: string;
  titleExplicitlyProvided?: boolean;
  newLifecycle: string;
  originalLifecycle: string;
  lifecycleExplicitlyProvided?: boolean;
  newRole?: string;
  originalRole?: string;
  roleExplicitlySet: boolean;
  newTags: string[];
  originalTags: string[];
  tagsExplicitlyProvided?: boolean;
  newAlwaysLoad?: boolean;
  originalAlwaysLoad?: boolean;
  alwaysLoadExplicitlyProvided?: boolean;
  relatedToChanged?: boolean;
}

export function computeFieldsModified(input: FieldsModifiedInput): string[] {
  const changes: string[] = [];

  if (input.semanticPatchProvided) {
    changes.push("semanticPatch");
    if (input.patchedContent !== undefined && input.patchedContent !== input.originalContent) {
      changes.push("content");
    }
  } else if (input.contentExplicitlyProvided) {
    const effectiveContent = input.patchedContent ?? input.originalContent;
    if (effectiveContent !== input.originalContent) {
      changes.push("content");
    }
  }

  if (input.titleExplicitlyProvided && input.newTitle !== input.originalTitle) changes.push("title");
  if (input.lifecycleExplicitlyProvided && input.newLifecycle !== input.originalLifecycle) changes.push("lifecycle");
  if (input.roleExplicitlySet && input.newRole !== input.originalRole) changes.push("role");
  if (input.tagsExplicitlyProvided && !arraysEqual(input.newTags, input.originalTags)) changes.push("tags");
  if (input.alwaysLoadExplicitlyProvided && input.newAlwaysLoad !== input.originalAlwaysLoad) changes.push("alwaysLoad");
  if (input.relatedToChanged) changes.push("relatedTo");

  return changes;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}