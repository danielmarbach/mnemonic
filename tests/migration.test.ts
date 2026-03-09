import { describe, it, expect, beforeEach, vi } from "vitest";
import { Migrator } from "../src/migration.js";
import { Storage } from "../src/storage.js";
import { GitOps } from "../src/git.js";
import type { Vault, VaultManager } from "../src/vault.js";
import { assertMigrationIdempotent } from "./migration-helpers.js";
import * as fs from "fs/promises";
import * as path from "path";
import os from "os";

async function readVersion(vaultPath: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(vaultPath, "config.json"), "utf-8");
    const config = JSON.parse(raw) as { schemaVersion: string };
    return config.schemaVersion;
  } catch {
    return "0.0";
  }
}

function createFailingAtomicityMigration() {
  return {
    name: "failing-atomicity-check",
    description: "Writes one note, then reports an error on another",
    minSchemaVersion: "0.0",
    maxSchemaVersion: "2.0",
    async run(vault: Vault) {
      const notes = await vault.storage.listNotes();
      const first = notes.find((note) => note.id === "note-1");
      const result = {
        notesProcessed: notes.length,
        notesModified: 0,
        modifiedNoteIds: [] as string[],
        errors: [] as Array<{ noteId: string; error: string }>,
        warnings: [] as string[],
      };

      if (first) {
        await vault.storage.writeNote({ ...first, content: `${first.content}\n\nUpdated by migration.` });
        result.notesModified = 1;
        result.modifiedNoteIds.push(first.id);
      }

      result.errors.push({ noteId: "note-2", error: "Synthetic failure after first write" });
      return result;
    },
  };
}

describe("Migrator", () => {
  let tempDir: string;
  let storage: Storage;
  let vault: Vault;
  let vaultManager: VaultManager;
  let migrator: Migrator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-test-"));
    
    storage = new Storage(tempDir);
    await storage.init();
    
    vault = {
      storage,
      git: new GitOps(tempDir, "notes"),
      notesRelDir: "notes",
      isProject: false,
    };

    vaultManager = {
      main: vault,
      allKnownVaults: vi.fn().mockReturnValue([vault]),
      getProjectVaultIfExists: vi.fn().mockResolvedValue(vault),
    } as unknown as VaultManager;

    migrator = new Migrator(vaultManager);
  });

  describe("listAvailableMigrations", () => {
    it("should include built-in migrations", () => {
      const migrations = migrator.listAvailableMigrations();
      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations.some(m => m.name === "v0.1.0-backfill-memory-versions")).toBe(true);
    });

    it("warns when registering an unbounded migration", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      migrator.registerMigration({
        name: "always-run-fixup",
        description: "No version constraints",
        async run() {
          return { notesProcessed: 0, notesModified: 0, modifiedNoteIds: [], errors: [], warnings: [] };
        },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[migration] Warning: always-run-fixup has no version constraints and will run on every invocation.",
      );
    });
  });

  describe("getPendingMigrations", () => {
    it("should return migrations for older schema version", async () => {
      const pending = await migrator.getPendingMigrations("0.0");
      expect(pending.some(m => m.name === "v0.1.0-backfill-memory-versions")).toBe(true);
    });

    it("should return no migrations when already at latest version", async () => {
      const pending = await migrator.getPendingMigrations("1.1");
      expect(pending.length).toBe(0);
    });
  });

  describe("v0.1.0-backfill-memory-versions migration", () => {
    const writeOldNote = async (id: string, title: string) => {
      const content = `---
title: ${title}
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

Content of ${title}`;
      await fs.writeFile(path.join(tempDir, "notes", `${id}.md`), content, "utf-8");
    };

    const writeNewNote = async (id: string, title: string) => {
      const content = `---
title: ${title}
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Content of ${title}`;
      await fs.writeFile(path.join(tempDir, "notes", `${id}.md`), content, "utf-8");
    };

    const writeInvalidVersionNote = async (id: string, title: string) => {
      const content = `---
title: ${title}
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: nope
---

Content of ${title}`;
      await fs.writeFile(path.join(tempDir, "notes", `${id}.md`), content, "utf-8");
    };

    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, "notes"), { recursive: true });
    });

    it("should detect notes without memoryVersion", async () => {
      await writeOldNote("old-note-1", "Old Note 1");
      await writeNewNote("new-note-1", "New Note 1");
      
      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;
      
      const result = await migration.run(vault, true);
      
      expect(result.notesProcessed).toBe(2);
      expect(result.notesModified).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it("should add memoryVersion to old notes in dry-run mode", async () => {
      await writeOldNote("old-note", "Old Note");
      
      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;
      
      const result = await migration.run(vault, true);
      
      expect(result.notesModified).toBe(1);
      
      const note = await storage.readNote("old-note");
      expect(note?.memoryVersion).toBe(0);
    });

    it("should add memoryVersion to old notes when dryRun=false", async () => {
      await writeOldNote("old-note", "Old Note");
      
      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;
      
      const result = await migration.run(vault, false);
      
      expect(result.notesModified).toBe(1);
      
      const note = await storage.readNote("old-note");
      expect(note?.memoryVersion).toBe(1);
    });

    it("should not modify notes that already have memoryVersion", async () => {
      await writeNewNote("new-note", "New Note");
      
      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;
      
      const result = await migration.run(vault, false);
      
      expect(result.notesProcessed).toBe(1);
      expect(result.notesModified).toBe(0);
    });

    it("should repair invalid memoryVersion values", async () => {
      await writeInvalidVersionNote("bad-note", "Bad Note");

      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;

      const result = await migration.run(vault, false);

      expect(result.notesProcessed).toBe(1);
      expect(result.notesModified).toBe(1);

      const note = await storage.readNote("bad-note");
      expect(note?.memoryVersion).toBe(1);
    });

    it("should handle multiple notes mixed old and new", async () => {
      await writeOldNote("note-1", "Note 1");
      await writeOldNote("note-2", "Note 2");
      await writeNewNote("note-3", "Note 3");
      await writeOldNote("note-4", "Note 4");
      
      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;
      
      const result = await migration.run(vault, false);
      
      expect(result.notesProcessed).toBe(4);
      expect(result.notesModified).toBe(3);
      expect(result.errors).toEqual([]);
    });

    it("should skip non-markdown files", async () => {
      await fs.writeFile(
        path.join(tempDir, "notes", "not-a-note.txt"),
        "This is not a markdown file",
        "utf-8"
      );

      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;

      const result = await migration.run(vault, false);

      expect(result.notesProcessed).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it("should be idempotent — second run modifies nothing", async () => {
      await writeOldNote("note-1", "Note 1");
      await writeOldNote("note-2", "Note 2");
      await writeNewNote("note-3", "Note 3");

      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;

      await migration.run(vault, false);
      await assertMigrationIdempotent(migration, vault);
    });

    it("should be idempotent after repairing invalid versions", async () => {
      await writeInvalidVersionNote("bad-note", "Bad Note");
      await writeOldNote("old-note", "Old Note");

      const migration = migrator.listAvailableMigrations()
        .find(m => m.name === "v0.1.0-backfill-memory-versions")!;

      await migration.run(vault, false);
      await assertMigrationIdempotent(migration, vault);
    });
  });

  describe("v0.1.1-backfill-note-lifecycle migration", () => {
    const writeNoteWithoutLifecycle = async (id: string, title: string) => {
      const content = `---
title: ${title}
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Content of ${title}`;
      await fs.writeFile(path.join(tempDir, "notes", `${id}.md`), content, "utf-8");
    };

    const writeNoteWithLifecycle = async (id: string, title: string, lifecycle: "temporary" | "permanent") => {
      const content = `---
title: ${title}
tags: []
lifecycle: ${lifecycle}
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Content of ${title}`;
      await fs.writeFile(path.join(tempDir, "notes", `${id}.md`), content, "utf-8");
    };

    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, "notes"), { recursive: true });
    });

    it("adds lifecycle to notes that lack it", async () => {
      await writeNoteWithoutLifecycle("old-note", "Old Note");

      const migration = migrator.listAvailableMigrations()
        .find((m) => m.name === "v0.1.1-backfill-note-lifecycle")!;

      const result = await migration.run(vault, false);

      expect(result.notesProcessed).toBe(1);
      expect(result.notesModified).toBe(1);

      const note = await storage.readNote("old-note");
      expect(note?.lifecycle).toBe("permanent");
    });

    it("is idempotent when lifecycle is already present", async () => {
      await writeNoteWithLifecycle("temporary-note", "Temporary Note", "temporary");
      await writeNoteWithLifecycle("permanent-note", "Permanent Note", "permanent");

      const migration = migrator.listAvailableMigrations()
        .find((m) => m.name === "v0.1.1-backfill-note-lifecycle")!;

      const first = await migration.run(vault, false);
      expect(first.notesModified).toBe(0);

      await assertMigrationIdempotent(migration, vault);
    });
  });

  describe("runMigration", () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, "notes"), { recursive: true });
      
      const content = `---
title: Test Note
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

Test content`;
      await fs.writeFile(path.join(tempDir, "notes", "test-note.md"), content, "utf-8");
    });

    it("should run migration on all vaults by default", async () => {
      const { results, vaultsProcessed } = await migrator.runMigration(
        "v0.1.0-backfill-memory-versions",
        { dryRun: true }
      );
      
      expect(vaultsProcessed).toBe(1);
      expect(results.get(tempDir)?.notesModified).toBe(1);
    });

    it("should run migration on specific project vault when cwd provided", async () => {
      const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-other-"));
      const otherStorage = new Storage(otherDir);
      await otherStorage.init();
      const otherVault: Vault = {
        storage: otherStorage,
        git: new GitOps(otherDir, "notes"),
        notesRelDir: "notes",
        isProject: true,
      };

      vaultManager.allKnownVaults = vi.fn().mockReturnValue([vault, otherVault]);
      vaultManager.getProjectVaultIfExists = vi.fn().mockImplementation(async (cwd: string) => {
        return cwd === tempDir ? vault : otherVault;
      });
      
      const { results, vaultsProcessed } = await migrator.runMigration(
        "v0.1.0-backfill-memory-versions",
        { dryRun: true, cwd: tempDir }
      );
      
      expect(vaultsProcessed).toBe(1);
      expect(results.has(tempDir)).toBe(true);
      expect(results.has(otherDir)).toBe(false);
    });

    it("should throw error for unknown migration", async () => {
      await expect(
        migrator.runMigration("unknown-migration", { dryRun: true })
      ).rejects.toThrow("Unknown migration: unknown-migration");
    });

    it("rolls back note writes when a migration reports errors", async () => {
      await fs.writeFile(
        path.join(tempDir, "notes", "note-1.md"),
        `---
title: Note 1
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Original content`,
        "utf-8"
      );
      await fs.writeFile(
        path.join(tempDir, "notes", "note-2.md"),
        `---
title: Note 2
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Second note`,
        "utf-8"
      );

      migrator.registerMigration(createFailingAtomicityMigration());
      const commitSpy = vi.spyOn(vault.git, "commit").mockResolvedValue(true);
      const pushSpy = vi.spyOn(vault.git, "push").mockResolvedValue(undefined);

      const { results } = await migrator.runMigration("failing-atomicity-check", { dryRun: false });

      expect(results.get(tempDir)?.errors).toHaveLength(1);
      expect(results.get(tempDir)?.warnings).toContain("Atomic migration rollback applied; note changes were not flushed to disk.");
      expect(commitSpy).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();

      const note = await storage.readNote("note-1");
      expect(note?.content).toBe("Original content");
    });
  });

  describe("runAllPending", () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, "notes"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "config.json"),
        JSON.stringify({ schemaVersion: "0.0", reindexEmbedConcurrency: 4, projectMemoryPolicies: {} }, null, 2),
        "utf-8"
      );

      const content = `---
title: Test Note
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

Test content`;
      await fs.writeFile(path.join(tempDir, "notes", "test-note.md"), content, "utf-8");
    });

    it("persists the latest schema version after successful execution", async () => {
      const commitSpy = vi.spyOn(vault.git, "commit").mockResolvedValue(true);
      const pushSpy = vi.spyOn(vault.git, "push").mockResolvedValue(undefined);

      const result = await migrator.runAllPending({ dryRun: false });

      expect(result.vaultsProcessed).toBe(1);
      expect(commitSpy).toHaveBeenCalled();
      expect(pushSpy).toHaveBeenCalled();
      expect(commitSpy).toHaveBeenCalledWith(
        expect.stringContaining("migrate: apply pending migrations"),
        expect.arrayContaining(["notes/test-note.md", "config.json"]),
      );

      const config = JSON.parse(await fs.readFile(path.join(tempDir, "config.json"), "utf-8")) as {
        schemaVersion: string;
      };
      expect(config.schemaVersion).toBe("1.1");
    });

    it("does not persist schema version during dry-run", async () => {
      await migrator.runAllPending({ dryRun: true });

      const config = JSON.parse(await fs.readFile(path.join(tempDir, "config.json"), "utf-8")) as {
        schemaVersion: string;
      };
      expect(config.schemaVersion).toBe("0.0");
    });

    it("advances schema version for cwd-scoped vault independently", async () => {
      vi.spyOn(vault.git, "commit").mockResolvedValue(true);
      vi.spyOn(vault.git, "push").mockResolvedValue(undefined);

      await migrator.runAllPending({ dryRun: false, cwd: tempDir });

      const config = JSON.parse(await fs.readFile(path.join(tempDir, "config.json"), "utf-8")) as {
        schemaVersion: string;
      };
      expect(config.schemaVersion).toBe("1.1");
    });

    it("only migrates vaults that are behind on schema version", async () => {
      // Create a second vault already at 1.1
      const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-other-"));
      const otherStorage = new Storage(otherDir);
      await otherStorage.init();
      await fs.writeFile(
        path.join(otherDir, "config.json"),
        JSON.stringify({ schemaVersion: "1.1" }),
        "utf-8"
      );
      const otherVault: Vault = {
        storage: otherStorage,
        git: new GitOps(otherDir, "notes"),
        notesRelDir: "notes",
        isProject: true,
      };

      vaultManager.allKnownVaults = vi.fn().mockReturnValue([vault, otherVault]);
      vi.spyOn(vault.git, "commit").mockResolvedValue(true);
      vi.spyOn(vault.git, "push").mockResolvedValue(undefined);

      const { migrationResults } = await migrator.runAllPending({ dryRun: false });

      // Main vault (at 0.0) should have been migrated
      expect(migrationResults.has(tempDir)).toBe(true);
      // Other vault (at 1.1) should have been skipped entirely
      expect(migrationResults.has(otherDir)).toBe(false);
    });

    it("rolls back pending migration writes and leaves schema version unchanged on errors", async () => {
      await fs.writeFile(
        path.join(tempDir, "notes", "note-1.md"),
        `---
title: Note 1
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Original content`,
        "utf-8"
      );
      await fs.writeFile(
        path.join(tempDir, "notes", "note-2.md"),
        `---
title: Note 2
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Second note`,
        "utf-8"
      );

      migrator.registerMigration(createFailingAtomicityMigration());
      const commitSpy = vi.spyOn(vault.git, "commit").mockResolvedValue(true);
      const pushSpy = vi.spyOn(vault.git, "push").mockResolvedValue(undefined);

      const { migrationResults } = await migrator.runAllPending({ dryRun: false });

      const failingResult = migrationResults.get(tempDir)?.find(
        ({ migration }) => migration === "failing-atomicity-check"
      )?.result;
      expect(failingResult?.errors).toHaveLength(1);
      expect(failingResult?.warnings).toContain(
        "Schema version not advanced because one or more migrations reported errors; staged note updates were rolled back.",
      );
      expect(commitSpy).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();

      const note = await storage.readNote("note-1");
      expect(note?.content).toBe("Original content");

      const config = JSON.parse(await fs.readFile(path.join(tempDir, "config.json"), "utf-8")) as {
        schemaVersion: string;
      };
      expect(config.schemaVersion).toBe("0.0");
    });

    it("recovers cleanly after an interrupted run and succeeds on retry", async () => {
      await fs.writeFile(
        path.join(tempDir, "notes", "note-1.md"),
        `---
title: Note 1
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Original content`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(tempDir, "notes", "note-2.md"),
        `---
title: Note 2
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

Broken content`,
        "utf-8",
      );

      migrator.registerMigration({
        name: "retryable-fixup",
        description: "Updates note-1 but blocks on unfixed note-2",
        minSchemaVersion: "0.0",
        maxSchemaVersion: "2.0",
        async run(vault: Vault) {
          const notes = await vault.storage.listNotes();
          const result = {
            notesProcessed: notes.length,
            notesModified: 0,
            modifiedNoteIds: [] as string[],
            errors: [] as Array<{ noteId: string; error: string }>,
            warnings: [] as string[],
          };

          const first = notes.find((note) => note.id === "note-1");
          const second = notes.find((note) => note.id === "note-2");

          if (first && !first.content.includes("Updated by retryable migration.")) {
            await vault.storage.writeNote({ ...first, content: `${first.content}\n\nUpdated by retryable migration.` });
            result.notesModified++;
            result.modifiedNoteIds.push(first.id);
          }

          if (second?.content !== "Fixed content") {
            result.errors.push({ noteId: "note-2", error: "Test error for note-2" });
          }

          return result;
        },
      });

      const firstResult = await migrator.runMigration("retryable-fixup", {
        dryRun: false,
        backup: false,
      });

      expect(firstResult.results.get(storage.vaultPath)?.errors).toEqual([
        { noteId: "note-2", error: "Test error for note-2" },
      ]);
      expect(firstResult.results.get(storage.vaultPath)?.notesModified).toBe(1); // note-1
      const versionAfterFirst = await readVersion(tempDir);
      // Schema version should not advance if any errors reported
      expect(versionAfterFirst).toBe("0.0");

      // Fix the underlying issue
      await vault.storage.writeNote({
        id: "note-2",
        title: "Note 2",
        content: "Fixed content",
        tags: [],
        lifecycle: "permanent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Retry should succeed
      const retryResult = await migrator.runMigration("retryable-fixup", {
        dryRun: false,
        backup: false,
      });

      expect(retryResult.results.get(storage.vaultPath)?.errors).toEqual([]);
      expect(retryResult.results.get(storage.vaultPath)?.notesModified).toBe(1);
      const versionAfterRetry = await readVersion(tempDir);
      expect(versionAfterRetry).toBe("2.0");
    });

    it("should be idempotent when run multiple times", async () => {
      // Run migration first time
      const firstResult = await migrator.runMigration("v0.1.0-backfill-memory-versions", {
        dryRun: false,
        backup: false,
      });

      const firstNotesModified = firstResult.results.get(storage.vaultPath)?.notesModified ?? 0;
      expect(firstNotesModified).toBeGreaterThan(0);

      const versionAfterFirst = await readVersion(tempDir);
      expect(versionAfterFirst).toBe("1.0");

      // Run same migration again
      const secondResult = await migrator.runMigration("v0.1.0-backfill-memory-versions", {
        dryRun: false,
        backup: false,
      });

      // Should not modify any notes (idempotent)
      const secondNotesModified = secondResult.results.get(storage.vaultPath)?.notesModified ?? 0;
      expect(secondNotesModified).toBe(0);

      // Schema version should remain the same
      const versionAfterSecond = await readVersion(tempDir);
      expect(versionAfterSecond).toBe("1.0");
    });

    it("should handle concurrent migration scenarios safely", async () => {
      // Run migration concurrently (multiple instances)
      const results = await Promise.all([
        migrator.runMigration("v0.1.0-backfill-memory-versions", {
          dryRun: false,
          backup: false,
        }),
        migrator.runMigration("v0.1.0-backfill-memory-versions", {
          dryRun: false,
          backup: false,
        }),
        migrator.runMigration("v0.1.0-backfill-memory-versions", {
          dryRun: false,
          backup: false,
        }),
      ]);

      // All should succeed without corruption
      for (const result of results) {
        const vaultResult = result.results.get(storage.vaultPath);
        expect(vaultResult).toBeTruthy();
        // Each run should report consistent results
        expect(vaultResult!.notesProcessed).toBe(1); // The seeded note in this vault
      }

      // Final schema version should be correct
      const finalVersion = await readVersion(tempDir);
      expect(finalVersion).toBe("1.0");
    });

    it("should maintain per-vault isolation during migration", async () => {
      await fs.writeFile(
        path.join(tempDir, "notes", "note-1.md"),
        `---
title: Note 1
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

Main content 1`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(tempDir, "notes", "note-2.md"),
        `---
title: Note 2
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

Main content 2`,
        "utf-8",
      );

      // Create a second vault
      const otherTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-test-other-"));
      const otherStorage = new Storage(otherTempDir);
      await otherStorage.init();
      const otherVault: Vault = {
        storage: otherStorage,
        git: new GitOps(otherTempDir, "notes"),
        notesRelDir: "notes",
        isProject: false,
      };

      try {
        // Write different notes to other vault
        await otherStorage.writeNote({
          id: "other-1",
          title: "Other Note 1",
          content: "Other content 1",
          tags: [],
          lifecycle: "permanent",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Other vault starts at version 0.0
        const otherVersionPath = path.join(otherTempDir, "config.json");
        await fs.writeFile(otherVersionPath, JSON.stringify({ schemaVersion: "0.0" }, null, 2));

        // Mock vaultManager to include both vaults
        const mockVaultManager = {
          allKnownVaults: () => [vault, otherVault],
        } as any;

        const migratorWithMultipleVaults = new Migrator(mockVaultManager);

        // Run migration on all vaults
        const runResult = await migratorWithMultipleVaults.runAllPending({
          dryRun: false,
          backup: false,
        });

        // Should have processed both vaults independently
        expect(runResult.vaultsProcessed).toBe(2);

        // Each vault should have correct results
        const mainResult = runResult.migrationResults.get(storage.vaultPath)?.[0]?.result;
        const otherResult = runResult.migrationResults.get(otherStorage.vaultPath)?.[0]?.result;

        expect(mainResult?.notesProcessed).toBe(3); // 3 notes in main vault
        expect(otherResult?.notesProcessed).toBe(1); // 1 note in other vault

        // Schema versions should be updated independently
        const mainVersion = await readVersion(tempDir);
        const otherVersion = await readVersion(otherTempDir);

        expect(mainVersion).toBe("1.1");
        expect(otherVersion).toBe("1.1");
      } finally {
        await fs.rm(otherTempDir, { recursive: true, force: true });
      }
    });

    it("should handle migration idempotency across vaults", async () => {
      // Create multiple vaults
      const vaults = [vault];
      const tempDirs = [tempDir];

      for (let i = 0; i < 2; i++) {
        const newTempDir = await fs.mkdtemp(path.join(os.tmpdir(), `mnemonic-test-vault${i}-`));
        tempDirs.push(newTempDir);
        
        const newStorage = new Storage(newTempDir);
        await newStorage.init();
        const newVault: Vault = {
          storage: newStorage,
          git: new GitOps(newTempDir, "notes"),
          notesRelDir: "notes",
          isProject: false,
        };
        vaults.push(newVault);

        // Add notes
        await newStorage.writeNote({
          id: `vault${i}-note`,
          title: `Vault ${i} Note`,
          content: `Content ${i}`,
          tags: [],
          lifecycle: "permanent",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      try {
        const mockVaultManager = {
          allKnownVaults: () => vaults,
        } as any;

        const multiVaultMigrator = new Migrator(mockVaultManager);
        
        let callCount = 0;
        multiVaultMigrator.registerMigration({
          name: "idempotency-test",
          description: "Test idempotency across vaults",
          minSchemaVersion: "0.0",
          maxSchemaVersion: "1.0",
          async run(vault: Vault, dryRun: boolean) {
            callCount++;
            const notes = await vault.storage.listNotes();
            const modifiedNoteIds = notes
              .filter((note) => note.memoryVersion === undefined || note.memoryVersion === 0)
              .map((note) => note.id);

            if (!dryRun) {
              for (const note of notes) {
                if (note.memoryVersion === undefined || note.memoryVersion === 0) {
                  await vault.storage.writeNote({ ...note, memoryVersion: 1 });
                }
              }
            }

            return {
              notesProcessed: notes.length,
              notesModified: dryRun ? 0 : modifiedNoteIds.length,
              modifiedNoteIds: dryRun ? [] : modifiedNoteIds,
              errors: [],
              warnings: [],
            };
          },
        });

        // First run
        const firstResult = await multiVaultMigrator.runMigration("idempotency-test", {
          dryRun: false,
          backup: false,
        });

        expect(firstResult.vaultsProcessed).toBe(3);
        expect(callCount).toBe(3);

        // Second run - should be idempotent
        const secondResult = await multiVaultMigrator.runMigration("idempotency-test", {
          dryRun: false,
          backup: false,
        });

        // Should not process any notes (idempotent)
        expect(secondResult.vaultsProcessed).toBe(3);
        for (const [vaultPath, result] of secondResult.results) {
          expect(result.notesModified).toBe(0);
        }
      } finally {
        // Cleanup
        for (let i = 1; i < tempDirs.length; i++) {
          await fs.rm(tempDirs[i], { recursive: true, force: true });
        }
      }
    });

    it("stays stable across dry-run, execute, and repeat execute", async () => {
      const commitSpy = vi.spyOn(vault.git, "commit").mockResolvedValue(true);
      const pushSpy = vi.spyOn(vault.git, "push").mockResolvedValue(undefined);

      const dryRun = await migrator.runAllPending({ dryRun: true });
      expect(dryRun.migrationResults.get(tempDir)?.[0]?.result.notesModified).toBe(1);

      const firstExecute = await migrator.runAllPending({ dryRun: false });
      expect(firstExecute.migrationResults.get(tempDir)?.[0]?.result.notesModified).toBe(1);

      const secondExecute = await migrator.runAllPending({ dryRun: false });
      expect(secondExecute.migrationResults.has(tempDir)).toBe(false);

      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledTimes(1);

      const config = JSON.parse(await fs.readFile(path.join(tempDir, "config.json"), "utf-8")) as {
        schemaVersion: string;
      };
      expect(config.schemaVersion).toBe("1.1");
    });

    it("skips a project vault that was already migrated in an earlier session", async () => {
      const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-project-"));
      const projectStorage = new Storage(projectDir);
      await projectStorage.init();
      await fs.writeFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({ schemaVersion: "0.0", reindexEmbedConcurrency: 4, projectMemoryPolicies: {} }, null, 2),
        "utf-8"
      );
      await fs.writeFile(
        path.join(projectDir, "notes", "project-note.md"),
        `---
title: Project Note
tags: []
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
---

Project content`,
        "utf-8"
      );

      const projectVault: Vault = {
        storage: projectStorage,
        git: new GitOps(projectDir, "notes"),
        notesRelDir: "notes",
        isProject: true,
      };

      const sessionOneVaultManager = {
        main: vault,
        allKnownVaults: vi.fn().mockReturnValue([vault, projectVault]),
        getProjectVaultIfExists: vi.fn().mockImplementation(async (cwd: string) => {
          return cwd === projectDir ? projectVault : vault;
        }),
      } as unknown as VaultManager;

      const projectCommitSpy = vi.spyOn(projectVault.git, "commit").mockResolvedValue(true);
      const projectPushSpy = vi.spyOn(projectVault.git, "push").mockResolvedValue(undefined);
      const sessionOneMigrator = new Migrator(sessionOneVaultManager);

      const projectRun = await sessionOneMigrator.runAllPending({ dryRun: false, cwd: projectDir });
      expect(projectRun.migrationResults.has(projectDir)).toBe(true);
      expect(projectCommitSpy).toHaveBeenCalledTimes(1);
      expect(projectPushSpy).toHaveBeenCalledTimes(1);

      let projectConfig = JSON.parse(await fs.readFile(path.join(projectDir, "config.json"), "utf-8")) as {
        schemaVersion: string;
      };
      expect(projectConfig.schemaVersion).toBe("1.1");

      const sessionTwoVaultManager = {
        main: vault,
        allKnownVaults: vi.fn().mockReturnValue([vault, projectVault]),
        getProjectVaultIfExists: vi.fn().mockResolvedValue(projectVault),
      } as unknown as VaultManager;

      const mainCommitSpy = vi.spyOn(vault.git, "commit").mockResolvedValue(true);
      const mainPushSpy = vi.spyOn(vault.git, "push").mockResolvedValue(undefined);
      projectCommitSpy.mockClear();
      projectPushSpy.mockClear();

      const sessionTwoMigrator = new Migrator(sessionTwoVaultManager);
      const secondRun = await sessionTwoMigrator.runAllPending({ dryRun: false });

      expect(secondRun.migrationResults.has(projectDir)).toBe(false);
      expect(projectCommitSpy).not.toHaveBeenCalled();
      expect(projectPushSpy).not.toHaveBeenCalled();
      expect(mainCommitSpy).toHaveBeenCalledTimes(1);
      expect(mainPushSpy).toHaveBeenCalledTimes(1);

      projectConfig = JSON.parse(await fs.readFile(path.join(projectDir, "config.json"), "utf-8")) as {
        schemaVersion: string;
      };
      expect(projectConfig.schemaVersion).toBe("1.1");
    });
  });

  describe("Version comparison", () => {
    it("should correctly compare version strings", async () => {
      const migratorAny = new Migrator(vaultManager);
      expect(await migratorAny.getPendingMigrations("0.0")).toHaveLength(2);
      expect(await migratorAny.getPendingMigrations("0.9")).toHaveLength(2);
      expect(await migratorAny.getPendingMigrations("1.0")).toHaveLength(1);
      expect(await migratorAny.getPendingMigrations("1.1")).toHaveLength(0);
    });

    it("rejects invalid schema versions", async () => {
      const migratorAny = new Migrator(vaultManager);
      await expect(migratorAny.getPendingMigrations("v1")).rejects.toThrow("Invalid schema version: v1");
    });
  });

  describe("Migration ordering", () => {
    it("should return pending migrations sorted by target version", async () => {
      // Register migrations out of order to prove sorting works
      migrator.registerMigration({
        name: "upgrade-to-3.0",
        description: "Third migration",
        minSchemaVersion: "2.0",
        maxSchemaVersion: "3.0",
        async run(_vault, _dryRun) {
          return { notesProcessed: 0, notesModified: 0, modifiedNoteIds: [], errors: [], warnings: [] };
        },
      });
      migrator.registerMigration({
        name: "upgrade-to-2.0",
        description: "Second migration",
        minSchemaVersion: "1.0",
        maxSchemaVersion: "2.0",
        async run(_vault, _dryRun) {
          return { notesProcessed: 0, notesModified: 0, modifiedNoteIds: [], errors: [], warnings: [] };
        },
      });

      const pending = await migrator.getPendingMigrations("0.0");
      const names = pending.map(m => m.name);

      expect(names).toEqual([
        "v0.1.0-backfill-memory-versions", // maxSchemaVersion 1.0
        "v0.1.1-backfill-note-lifecycle",  // maxSchemaVersion 1.1
        "upgrade-to-2.0",                  // maxSchemaVersion 2.0
        "upgrade-to-3.0",                  // maxSchemaVersion 3.0
      ]);
    });

    it("should place unbounded migrations after versioned ones", async () => {
      migrator.registerMigration({
        name: "always-run-fixup",
        description: "No version constraints",
        async run(_vault, _dryRun) {
          return { notesProcessed: 0, notesModified: 0, modifiedNoteIds: [], errors: [], warnings: [] };
        },
      });
      migrator.registerMigration({
        name: "upgrade-to-2.0",
        description: "Second migration",
        minSchemaVersion: "1.0",
        maxSchemaVersion: "2.0",
        async run(_vault, _dryRun) {
          return { notesProcessed: 0, notesModified: 0, modifiedNoteIds: [], errors: [], warnings: [] };
        },
      });

      const pending = await migrator.getPendingMigrations("0.0");
      const names = pending.map(m => m.name);

      expect(names).toEqual([
        "v0.1.0-backfill-memory-versions", // maxSchemaVersion 1.0
        "v0.1.1-backfill-note-lifecycle",  // maxSchemaVersion 1.1
        "upgrade-to-2.0",                  // maxSchemaVersion 2.0
        "always-run-fixup",                // unbounded — last
      ]);
    });

    it("should sort by minSchemaVersion when maxSchemaVersion is absent", async () => {
      migrator.registerMigration({
        name: "min-only-at-3.0",
        description: "Has only minSchemaVersion",
        minSchemaVersion: "3.0",
        async run(_vault, _dryRun) {
          return { notesProcessed: 0, notesModified: 0, modifiedNoteIds: [], errors: [], warnings: [] };
        },
      });
      migrator.registerMigration({
        name: "upgrade-to-2.0",
        description: "Has maxSchemaVersion",
        minSchemaVersion: "1.0",
        maxSchemaVersion: "2.0",
        async run(_vault, _dryRun) {
          return { notesProcessed: 0, notesModified: 0, modifiedNoteIds: [], errors: [], warnings: [] };
        },
      });

      const pending = await migrator.getPendingMigrations("0.0");
      const names = pending.map(m => m.name);

      expect(names).toEqual([
        "v0.1.0-backfill-memory-versions", // maxSchemaVersion 1.0
        "v0.1.1-backfill-note-lifecycle",  // maxSchemaVersion 1.1
        "upgrade-to-2.0",                  // maxSchemaVersion 2.0
        "min-only-at-3.0",                 // minSchemaVersion 3.0
      ]);
    });
  });
});
