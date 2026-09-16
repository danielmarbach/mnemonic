#!/usr/bin/env node

/**
 * verify-formula.mjs
 *
 * Resolves the SHA256 of an npm tarball and checks it against the value recorded
 * in `Formula/mnemonic-mcp.rb`.
 *
 * Usage:
 *   node scripts/ci/verify-formula.mjs [formula.rb]   # verify the formula in place
 *   node scripts/ci/verify-formula.mjs --url <tgz>    # print the tarball's SHA256
 *
 * The hash is computed in-process from a downloaded body rather than assembled
 * from a shell pipeline, so a failed download can never be mistaken for a hash of
 * empty input — the failure that put the SHA256 of zero bytes into the 0.45.1
 * formula's `sha256` field.
 *
 * Exit code 0 on match, 1 otherwise.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_FORMULA = "Formula/mnemonic-mcp.rb";
const ATTEMPTS = 10;
const RETRY_DELAY_MS = 6000;

export function parseFormula(content) {
  return {
    url: content.match(/^\s*url "([^"]+)"/m)?.[1],
    sha256: content.match(/^\s*sha256 "([^"]+)"/m)?.[1],
  };
}

export function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function downloadChecksum(
  url,
  { fetchImpl = fetch, attempts = ATTEMPTS, delayMs = RETRY_DELAY_MS } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        throw new Error("empty response body");
      }
      return { sha256: sha256Of(bytes), size: bytes.length };
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(`${url}: ${error.message} (after ${attempts} attempts)`, { cause: error });
      }
      if (!process.env.GITHUB_ACTIONS) {
        console.error(`${url}: attempt ${attempt}/${attempts} failed (${error.message}), retrying`);
      }
      await sleep(delayMs);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const urlFlag = argv.indexOf("--url");
  if (urlFlag !== -1) {
    const url = argv[urlFlag + 1];
    if (!url) {
      console.error("--url requires a value");
      return 1;
    }
    const { sha256 } = await downloadChecksum(url);
    console.log(sha256);
    return 0;
  }

  const formulaPath = path.resolve(argv[0] ?? DEFAULT_FORMULA);
  const { url, sha256: expected } = parseFormula(await readFile(formulaPath, "utf8"));
  if (!url || !expected) {
    console.error(`${formulaPath}: could not read url and sha256`);
    return 1;
  }

  const { sha256: actual, size } = await downloadChecksum(url);
  if (actual !== expected) {
    console.error(`${formulaPath}: sha256 does not match the published tarball`);
    console.error(`  formula:  ${expected}`);
    console.error(`  download: ${actual} (${size} bytes)`);
    return 1;
  }

  console.log(`${formulaPath}: sha256 matches ${url} (${size} bytes)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const code = await main().catch((error) => {
    console.error(error.message);
    return 1;
  });
  process.exit(code);
}
