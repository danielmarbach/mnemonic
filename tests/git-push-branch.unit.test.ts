import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { GitOps } from "../src/git.js";

const execFileAsync = promisify(execFile);
const git = (repo: string, ...args: string[]) => execFileAsync("git", ["-C", repo, ...args]);

describe("GitOps.pushBranch with a real remote", () => {
  let root: string;
  let originalDisableGit: string | undefined;

  beforeEach(() => {
    originalDisableGit = process.env["DISABLE_GIT"];
    delete process.env["DISABLE_GIT"];
  });

  afterEach(async () => {
    if (originalDisableGit === undefined) delete process.env["DISABLE_GIT"];
    else process.env["DISABLE_GIT"] = originalDisableGit;
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it("pushes the checked-out commit to a pushBranch that differs from HEAD's branch", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "mnemonic-push-branch-"));
    const bare = path.join(root, "origin.git");
    const repo = path.join(root, "work");
    await mkdir(bare);
    await mkdir(repo);
    await execFileAsync("git", ["init", "--bare", "-b", "main"], { cwd: bare });
    await git(repo, "init", "-b", "main");
    await git(repo, "config", "user.email", "test@example.com");
    await git(repo, "config", "user.name", "Test");
    await git(repo, "config", "commit.gpgsign", "false");
    await git(repo, "remote", "add", "origin", bare);
    await writeFile(path.join(repo, "note.md"), "hello", "utf-8");
    await git(repo, "add", ".");
    await git(repo, "commit", "-m", "note");

    const ops = new GitOps(repo);
    await ops.init();
    const result = await ops.pushBranch("mnemonic-notes");

    expect(result).toEqual({ status: "pushed" });
    const remoteRef = await git(bare, "rev-parse", "refs/heads/mnemonic-notes");
    const localHead = await git(repo, "rev-parse", "HEAD");
    expect(remoteRef.stdout.trim()).toBe(localHead.stdout.trim());
  });
});
