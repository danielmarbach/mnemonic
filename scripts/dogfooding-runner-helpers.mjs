export function getSummaryThemeEntries(summary) {
  return Object.entries(summary?.themes ?? {});
}

export function getRecentMemoryNotes(recent) {
  return recent?.notes ?? [];
}

export function getWorkingStateNotes(summary) {
  return summary?.workingState?.notes ?? [];
}


