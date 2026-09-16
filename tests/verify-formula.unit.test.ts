import { describe, expect, it, vi } from "vitest";

import { downloadChecksum, parseFormula, sha256Of } from "../scripts/ci/verify-formula.mjs";

const FORMULA = `
class MnemonicMcp < Formula
  desc "Local MCP memory server backed by markdown + JSON files, synced via git"
  homepage "https://github.com/danielmarbach/mnemonic"
  url "https://registry.npmjs.org/@danielmarbach/mnemonic-mcp/-/mnemonic-mcp-0.45.1.tgz"
  sha256 "05bfa23f150996a68dc1fabdfa2e129868eedbbb754acaf0fd6ef05c39427d0d"
  license "Apache-2.0"
end
`;

function okResponse(body: Buffer) {
  return { ok: true, status: 200, arrayBuffer: async () => body };
}

function errorResponse(status: number) {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("parseFormula", () => {
  it("reads url and sha256 from the formula", () => {
    expect(parseFormula(FORMULA)).toEqual({
      url: "https://registry.npmjs.org/@danielmarbach/mnemonic-mcp/-/mnemonic-mcp-0.45.1.tgz",
      sha256: "05bfa23f150996a68dc1fabdfa2e129868eedbbb754acaf0fd6ef05c39427d0d",
    });
  });

  it("returns undefined fields when the formula is incomplete", () => {
    expect(parseFormula("class MnemonicMcp < Formula\nend\n")).toEqual({
      url: undefined,
      sha256: undefined,
    });
  });
});

describe("downloadChecksum", () => {
  it("hashes the downloaded body", async () => {
    const body = Buffer.from("tarball bytes");
    const fetchImpl = vi.fn(async () => okResponse(body));

    expect(await downloadChecksum("https://example.test/m.tgz", { fetchImpl })).toEqual({
      sha256: sha256Of(body),
      size: body.length,
    });
  });

  it("retries when the registry has not propagated the tarball yet", async () => {
    const body = Buffer.from("tarball bytes");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(404))
      .mockResolvedValueOnce(errorResponse(404))
      .mockResolvedValueOnce(okResponse(body));

    const result = await downloadChecksum("https://example.test/m.tgz", {
      fetchImpl,
      attempts: 5,
      delayMs: 0,
    });

    expect(result.sha256).toBe(sha256Of(body));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fails instead of hashing an empty body", async () => {
    const fetchImpl = vi.fn(async () => okResponse(Buffer.alloc(0)));

    await expect(
      downloadChecksum("https://example.test/m.tgz", { fetchImpl, attempts: 2, delayMs: 0 }),
    ).rejects.toThrow(/empty response body|after 2 attempts/);
  });

  it("fails after exhausting all attempts on a persistent 404", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(404));

    await expect(
      downloadChecksum("https://example.test/m.tgz", { fetchImpl, attempts: 3, delayMs: 0 }),
    ).rejects.toThrow("https://example.test/m.tgz: HTTP 404 (after 3 attempts)");
  });
});
