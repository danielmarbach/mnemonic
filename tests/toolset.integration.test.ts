import { describe, expect, it } from "vitest";
import { spawn } from "child_process";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import { builtEntryPoint, tempDirs } from "./helpers/mcp.js";
import { REGISTERED_TOOL_NAMES } from "../src/tools/index.js";
import { CORE_TOOLS } from "../src/toolset.js";

type Handshake = { instructions?: string; toolNames: string[]; stderr: string };

async function handshake(toolset: string | undefined): Promise<Handshake> {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-toolset-vault-"));
  tempDirs.push(vaultDir);
  const child = spawn("node", [builtEntryPoint], {
    env: {
      ...process.env,
      VAULT_PATH: vaultDir,
      DISABLE_GIT: "true",
      MNEMONIC_TOOLSET: toolset ?? "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const responses = new Map<number, Record<string, unknown>>();
  const done = new Promise<void>((resolve) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as { id?: number; result?: Record<string, unknown> };
          if (message.id !== undefined && message.result) responses.set(message.id, message.result);
        } catch {
          // partial line
        }
      }
      if (responses.has(1) && responses.has(2)) resolve();
    });
  });

  const send = (message: Record<string, unknown>): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  };
  send({
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0" },
    },
  });
  send({ method: "notifications/initialized" });
  send({ id: 2, method: "tools/list", params: {} });
  await done;
  child.stdin.end();
  await new Promise((resolve) => child.once("close", resolve));

  const tools = (responses.get(2)?.["tools"] as Array<{ name: string }> | undefined) ?? [];
  return {
    instructions: responses.get(1)?.["instructions"] as string | undefined,
    toolNames: tools.map((tool) => tool.name),
    stderr,
  };
}

describe("toolsets and server instructions", () => {
  it("registers every tool by default and sends instructions", async () => {
    const result = await handshake(undefined);

    expect([...result.toolNames].sort()).toEqual([...REGISTERED_TOOL_NAMES].sort());
    expect(result.toolNames).toHaveLength(28);
    expect(result.instructions).toContain("Always pass `cwd`");
    expect(result.instructions).not.toContain("MNEMONIC_TOOLSET");
  }, 30_000);

  it("registers only the core tools with MNEMONIC_TOOLSET=core", async () => {
    const result = await handshake("core");

    expect([...result.toolNames].sort()).toEqual([...CORE_TOOLS].sort());
    expect(result.instructions).toContain("MNEMONIC_TOOLSET=full");
  }, 30_000);

  it("falls back to every tool for an unknown toolset", async () => {
    const result = await handshake("tiny");

    expect(result.toolNames).toHaveLength(28);
    expect(result.stderr).toContain('Unknown MNEMONIC_TOOLSET "tiny"');
  }, 30_000);
});
