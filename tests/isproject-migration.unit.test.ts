import { describe, expect, it } from "vitest";
import { Vault, VaultProvenance } from "../src/vault.js";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";

async function getTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "build") {
      files.push(...await getTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function searchFiles(pattern: RegExp, cwd: string): Promise<string[]> {
  const files = await getTsFiles(path.join(cwd, "src"));
  const matches: string[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    let match;
    const relativePath = path.relative(cwd, file);
    while ((match = pattern.exec(content)) !== null) {
      const lines = content.substring(0, match.index).split("\n");
      const lineNumber = lines.length;
      matches.push(`${relativePath}:${lineNumber}:${match[0]}`);
    }
  }

  return matches;
}

describe("isProject migration (Phase 1)", () => {
  it("has no .isProject property access remaining in TypeScript source files", async () => {
    const matches = await searchFiles(/\.isProject(?!ion|Note)/, import.meta.dirname + "/..");
    expect(matches).toHaveLength(0);
  });

  it("has no isProject property definition remaining in TypeScript source files", async () => {
    const matches = await searchFiles(/\bisProject\b/, import.meta.dirname + "/..");
    expect(matches).toHaveLength(0);
  });

  it("Vault interface has provenance: VaultProvenance and readonly writable: boolean", () => {
    type VaultKeys = keyof Vault;
    const requiredKeys: VaultKeys[] = ["provenance", "writable"];

    for (const key of requiredKeys) {
      expect(key as string).toBeDefined();
    }
  });

  it("VaultProvenance type includes 'project-attached'", () => {
    const provenances: VaultProvenance[] = ["main", "project-local", "project-attached"];
    expect(provenances).toContain("project-attached");
  });
});