#!/usr/bin/env node

import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const skillsSourceDir = path.join(packageRoot, "skills");

const DEFAULT_TARGET_DIRS = {
  claude: path.join(os.homedir(), ".claude", "skills"),
  opencode: path.join(os.homedir(), ".config", "opencode", "skills"),
};

function printUsage() {
  console.log(
    [
      "Usage: mnemonic-install-skills [options]",
      "",
      "Options:",
      "  --target <all|claude|opencode|custom>   Built-in target set (default: all)",
      "  --target-dir <path>               Additional target directory (repeatable)",
      "  --mode <copy|symlink>             Install mode (default: copy)",
      "  --update                          Replace existing installed skills",
      "  --help                            Show this help",
      "",
      "Examples:",
      "  mnemonic-install-skills --target all --mode copy",
      "  mnemonic-install-skills --target claude --update",
      "  mnemonic-install-skills --target-dir ~/.config/my-client/skills --mode symlink",
    ].join("\n")
  );
}

function normalizePath(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(argv) {
  let target = "all";
  let mode = "copy";
  let update = false;
  const customTargetDirs = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      return { help: true };
    }
    if (arg === "--update") {
      update = true;
      continue;
    }
    if (arg === "--target" || arg === "--mode" || arg === "--target-dir") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      if (arg === "--target") {
        target = value;
      } else if (arg === "--mode") {
        mode = value;
      } else {
        customTargetDirs.push(normalizePath(value));
      }
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!["all", "claude", "opencode", "custom"].includes(target)) {
    throw new Error(`Unsupported target: ${target}`);
  }
  if (!["copy", "symlink"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  return { help: false, target, mode, update, customTargetDirs };
}

async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function discoverSkills() {
  const entries = await fs.readdir(skillsSourceDir, { withFileTypes: true });
  const skillDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(skillsSourceDir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");
    if (await pathExists(skillFile)) {
      skillDirs.push({ name: entry.name, dir: skillDir });
    }
  }

  return skillDirs.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveTargetDirs(target, customTargetDirs) {
  const targets = new Set();
  if (target === "all") {
    targets.add(DEFAULT_TARGET_DIRS.claude);
    targets.add(DEFAULT_TARGET_DIRS.opencode);
  } else if (target !== "custom") {
    targets.add(DEFAULT_TARGET_DIRS[target]);
  }
  for (const customDir of customTargetDirs) {
    targets.add(customDir);
  }
  return [...targets].filter(Boolean);
}

async function installSkill({ mode, update, sourceDir, destinationDir }) {
  const destinationExists = await pathExists(destinationDir);

  if (destinationExists && !update) {
    return "skipped";
  }

  if (destinationExists) {
    await fs.rm(destinationDir, { recursive: true, force: true });
  }

  if (mode === "symlink") {
    await fs.symlink(sourceDir, destinationDir, "dir");
  } else {
    await fs.cp(sourceDir, destinationDir, { recursive: true });
  }

  return destinationExists ? "updated" : "installed";
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exit(1);
  }

  if (parsed.help) {
    printUsage();
    return;
  }

  const { target, mode, update, customTargetDirs } = parsed;

  if (!(await pathExists(skillsSourceDir))) {
    console.error(`No skills directory found at ${skillsSourceDir}`);
    process.exit(1);
  }

  const skills = await discoverSkills();
  if (skills.length === 0) {
    console.error(`No skills found in ${skillsSourceDir}`);
    process.exit(1);
  }

  const targetDirs = resolveTargetDirs(target, customTargetDirs);
  if (targetDirs.length === 0) {
    console.error("No target directories resolved.");
    process.exit(1);
  }

  const summary = { installed: 0, updated: 0, skipped: 0 };

  for (const targetDir of targetDirs) {
    await fs.mkdir(targetDir, { recursive: true });

    console.log(`\nTarget: ${targetDir}`);
    for (const skill of skills) {
      const destinationDir = path.join(targetDir, skill.name);
      const result = await installSkill({ mode, update, sourceDir: skill.dir, destinationDir });
      if (result === "installed") summary.installed += 1;
      if (result === "updated") summary.updated += 1;
      if (result === "skipped") summary.skipped += 1;
      console.log(`- ${skill.name}: ${result}`);
    }
  }

  console.log("\nDone.");
  console.log(`Installed: ${summary.installed}`);
  console.log(`Updated:   ${summary.updated}`);
  console.log(`Skipped:   ${summary.skipped}`);
  if (!update) {
    console.log("Tip: rerun with --update after upgrading mnemonic to refresh installed copies.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
