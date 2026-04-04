import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureBuiltEntryPointReady } from "./helpers/mcp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ensureBuiltEntryPointReady", () => {
  it("runs the build once for concurrent callers in the same process", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mnemonic-build-helper-"));
    tempDirs.push(tempRoot);

    const entryPoint = path.join(tempRoot, "build", "index.js");
    const lockDir = path.join(tempRoot, ".mcp-build-lock");
    let buildCalls = 0;

    const runBuild = vi.fn(async () => {
      buildCalls += 1;
      await mkdir(path.dirname(entryPoint), { recursive: true });
      await writeFile(entryPoint, "export {};", "utf8");
    });

    await Promise.all([
      ensureBuiltEntryPointReady({ entryPoint, lockDir, runBuild, timeoutMs: 5_000, resetMemoizedState: true }),
      ensureBuiltEntryPointReady({ entryPoint, lockDir, runBuild, timeoutMs: 5_000 }),
    ]);

    expect(runBuild).toHaveBeenCalledTimes(1);
    expect(buildCalls).toBe(1);
  });

  it("waits for another process to finish building when the lock already exists", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mnemonic-build-helper-"));
    tempDirs.push(tempRoot);

    const entryPoint = path.join(tempRoot, "build", "index.js");
    const lockDir = path.join(tempRoot, ".mcp-build-lock");
    await mkdir(lockDir, { recursive: true });

    const runBuild = vi.fn(async () => {
      throw new Error("should not run local build while lock is held");
    });

    const waiter = ensureBuiltEntryPointReady({
      entryPoint,
      lockDir,
      runBuild,
      timeoutMs: 5_000,
      pollIntervalMs: 25,
      resetMemoizedState: true,
    });

    setTimeout(async () => {
      await mkdir(path.dirname(entryPoint), { recursive: true });
      await writeFile(entryPoint, "export {};", "utf8");
      await rm(lockDir, { recursive: true, force: true });
    }, 100);

    await waiter;

    expect(runBuild).not.toHaveBeenCalled();
  });
});
