import { expect } from "vitest";
import type { Migration, MigrationResult } from "../src/migration.js";
import type { Vault } from "../src/vault.js";

/**
 * Assert that a migration is idempotent: running it a second time on the same
 * vault must produce `notesModified: 0` and no errors.
 *
 * Call this after running the migration once with `dryRun: false`.
 */
export async function assertMigrationIdempotent(
  migration: Migration,
  vault: Vault,
): Promise<MigrationResult> {
  const second = await migration.run(vault, false);
  expect(
    second.notesModified,
    `migration "${migration.name}" is not idempotent — second run modified ${second.notesModified} note(s)`,
  ).toBe(0);
  expect(second.errors, `migration "${migration.name}" produced errors on second run`).toEqual([]);
  return second;
}
