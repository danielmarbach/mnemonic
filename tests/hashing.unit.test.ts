import { describe, expect, it } from "vitest";
import { xxh128 } from "../src/hashing.js";

describe("xxh128", () => {
  // Known-answer pins guard against accidental algorithm substitution: if the
  // underlying hash ever changes (or the wrapper is repointed), these hardcoded
  // digests won't match. Values are XXH3-128 (hash-wasm `xxhash128`), captured
  // independently of the wrapper under test so a swap is caught here rather
  // than only via downstream filenames.
  it("matches pinned XXH3-128 digests for known inputs", async () => {
    const cases: Array<[string, string]> = [
      ["", "99aa06d3014798d86001c324468d497f"],
      ["hello", "b5e9c1ad071b3e7fc779cfaa5e523818"],
      ["abc", "06b05ab6733a618578af5f94892f3950"],
      ["docs/Guide.md::Setup & Config::0::0", "62769fa1bd2985ba587602465f2b7925"],
      ["The quick brown fox jumps over the lazy dog", "ddd650205ca3e7fa24a1cc2e3a8a7651"],
    ];
    for (const [input, expected] of cases) {
      expect(await xxh128(input)).toBe(expected);
    }
  });

  it("is deterministic and emits 32 lowercase hex chars", async () => {
    const a = await xxh128("repeated-input");
    const b = await xxh128("repeated-input");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
