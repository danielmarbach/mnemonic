import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";

import type { Vault, VaultManager } from "./vault.js";
import type { Note } from "./storage.js";
import { readVaultSchemaVersion, writeVaultSchemaVersion } from "./config.js";

export interface MigrationResult {
  notesProcessed: number;
  notesModified: number;
  modifiedNoteIds: string[];
  errors: Array<{ noteId: string; error: string }>;
  warnings: string[];
}

/**
 * All migrations MUST be idempotent: running a migration on an already-migrated
 * vault must produce `notesModified: 0` with no errors. This is required because:
 *
 * - Project vaults shared across teams may be migrated independently of the
 *   main vault's schema version, causing the same migration to run again.
 * - Vaults can be migrated in different sessions or by different collaborators,
 *   so a later run may revisit work that already completed elsewhere.
 * - Partial failures leave some notes migrated; re-running must not corrupt them.
 *
 * Use `assertMigrationIdempotent` from tests/migration-helpers.ts to verify.
 */
export interface Migration {
  name: string;
  description: string;
  minSchemaVersion?: string;
  maxSchemaVersion?: string;
  run(vault: Vault, dryRun: boolean): Promise<MigrationResult>;
}

export class Migrator {
  private migrations: Map<string, Migration> = new Map();
  private vaultLocks = new Map<string, Promise<void>>();

  constructor(private vaultManager: VaultManager) {
    this.registerBuiltInMigrations();
  }

  registerMigration(migration: Migration): void {
    if (this.migrations.has(migration.name)) {
      throw new Error(`Migration already registered: ${migration.name}`);
    }

    if (!migration.minSchemaVersion && !migration.maxSchemaVersion) {
      console.error(
        `[migration] Warning: ${migration.name} has no version constraints and will run on every invocation.`,
      );
    }

    this.migrations.set(migration.name, migration);
  }

  listAvailableMigrations(): Migration[] {
    return Array.from(this.migrations.values());
  }

  async getPendingMigrations(currentSchemaVersion: string, targetSchemaVersion?: string): Promise<Migration[]> {
    const all = this.listAvailableMigrations();
    const current = this.parseVersion(currentSchemaVersion);
    const target = targetSchemaVersion ? this.parseVersion(targetSchemaVersion) : undefined;
    
    const pending = all.filter(mig => {
      // Primary filter: maxSchemaVersion means "this migration upgrades TO this version"
      // Run if current < max, don't run if current >= max
      if (mig.maxSchemaVersion) {
        const max = this.parseVersion(mig.maxSchemaVersion);
        if (target && this.compareVersions(max, target) > 0) return false;
        if (this.compareVersions(current, max) >= 0) return false;
        return true;
      }

      // If no max, check min: minSchemaVersion means "this migration was introduced at this version"
      // Run if current < min (haven't reached that version yet)
      if (mig.minSchemaVersion) {
        const min = this.parseVersion(mig.minSchemaVersion);
        if (target && this.compareVersions(min, target) > 0) return false;
        if (this.compareVersions(current, min) < 0) return true;
        return false;
      }

      // No version constraints, always run
      return true;
    });

    // Sort by target version so migrations execute in schema-version order
    // regardless of registration sequence. Unbounded migrations run last.
    return pending.sort((a, b) => {
      const aVer = a.maxSchemaVersion ?? a.minSchemaVersion;
      const bVer = b.maxSchemaVersion ?? b.minSchemaVersion;
      if (!aVer && !bVer) return 0;
      if (!aVer) return 1;
      if (!bVer) return -1;
      return this.compareVersions(this.parseVersion(aVer), this.parseVersion(bVer));
    });
  }

  async runMigration(
    migrationName: string,
    options: { dryRun: boolean; backup?: boolean; cwd?: string }
  ): Promise<{ results: Map<string, MigrationResult>; vaultsProcessed: number }> {
    const migration = this.migrations.get(migrationName);
    if (!migration) {
      throw new Error(`Unknown migration: ${migrationName}`);
    }

    const vaults: Vault[] = [];
    if (options.cwd) {
      const projectVault = await this.vaultManager.getProjectVaultIfExists(options.cwd);
      if (projectVault) vaults.push(projectVault);
    } else {
      vaults.push(...this.vaultManager.allKnownVaults());
    }

    const results = new Map<string, MigrationResult>();

    for (const vault of vaults) {
      const result = await this.withVaultLock(vault.storage.vaultPath, async () => {
        const migrationResult = await this.runMigrationAtomically(vault, migration, options.dryRun);

        if (!options.dryRun && migrationResult.errors.length === 0) {
          const currentSchemaVersion = await readVaultSchemaVersion(vault.storage.vaultPath);
          const nextSchemaVersion = this.getLatestSchemaVersion(currentSchemaVersion, [migration]);
          const filesToCommit = new Set(migrationResult.modifiedNoteIds.map((id) => `${vault.notesRelDir}/${id}.md`));

          if (nextSchemaVersion !== currentSchemaVersion) {
            await writeVaultSchemaVersion(vault.storage.vaultPath, nextSchemaVersion);
            filesToCommit.add(getConfigPathForVault(vault));
          }

          if (filesToCommit.size > 0) {
            const commitMessage = [
              `migrate: ${migrationName}`,
              "",
              `- Modified: ${migrationResult.notesModified} note(s)`,
              `- Processed: ${migrationResult.notesProcessed} note(s)`,
              `- Schema: ${currentSchemaVersion} -> ${nextSchemaVersion}`,
            ].join("\n");

            try {
              await vault.git.commit(commitMessage, [...filesToCommit]);
              await vault.git.push();
            } catch (err) {
              console.error(`[migration] Failed to commit for ${vault.storage.vaultPath}: ${err}`);
              migrationResult.warnings.push(`Auto-commit failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        return migrationResult;
      });

      results.set(vault.storage.vaultPath, result);
    }

    return { results, vaultsProcessed: vaults.length };
  }

  async runAllPending(options: { dryRun: boolean; backup?: boolean; cwd?: string }): Promise<{
    migrationResults: Map<string, { migration: string; result: MigrationResult }[]>;
    vaultsProcessed: number;
  }> {
    const vaults: Vault[] = [];
    if (options.cwd) {
      const projectVault = await this.vaultManager.getProjectVaultIfExists(options.cwd);
      if (projectVault) vaults.push(projectVault);
    } else {
      vaults.push(...this.vaultManager.allKnownVaults());
    }

    const migrationResults = new Map<string, { migration: string; result: MigrationResult }[]>();

    for (const vault of vaults) {
      const vaultResults = await this.withVaultLock(vault.storage.vaultPath, async () => {
        const vaultVersion = await readVaultSchemaVersion(vault.storage.vaultPath);
        const pending = await this.getPendingMigrations(vaultVersion);
        if (pending.length === 0) return null;

        const lockedVaultResults: { migration: string; result: MigrationResult }[] = [];
        const filesToCommit = new Set<string>();
        let hasErrors = false;

        if (!options.dryRun) {
          await vault.storage.beginAtomicNotesWrite();
        }

        try {
          for (const migration of pending) {
            const result = await migration.run(vault, options.dryRun);
            lockedVaultResults.push({ migration: migration.name, result });

            if (!options.dryRun && result.notesModified > 0) {
              for (const noteId of result.modifiedNoteIds) {
                filesToCommit.add(`${vault.notesRelDir}/${noteId}.md`);
              }
            }

            if (result.errors.length > 0) hasErrors = true;
          }

          if (!options.dryRun) {
            if (hasErrors) {
              await vault.storage.rollbackAtomicNotesWrite();
            } else {
              await vault.storage.commitAtomicNotesWrite();
            }
          }
        } catch (err) {
          if (!options.dryRun) {
            await vault.storage.rollbackAtomicNotesWrite();
          }
          throw err;
        }

        if (!options.dryRun && pending.length > 0) {
          if (!hasErrors) {
            const nextSchemaVersion = this.getLatestSchemaVersion(vaultVersion, pending);
            if (nextSchemaVersion !== vaultVersion) {
              await writeVaultSchemaVersion(vault.storage.vaultPath, nextSchemaVersion);
              filesToCommit.add(getConfigPathForVault(vault));
            }

            if (filesToCommit.size > 0) {
              const commitMessage = [
                "migrate: apply pending migrations",
                "",
                `- Migrations: ${pending.map((migration) => migration.name).join(", ")}`,
                `- Schema: ${vaultVersion} -> ${nextSchemaVersion}`,
              ].join("\n");

              try {
                await vault.git.commit(commitMessage, [...filesToCommit]);
                await vault.git.push();
              } catch (err) {
                const message = `Auto-commit failed: ${err instanceof Error ? err.message : String(err)}`;
                console.error(`[migration] Failed to commit for ${vault.storage.vaultPath}: ${err}`);
                for (const { result } of lockedVaultResults) {
                  result.warnings.push(message);
                }
              }
            }
          } else if (filesToCommit.size > 0) {
            const warning = "Schema version not advanced because one or more migrations reported errors; staged note updates were rolled back.";
            for (const { result } of lockedVaultResults) {
              result.warnings.push(warning);
            }
            console.error(`[migration] ${vault.storage.vaultPath}: ${warning}`);
          }
        }

        return lockedVaultResults;
      });

      if (vaultResults) {
        migrationResults.set(vault.storage.vaultPath, vaultResults);
      }
    }

    return { migrationResults, vaultsProcessed: vaults.length };
  }

  private registerBuiltInMigrations(): void {
    this.registerMigration(createV010BackfillMemoryVersionMigration());
    this.registerMigration(createV011BackfillLifecycleMigration());
  }

  private parseVersion(version: string): number[] {
    if (!/^\d+(\.\d+)*$/.test(version)) {
      throw new Error(`Invalid schema version: ${version}`);
    }

    return version.split(".").map(n => parseInt(n, 10));
  }

  private compareVersions(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const aPart = a[i] || 0;
      const bPart = b[i] || 0;
      if (aPart !== bPart) return aPart - bPart;
    }
    return 0;
  }

  private getLatestSchemaVersion(currentSchemaVersion: string, migrations: Migration[]): string {
    let latest = currentSchemaVersion;

    for (const migration of migrations) {
      const candidate = migration.maxSchemaVersion ?? migration.minSchemaVersion;
      if (!candidate) {
        continue;
      }

      if (this.compareVersions(this.parseVersion(candidate), this.parseVersion(latest)) > 0) {
        latest = candidate;
      }
    }

    return latest;
  }

  private async withVaultLock<T>(vaultPath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.vaultLocks.get(vaultPath) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.vaultLocks.set(vaultPath, tail);

    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (this.vaultLocks.get(vaultPath) === tail) {
        this.vaultLocks.delete(vaultPath);
      }
    }
  }

  private async runMigrationAtomically(vault: Vault, migration: Migration, dryRun: boolean): Promise<MigrationResult> {
    if (dryRun) {
      return migration.run(vault, true);
    }

    await vault.storage.beginAtomicNotesWrite();

    try {
      const result = await migration.run(vault, false);
      if (result.errors.length > 0) {
        await vault.storage.rollbackAtomicNotesWrite();
        if (result.notesModified > 0) {
          result.warnings.push("Atomic migration rollback applied; note changes were not flushed to disk.");
        }
        return result;
      }

      await vault.storage.commitAtomicNotesWrite();
      return result;
    } catch (err) {
      await vault.storage.rollbackAtomicNotesWrite();
      throw err;
    }
  }
}

function getConfigPathForVault(vault: Vault): string {
  return vault.notesRelDir.replace(/notes$/, "config.json");
}

function createV010BackfillMemoryVersionMigration(): Migration {
  return {
    name: "v0.1.0-backfill-memory-versions",
    description: "Adds memoryVersion: 1 to all notes that lack a version marker",
    minSchemaVersion: "0.0",
    maxSchemaVersion: "1.0",
    async run(vault, dryRun): Promise<MigrationResult> {
      const result: MigrationResult = {
        notesProcessed: 0,
        notesModified: 0,
        modifiedNoteIds: [],
        errors: [],
        warnings: [],
      };

      const notes = await vault.storage.listNotes();
      result.notesProcessed = notes.length;

      for (const note of notes) {
        try {
          if (note.memoryVersion === undefined || note.memoryVersion === 0) {
            result.notesModified++;
            result.modifiedNoteIds.push(note.id);
            
            if (!dryRun) {
              const updatedNote: Note = {
                ...note,
                memoryVersion: 1,
              };
              await vault.storage.writeNote(updatedNote);
            }
          }
        } catch (err) {
          result.errors.push({
            noteId: note.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return result;
    },
  };
}

function createV011BackfillLifecycleMigration(): Migration {
  return {
    name: "v0.1.1-backfill-note-lifecycle",
    description: "Adds lifecycle: permanent to notes that lack a lifecycle marker",
    minSchemaVersion: "1.0",
    maxSchemaVersion: "1.1",
    async run(vault, dryRun): Promise<MigrationResult> {
      const result: MigrationResult = {
        notesProcessed: 0,
        notesModified: 0,
        modifiedNoteIds: [],
        errors: [],
        warnings: [],
      };

      const notes = await vault.storage.listNotes();
      result.notesProcessed = notes.length;

      for (const note of notes) {
        try {
          const notePath = path.join(vault.storage.notesDir, `${note.id}.md`);
          const raw = await fs.readFile(notePath, "utf-8");
          const parsed = matter(raw);
          if (parsed.data["lifecycle"] === "temporary" || parsed.data["lifecycle"] === "permanent") {
            continue;
          }

          result.notesModified++;
          result.modifiedNoteIds.push(note.id);

          if (!dryRun) {
            await vault.storage.writeNote({
              ...note,
              lifecycle: "permanent",
            });
          }
        } catch (err) {
          result.errors.push({
            noteId: note.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return result;
    },
  };
}
