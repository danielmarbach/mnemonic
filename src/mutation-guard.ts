import { classifyEntityRef } from "./document-entity-ref.js";
import { ImmutableDocumentSourceError } from "./domain-errors.js";

/**
 * Guard against mutation of document-source entities.
 * Throws ImmutableDocumentSourceError if the ID is a document or chunk reference.
 */
export function guardAgainstDocumentSourceMutation(id: string, operation: string): void {
  const kind = classifyEntityRef(id);
  if (kind === "document" || kind === "chunk") {
    throw new ImmutableDocumentSourceError(id, operation);
  }
}

/**
 * Guard multiple IDs against mutation of document-source entities.
 */
export function guardIdsAgainstDocumentSourceMutation(ids: string[], operation: string): void {
  for (const id of ids) {
    guardAgainstDocumentSourceMutation(id, operation);
  }
}
