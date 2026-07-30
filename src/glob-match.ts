/**
 * Path-aware glob matching for document-source include/exclude patterns.
 *
 * Supports:
 * - `**` — crosses `/` (matches zero or more path segments)
 * - `*`  — matches within a segment (does not cross `/`)
 * - `?`  — matches exactly one non-`/` character
 * - literal characters (regex specials are escaped)
 *
 * Matching is case-sensitive and anchored: a pattern must match the full
 * relative path.
 *
 * Bare-name convention: a pattern containing no `/` and no wildcard (e.g. the
 * default exclude `node_modules`) matches any path that contains it as a
 * segment. This makes the documented default excludes actually exclude nested
 * vendor directories without requiring users to write an explicit nested-dir glob.
 *
 * Brace expansion (`{md,mdx}`) and character classes (`[abc]`) are intentionally
 * not supported and are treated as literals.
 */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  // Bare-name convention: a single segment with no wildcard matches any path
  // segment equal to it (anchored at a path boundary on both sides).
  if (!pattern.includes("/") && !/[*?]/.test(pattern)) {
    return new RegExp(`(?:^|/)${escapeRegex(pattern)}(?:/|$)`);
  }

  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const two = pattern.slice(i, i + 2);
    if (two === "**") {
      i += 2;
      if (pattern[i] === "/") {
        i += 1;
        // `**/` matches zero or more complete segments (each ending in `/`).
        re += "(?:.*/)?";
      } else {
        // Trailing `**` matches anything, including `/`.
        re += ".*";
      }
    } else if (pattern[i] === "*") {
      i += 1;
      re += "[^/]*";
    } else if (pattern[i] === "?") {
      i += 1;
      re += "[^/]";
    } else {
      let j = i;
      while (j < pattern.length && !/[*?]/.test(pattern.charAt(j))) j++;
      re += escapeRegex(pattern.slice(i, j));
      i = j;
    }
  }
  re += "$";
  return new RegExp(re);
}

const regexCache = new Map<string, RegExp>();

function compiledGlob(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    re = globToRegex(pattern);
    regexCache.set(pattern, re);
  }
  return re;
}

/** Match a single POSIX relative path against a single glob pattern. */
export function matchGlob(pattern: string, relPath: string): boolean {
  return compiledGlob(pattern).test(relPath);
}

/** Match a POSIX relative path against any of the given glob patterns. */
export function matchAnyGlob(patterns: string[], relPath: string): boolean {
  for (const pattern of patterns) {
    if (compiledGlob(pattern).test(relPath)) return true;
  }
  return false;
}
