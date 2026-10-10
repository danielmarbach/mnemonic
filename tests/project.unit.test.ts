import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalProjectId,
  detectProject,
  normalizeRemoteUrl,
  pickCollidingEntry,
  resolveProjectIdentity,
} from "../src/project.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })),
  );
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function initRepoWithCommit(dir: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: dir });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "commit",
      "--allow-empty",
      "-m",
      "init",
    ],
    { cwd: dir },
  );
}

async function addSubmodule(
  parentDir: string,
  submoduleDir: string,
  submodulePath: string,
): Promise<void> {
  await execFileAsync(
    "git",
    [
      "-c",
      "protocol.file.allow=always",
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "submodule",
      "add",
      submoduleDir,
      submodulePath,
    ],
    { cwd: parentDir },
  );
  await execFileAsync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "add submodule"],
    { cwd: parentDir },
  );
}

describe("detectProject", () => {
  it("uses the git remote URL when origin exists", async () => {
    const dir = await makeTempDir("mnemonic-project-remote-");
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/myapp.git"], {
      cwd: dir,
    });

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

  it("derives the same id from an https origin as from an ssh origin", async () => {
    const dir = await makeTempDir("mnemonic-project-https-");
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["remote", "add", "origin", "https://github.com/acme/myapp.git"], {
      cwd: dir,
    });

    await expect(detectProject(dir)).resolves.toEqual({
      id: "github-com-acme-myapp",
      name: "myapp",
      source: "git-remote",
      remoteName: "origin",
    });
  });

  it("can use a configured remote override for forked repos", async () => {
    const dir = await makeTempDir("mnemonic-project-fork-");
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:user/myapp-fork.git"], {
      cwd: dir,
    });
    await execFileAsync("git", ["remote", "add", "upstream", "git@github.com:acme/myapp.git"], {
      cwd: dir,
    });

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

    await expect(
      detectProject(dir, {
        getProjectIdentityOverride: async () => ({
          remoteName: "upstream",
          updatedAt: "2026-03-08T12:00:00.000Z",
        }),
      }),
    ).resolves.toEqual({
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
    await execFileAsync(
      "git",
      ["remote", "add", "origin", "git@github.com:acme/superproject.git"],
      { cwd: parentDir },
    );
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
      id: expect.stringContaining(
        parentName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      ),
      name: parentName,
      source: "git-folder",
    });
  });
});

describe("normalizeRemoteUrl", () => {
  const githubForms = [
    "git@github.com:acme/myapp.git",
    "https://github.com/acme/myapp",
    "https://github.com/acme/myapp.git",
    "http://github.com/acme/myapp",
    "ssh://git@github.com/acme/myapp.git",
    "ssh://git@github.com:22/acme/myapp.git",
    "https://user:pw@github.com/acme/myapp.git",
    "GIT@GitHub.com:Acme/MyApp.git",
    "  https://github.com/acme/myapp.git  ",
  ];

  it.each(githubForms)("maps %s to github-com-acme-myapp", (remote) => {
    expect(normalizeRemoteUrl(remote)).toBe("github-com-acme-myapp");
  });

  it.each([
    ["git@gitlab.com:group/subgroup/project.git", "gitlab-com-group-subgroup-project"],
    ["https://gitlab.com/group/subgroup/project", "gitlab-com-group-subgroup-project"],
    ["ssh://git@codeberg.org/user/repo.git", "codeberg-org-user-repo"],
    ["https://codeberg.org/user/repo", "codeberg-org-user-repo"],
    ["ssh://git@git.example.com:2222/team/repo.git", "git-example-com-team-repo"],
    ["https://git.example.com:8443/team/repo.git", "git-example-com-team-repo"],
    ["git@bitbucket.org:team/repo.git", "bitbucket-org-team-repo"],
  ])("maps %s to %s regardless of host", (remote, expected) => {
    expect(normalizeRemoteUrl(remote)).toBe(expected);
  });
});

describe("canonicalProjectId", () => {
  it.each([
    ["https-github-com-acme-myapp", "github-com-acme-myapp"],
    ["http-github-com-acme-myapp", "github-com-acme-myapp"],
    ["ssh-github-com-acme-myapp", "github-com-acme-myapp"],
    ["git-ssh-github-com-acme-myapp", "github-com-acme-myapp"],
    ["https-gitlab-com-group-project", "gitlab-com-group-project"],
  ])("strips the legacy scheme prefix from %s", (legacy, canonical) => {
    expect(canonicalProjectId(legacy)).toBe(canonical);
  });

  it.each([
    "github-com-acme-myapp",
    "gitlab-com-x",
    "git-example-com-team-repo",
    "plain-folder",
    "https-",
  ])("leaves %s unchanged", (id) => {
    expect(canonicalProjectId(id)).toBe(id);
  });

  it("is idempotent", () => {
    const once = canonicalProjectId("https-github-com-acme-myapp");
    expect(canonicalProjectId(once)).toBe(once);
  });
});

describe("pickCollidingEntry", () => {
  const legacyOlder = { value: { updatedAt: "2026-01-01T00:00:00.000Z" }, wasLegacyKey: true };
  const canonicalNewer = { value: { updatedAt: "2026-02-01T00:00:00.000Z" }, wasLegacyKey: false };

  it("prefers the newer updatedAt when both entries have one", () => {
    expect(pickCollidingEntry(legacyOlder, canonicalNewer)).toBe(canonicalNewer);
    expect(pickCollidingEntry(canonicalNewer, legacyOlder)).toBe(canonicalNewer);
    const legacyNewer = { value: { updatedAt: "2026-03-01T00:00:00.000Z" }, wasLegacyKey: true };
    expect(pickCollidingEntry(canonicalNewer, legacyNewer)).toBe(legacyNewer);
  });

  it("falls back to the canonical entry when a timestamp is missing", () => {
    const legacyUndated = { value: { updatedAt: "" }, wasLegacyKey: true };
    const canonicalUndated = { value: { updatedAt: "" }, wasLegacyKey: false };
    expect(pickCollidingEntry(legacyUndated, canonicalNewer)).toBe(canonicalNewer);
    expect(pickCollidingEntry(canonicalUndated, legacyOlder)).toBe(canonicalUndated);
  });
});
