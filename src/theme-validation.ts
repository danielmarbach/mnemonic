import type { Note } from "./storage.js";
import { classifyTheme } from "./project-introspection.js";

export interface ThemeQualityReport {
  totalNotes: number;
  themeCount: number;
  otherCount: number;
  otherRatio: number;
  topThemes: Array<{ name: string; count: number }>;
  warnings: string[];
}

export function analyzeThemeQuality(notes: Note[]): ThemeQualityReport {
  const totalNotes = notes.length;

  const themeBuckets = new Map<string, number>();
  for (const note of notes) {
    const theme = classifyTheme(note);
    themeBuckets.set(theme, (themeBuckets.get(theme) ?? 0) + 1);
  }

  const themeCount = themeBuckets.size;
  const otherCount = themeBuckets.get("other") ?? 0;
  const otherRatio = totalNotes > 0 ? otherCount / totalNotes : 0;

  const topThemes = Array.from(themeBuckets.entries())
    .filter(([theme]) => theme !== "other")
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const warnings: string[] = [];

  if (otherRatio >= 0.4) {
    warnings.push(`High 'other' ratio (${Math.round(otherRatio * 100)}%): consider improving keyword extraction or checking tag coverage`);
  } else if (otherRatio >= 0.25) {
    warnings.push(`Moderate 'other' ratio (${Math.round(otherRatio * 100)}%)`);
  }

  const singleNoteThemes = Array.from(themeBuckets.entries())
    .filter(([theme, count]) => theme !== "other" && count === 1);
  if (singleNoteThemes.length >= 3) {
    warnings.push(`Too many single-note themes (${singleNoteThemes.length}): graduation threshold may be too low`);
  }

  const maxThemeCount = Math.max(...themeBuckets.values());
  if (totalNotes > 0 && maxThemeCount / totalNotes > 0.6 && themeBuckets.size > 1) {
    const dominantTheme = Array.from(themeBuckets.entries())
      .find(([, count]) => count === maxThemeCount)?.[0];
    if (dominantTheme) {
      warnings.push(`Theme distribution is highly skewed (${dominantTheme}: ${Math.round(maxThemeCount / totalNotes * 100)}%)`);
    }
  }

  return {
    totalNotes,
    themeCount,
    otherCount,
    otherRatio,
    topThemes,
    warnings,
  };
}