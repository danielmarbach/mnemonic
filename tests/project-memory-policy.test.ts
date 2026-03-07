import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectMemoryPolicyStore, resolveWriteScope } from "../src/project-memory-policy.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveWriteScope", () => {
  it("prefers explicit scope over project policy", () => {
    expect(resolveWriteScope("global", "project", true)).toBe("global");
  });

  it("uses the project policy when scope is omitted", () => {
    expect(resolveWriteScope(undefined, "global", true)).toBe("global");
  });

  it("returns ask when the project policy requires explicit selection", () => {
    expect(resolveWriteScope(undefined, "ask", true)).toBe("ask");
  });

  it("falls back to project storage when project context exists", () => {
    expect(resolveWriteScope(undefined, undefined, true)).toBe("project");
  });

  it("falls back to global storage without project context", () => {
    expect(resolveWriteScope(undefined, undefined, false)).toBe("global");
  });
});

describe("ProjectMemoryPolicyStore", () => {
  it("persists and reloads project policies", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mnemonic-policy-"));
    tempDirs.push(dir);

    const store = new ProjectMemoryPolicyStore(dir);
    await store.set({
      projectId: "project-1",
      projectName: "Project One",
      defaultScope: "ask",
      updatedAt: "2026-03-07T00:00:00.000Z",
    });

    const reloaded = new ProjectMemoryPolicyStore(dir);
    await expect(reloaded.get("project-1")).resolves.toEqual({
      projectId: "project-1",
      projectName: "Project One",
      defaultScope: "ask",
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });
});
