import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import matter from "gray-matter";

import {
  callLocalMcp,
  execFileAsync,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./mcp.js";

export interface AttachedVaultFixture {
  vaultDir: string;
  repoDir: string;
  attachedDir: string;
  embeddedServer: { url: string; close: () => Promise<void> };
}

export async function setupAttachedVaultFixture(
  options?: { noteId?: string; noteContent?: string; noteTitle?: string },
): Promise<AttachedVaultFixture> {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-fix-vault-"));
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-fix-repo-"));

  tempDirs.push(vaultDir, repoDir);

  await initTestRepo(repoDir);
  await initTestVaultRepo(vaultDir);

  const bareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-fix-attached-bare-"));
  const attachedDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-fix-attached-repo-"));

  tempDirs.push(bareDir, attachedDir);

  await execFileAsync("git", ["init", "--bare", "-b", "main"], { cwd: bareDir });
  await execFileAsync("git", ["init", "-b", "main"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: attachedDir });

  const notesDir = path.join(attachedDir, ".mnemonic", "notes");
  await mkdir(notesDir, { recursive: true });

  const noteId = options?.noteId ?? "attached-test-note";
  const noteTitle = options?.noteTitle ?? "Attached test note";
  const noteContent = options?.noteContent ?? "Content from attached vault.";

  await createNoteFile(notesDir, noteId, noteContent, { title: noteTitle });

  await execFileAsync("git", ["add", ".mnemonic/"], { cwd: attachedDir });
  await execFileAsync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "chore: add mnemonic notes"], { cwd: attachedDir });
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: attachedDir });
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: attachedDir });

  const embeddingServer = await startFakeEmbeddingServer();

  await callLocalMcp(vaultDir, "add_attachment", {
    cwd: path.resolve(repoDir),
    localPath: path.resolve(attachedDir),
  }, { ollamaUrl: embeddingServer.url, disableGit: false });

  return {
    vaultDir,
    repoDir,
    attachedDir,
    embeddedServer: embeddingServer,
  };
}

export async function createNoteFile(
  dir: string,
  id: string,
  content: string,
  options?: { title?: string; tags?: string[]; lifecycle?: string; project?: string },
): Promise<void> {
  const now = new Date().toISOString();
  const frontmatter: Record<string, unknown> = {
    title: options?.title ?? id,
    tags: options?.tags ?? [],
    lifecycle: options?.lifecycle ?? "permanent",
    createdAt: now,
    updatedAt: now,
  };

  if (options?.project) {
    frontmatter.project = options.project;
  }

  const fileContent = matter.stringify(content, frontmatter);
  await writeFile(path.join(dir, `${id}.md`), fileContent, "utf-8");
}

export async function teardownAttachedVaultFixture(): Promise<void> {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}
