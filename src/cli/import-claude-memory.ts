import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";

import type { MemoryId } from "../brands.js";
import { memoryId, isoDateString } from "../brands.js";
import { resolveUserPath, defaultVaultPath, defaultClaudeHome } from "../paths.js";
import { VaultManager } from "../vault.js";
import { parseMemorySections } from "../import.js";
import { MnemonicConfigStore } from "../config.js";
import type { Note } from "../storage.js";

export function makeImportNoteId(title: string): MemoryId {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const suffix = randomUUID().split("-")[0]!;
  return memoryId(slug ? `${slug}-${suffix}` : suffix);
}

export async function runImportCli(): Promise<void> {
  const argv = process.argv.slice(3);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
Mnemonic: Import Claude Code Auto-Memory

Usage:
  mnemonic import-claude-memory [options]

Options:
  --dry-run         Show what would be imported without writing anything
  --cwd=<path>      Project path to resolve Claude memory for (default: cwd)
  --claude-home=<p> Claude home directory (default: ~/.claude, or $CLAUDE_HOME)
  --help            Show this help message

How it works:
  Claude Code stores per-project auto-memory in:
    ~/.claude/projects/<encoded-path>/memory/*.md

  Each ## heading in those files becomes a separate mnemonic note
  tagged with "claude-memory" and "imported". Notes with duplicate
  titles are skipped.

Examples:
  mnemonic import-claude-memory --dry-run
  mnemonic import-claude-memory
  mnemonic import-claude-memory --cwd=/path/to/project
`);
    process.exit(0);
  }

  const dryRun = argv.includes("--dry-run");
  const cwdOption = argv.find(arg => arg.startsWith("--cwd="));
  const targetCwd = cwdOption ? resolveUserPath(cwdOption.split("=")[1]!) : process.cwd();
  const claudeHomeOption = argv.find(arg => arg.startsWith("--claude-home="));
  const claudeHome = claudeHomeOption
    ? resolveUserPath(claudeHomeOption.split("=")[1]!)
    : process.env["CLAUDE_HOME"]
      ? resolveUserPath(process.env["CLAUDE_HOME"])
      : defaultClaudeHome();

  const VAULT_PATH = process.env["VAULT_PATH"]
    ? resolveUserPath(process.env["VAULT_PATH"])
    : defaultVaultPath();

  // Encode the project path the same way Claude Code does:
  // /Users/foo/Projects/bar → -Users-foo-Projects-bar
  // On Windows both \ and / are replaced with -
  const projectDirName = targetCwd.replace(/[/\\]/g, "-");
  const memoryDir = path.join(claudeHome, "projects", projectDirName, "memory");

  try {
    await fs.access(memoryDir);
  } catch {
    console.log(`No Claude memory found for this project.`);
    console.log(`Expected: ${memoryDir}`);
    process.exit(0);
  }

  const files = (await fs.readdir(memoryDir)).filter(f => f.endsWith(".md")).sort();
  if (files.length === 0) {
    console.log("No markdown files found in Claude memory directory.");
    process.exit(0);
  }

  console.log(`Found ${files.length} file(s) in ${memoryDir}`);

  const vaultManager = new VaultManager(VAULT_PATH);
  await vaultManager.initMain();
  const vault = vaultManager.main;

  const existingNotes = await vault.storage.listNotes();
  const existingTitles = new Set(existingNotes.map(n => n.title.toLowerCase()));

  const now = isoDateString(new Date().toISOString());
  const notesToWrite: Note[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(memoryDir, file), "utf-8");
    const sections = parseMemorySections(raw);
    const sourceTag = file.replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

    for (const section of sections) {
      if (existingTitles.has(section.title.toLowerCase())) {
        skipped.push(section.title);
        continue;
      }

      notesToWrite.push({
        id: makeImportNoteId(section.title),
        title: section.title,
        content: section.content,
        tags: ["claude-memory", "imported", sourceTag],
        lifecycle: "permanent",
        createdAt: now,
        updatedAt: now,
        memoryVersion: 1,
      });
    }
  }

  if (skipped.length > 0) {
    console.log(`\nSkipped (title already exists in vault):`);
    skipped.forEach(t => console.log(`  ~ ${t}`));
  }

  if (notesToWrite.length === 0) {
    console.log("\nNothing new to import.");
    process.exit(0);
  }

  console.log(`\nSections to import (${notesToWrite.length}):`);
  notesToWrite.forEach(n => console.log(`  + ${n.title}`));

  if (dryRun) {
    console.log("\n✓ Dry-run complete — no changes written");
    process.exit(0);
  }

  const filesToCommit: string[] = [];
  await Promise.all(
    notesToWrite.map(async (note) => {
      await vault.storage.writeNote(note);
      filesToCommit.push(`notes/${note.id}.md`);
    }),
  );

  const commitMessage = [
    `import: claude-memory (${notesToWrite.length} note${notesToWrite.length === 1 ? "" : "s"})`,
    "",
    `- Notes: ${notesToWrite.length}`,
    `- Source: ${memoryDir}`,
    `- Skipped: ${skipped.length} (already exist)`,
  ].join("\n");

  try {
    const importConfigStore = new MnemonicConfigStore(VAULT_PATH);
    await vault.git.commit(commitMessage, filesToCommit);
    const mutationPushMode = (await importConfigStore.load()).mutationPushMode;
    if (mutationPushMode !== "none") {
      await vault.git.push();
    }
  } catch (err) {
    console.error(`\nNotes written but git operation failed: ${err}`);
  }

  console.log(`\n✓ Imported ${notesToWrite.length} note${notesToWrite.length === 1 ? "" : "s"} into main vault`);
  process.exit(0);
}
