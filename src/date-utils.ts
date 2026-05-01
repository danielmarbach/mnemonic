export const MS_PER_DAY = 86_400_000;

export function daysSince(isoDate: string, now: Date = new Date()): number {
  const updated = new Date(isoDate);
  if (Number.isNaN(updated.getTime())) {
    return 0;
  }

  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, diffMs / MS_PER_DAY);
}