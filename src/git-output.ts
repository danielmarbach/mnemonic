/**
 * Split NUL-terminated git output (`-z`). Git leaves paths unquoted under `-z`,
 * so non-ASCII names survive; `git log -z` also emits a "\n" after each
 * header record, which is stripped here.
 */
export function splitNulSeparated(output: string): string[] {
  return output
    .split("\0")
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0);
}
