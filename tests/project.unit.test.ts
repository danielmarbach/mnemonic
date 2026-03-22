import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { afterEach, describe, expect, it } from "vitest";

import { detectProject, resolveProjectIdentity } from "../src/project.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function initRepoWithCommit(dir: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: dir });
  await execFileAsync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "--allow-empty", "-m", "init"], { cwd: dir });
}

async function addSubmodule(parentDir: string, submoduleDir: string, submodulePath: string): Promise<void> {
  await execFileAsync("git", ["-c", "protocol.file.allow=always", "-c", "user.email=test@example.com", "-c", "user.name=Test", "submodule", "add", submoduleDir, submodulePath], { cwd: parentDir });
  await execFileAsync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "add submodule"], { cwd: parentDir });
}

describe("detectProject", () => {
  it("uses the git remote URL when origin exists", async () => {
    const dir = await makeTempDir("mnemonic-project-remote-");
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], { cwd: dir });

    await expect(detectProject(dir)).resolves.toEqual({
      id: "github-com-acme-myapp",
      name: "myapp",
      source: "git-remote",
      remoteName: "origin",
    });
  });

  it("falls back to the git root folder name when no remote exists", async () => {
    const parent = await makeTempDir("mnemonic-project-parent-");
    const dir = path.join(parent, "Repo Name");
    await fs.mkdir(dir);
    await execFileAsync("git", ["init"], { cwd: dir });

    await expect(detectProject(dir)).resolves.toEqual({
      id: "repo-name",
      name: "Repo Name",
      source: "git-folder",
    });
  });

  it("falls back to the directory name outside git", async () => {
    const parent = await makeTempDir("mnemonic-folder-parent-");
    const dir = path.join(parent, "Plain Folder");
    await fs.mkdir(dir);

    await expect(detectProject(dir)).resolves.toEqual({
      id: "plain-folder",
      name: "Plain Folder",
      source: "folder",
    });
  });

  it("can use a configured remote override for forked repos", async () => {
    const dir = await makeTempDir("mnemonic-project-fork-");
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:user/myapp-fork.git"], { cwd: dir });
    await execFileAsync("git", ["remote", "add", "upstream", "git@github.com:acme/myapp.git"], { cwd: dir });

    const resolved = await resolveProjectIdentity(dir, {
      getProjectIdentityOverride: async () => ({
        remoteName: "upstream",
        updatedAt: "2026-03-08T12:00:00.000Z",
      }),
    });

    expect(resolved).toEqual({
      project: {
        id: "github-com-acme-myapp",
        name: "myapp",
        source: "git-remote-override",
        remoteName: "upstream",
      },
      defaultProject: {
        id: "github-com-user-myapp-fork",
        name: "myapp-fork",
        source: "git-remote",
        remoteName: "origin",
      },
      identityOverride: {
        remoteName: "upstream",
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
      identityOverrideApplied: true,
    });

    await expect(detectProject(dir, {
      getProjectIdentityOverride: async () => ({
        remoteName: "upstream",
        updatedAt: "2026-03-08T12:00:00.000Z",
      }),
    })).resolves.toEqual({
      id: "github-com-acme-myapp",
      name: "myapp",
      source: "git-remote-override",
      remoteName: "upstream",
    });
  });

  it("uses the superproject remote when cwd is inside a git submodule", async () => {
    const parentDir = await makeTempDir("mnemonic-project-parent-");
    const submoduleDir = await makeTempDir("mnemonic-project-submodule-");

    await initRepoWithCommit(submoduleDir);

    await execFileAsync("git", ["init"], { cwd: parentDir });
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/superproject.git"], { cwd: parentDir });
    await initRepoWithCommit(parentDir);
    await addSubmodule(parentDir, submoduleDir, "vendor/lib");

    const submoduleCwd = path.join(parentDir, "vendor/lib");

    // Project identity must come from the superproject, not the submodule
    await expect(detectProject(submoduleCwd)).resolves.toEqual({
      id: "github-com-acme-superproject",
      name: "superproject",
      source: "git-remote",
      remoteName: "origin",
    });
  });

  it("uses the superproject folder name when cwd is inside a submodule with no remote", async () => {
    const parent = await makeTempDir("mnemonic-project-parent-norem-");
    const sub = await makeTempDir("mnemonic-project-sub-norem-");

    const parentName = path.basename(parent);

    await initRepoWithCommit(sub);
    await initRepoWithCommit(parent);
    await addSubmodule(parent, sub, "vendor/dep");

    const submoduleCwd = path.join(parent, "vendor/dep");

    await expect(detectProject(submoduleCwd)).resolves.toEqual({
      id: expect.stringContaining(parentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")),
      name: parentName,
      source: "git-folder",
    });
  });
});
