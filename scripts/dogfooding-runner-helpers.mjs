import path from "path";

export function getSummaryThemeEntries(summary) {
  return Object.entries(summary?.themes ?? {});
}

export function getRecentMemoryNotes(recent) {
  return recent?.notes ?? [];
}

export function getWorkingStateNotes(summary) {
  return summary?.workingState?.notes ?? [];
}

export function allTemporarySourcesAutoDelete(sourceNotes) {
  return sourceNotes.length > 0 && sourceNotes.every((note) => note.lifecycle === "temporary");
}

export function pickRecentNoteForRelationshipNavigation(notes) {
  return notes.find((note) => (note.relationships?.shown?.length ?? 0) > 0) ?? notes[0] ?? null;
}

export function resolveDogfoodVaultPath({ cwd, isolatedVaultPath }) {
  return isolatedVaultPath ?? path.join(cwd, ".mnemonic");
}
