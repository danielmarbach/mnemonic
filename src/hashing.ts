import { xxhash128 } from "hash-wasm";

/**
 * 128-bit xxHash (XXH3-128) of a UTF-8 string as 32 lowercase hex chars.
 *
 * Non-cryptographic, deterministic, fixed-length. Used for document-source
 * chunk embedding file names (bounded regardless of source-path depth or
 * heading ancestry, so deeply nested docs never hit the 255-byte
 * single-component filename limit) and per-chunk content hashes (embedding
 * cache-reuse). 128 bits removes any practical collision concern at the
 * document-source scale (`DOCUMENT_SOURCE_LIMITS.maxTotalChunks` = 50 000).
 *
 * `node:crypto` ships no non-cryptographic 128-bit hash, so this wraps
 * `hash-wasm`. The function is async only because the WASM is lazily compiled
 * on first use and cached thereafter; subsequent calls are cheap and the
 * compile cost is paid exactly once per process.
 *
 * See the `document-source-chunk-embeddings-use-xxh128-...` decision note for
 * the rationale (xxh128 over xxh64 for collision-proofing; over the arbitrary
 * SHA-256 content hash it replaces).
 */
export function xxh128(input: string): Promise<string> {
  return xxhash128(input);
}
