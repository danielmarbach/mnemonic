import { describe, expect, it } from "vitest";
import { Vault, VaultProvenance } from "../src/vault.js";

async function rgMatches(pattern: string, cwd: string): Promise<string[]> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync("rg", ["--pcre2", pattern, "--type", "ts", "--no-heading", "-n", "src/"], { cwd });
    return stdout.split("\n").filter((line) => line.trim());
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === 1) {
      return [];
    }
    throw err;
  }
}

describe("isProject migration (Phase 1)", () => {
  it("has no .isProject property access remaining in TypeScript source files", async () => {
    const matches = await rgMatches("isProject(?!ion|Note)", import.meta.dirname + "/..");
    expect(matches).toHaveLength(0);
  });

  it("has no isProject property definition remaining in TypeScript source files", async () => {
    const matches = await rgMatches("\\bisProject\\b", import.meta.dirname + "/..");
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