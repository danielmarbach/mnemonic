import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { MnemonicConfigStore } from "../src/config.js";
import { resolveWriteScope } from "../src/project-memory-policy.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveWriteScope", () => {
  it("prefers explicit scope over project policy", () => {
    expect(resolveWriteScope("global", "project", true, true)).toBe("global");
  });

  it("uses the project policy when scope is omitted", () => {
    expect(resolveWriteScope(undefined, "global", true, true)).toBe("global");
  });

  it("returns ask when the project policy requires explicit selection", () => {
    expect(resolveWriteScope(undefined, "ask", true, true)).toBe("ask");
  });

  it("falls back to project storage when project context and vault both exist", () => {
    expect(resolveWriteScope(undefined, undefined, true, true)).toBe("project");
  });

  it("falls back to global storage without project context", () => {
    expect(resolveWriteScope(undefined, undefined, false, false)).toBe("global");
  });

  it("returns ask when project context exists but vault does not (unadopted project)", () => {
    expect(resolveWriteScope(undefined, undefined, true, false)).toBe("ask");
  });

  it("explicit scope bypasses unadopted project check", () => {
    expect(resolveWriteScope("project", undefined, true, false)).toBe("project");
  });

  it("saved policy bypasses unadopted project check", () => {
    expect(resolveWriteScope(undefined, "global", true, false)).toBe("global");
  });
});

describe("project memory policies in config", () => {
  it("persists and reloads project policies", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-policy-"));
    tempDirs.push(dir);

    const store = new MnemonicConfigStore(dir);
    await store.setProjectPolicy({
      projectId: "project-1",
      projectName: "Project One",
      defaultScope: "ask",
      updatedAt: "2026-03-07T00:00:00.000Z",
    });

    const reloaded = new MnemonicConfigStore(dir);
    await expect(reloaded.getProjectPolicy("project-1")).resolves.toEqual({
      projectId: "project-1",
      projectName: "Project One",
      defaultScope: "ask",
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });
});
