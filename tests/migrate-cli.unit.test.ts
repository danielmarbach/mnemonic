import { describe, it, expect } from "vitest";
import { buildMigrationCompletionLines, describeAutoCommit } from "../src/cli/migrate.js";
import type { MigrationResult } from "../src/migration.js";

function migrationResult(warnings: string[]): MigrationResult {
  return {
    notesProcessed: 1,
    notesModified: 1,
    configModified: false,
    modifiedNoteIds: ["note-1"],
    errors: [],
    warnings,
  };
}

const commitFailure = "Auto-commit failed: error: 1Password: agent returned an error";

describe("migrate CLI summary", () => {
  it("reports committed and pushed when no vault has an auto-commit warning", () => {
    const lines = buildMigrationCompletionLines(
      new Map([["/vault-a", [{ migration: "m", result: migrationResult([]) }]]]),
    );

    expect(lines.join("\n")).toContain("✓ Migration completed");
    expect(lines.join("\n")).toContain("committed and pushed");
    expect(lines.join("\n")).not.toContain("NOT committed");
  });

  it("reports staged but not committed and names the failed vaults", () => {
    const lines = buildMigrationCompletionLines(
      new Map([
        ["/vault-a", [{ migration: "m", result: migrationResult([commitFailure]) }]],
        ["/vault-b", [{ migration: "m", result: migrationResult([]) }]],
      ]),
    );
    const text = lines.join("\n");

    expect(text).toContain("NOT committed");
    expect(text).toContain("/vault-a");
    expect(text).not.toContain("/vault-b");
    expect(text).toContain("Commit them manually");
    expect(text).not.toContain("have been automatically committed and pushed");
  });

  it("describes the per-vault auto-commit outcome truthfully", () => {
    expect(describeAutoCommit(migrationResult([]))).toBe("✓");
    expect(describeAutoCommit(migrationResult(["Schema version not advanced"]))).toBe(
      "⚠ (see warnings)",
    );
    expect(describeAutoCommit(migrationResult([commitFailure]))).toContain("not committed");
  });
});
