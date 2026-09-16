/**
 * Type declarations for `verify-formula.mjs`.
 * The script is plain ESM JavaScript; this file provides the types consumed by
 * the tests that import it. Keep the shapes in sync with the implementation.
 */

/** Byte payload accepted from a response body (real `fetch` and Node `Buffer` both satisfy it). */
export type ByteBody = ArrayBuffer | ArrayBufferView;

/** Minimal response shape the downloader reads from a `fetch`-like call. */
export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ByteBody>;
}

/** Formula fields read from the Homebrew formula file. */
export interface FormulaFields {
  url?: string;
  sha256?: string;
}

/** A downloaded tarball's digest and size. */
export interface DownloadChecksum {
  sha256: string;
  size: number;
}

/** Optional download dependencies, injectable for tests. */
export interface DownloadChecksumOptions {
  fetchImpl?: (url: string) => Promise<FetchLikeResponse>;
  attempts?: number;
  delayMs?: number;
}

/** Reads the first `url` and `sha256` assignments from a formula. */
export declare function parseFormula(content: string): FormulaFields;

/** Returns the hex SHA256 of the given bytes. */
export declare function sha256Of(bytes: Uint8Array): string;

/** Downloads a URL with retries and returns its SHA256, failing on empty bodies. */
export declare function downloadChecksum(
  url: string,
  options?: DownloadChecksumOptions,
): Promise<DownloadChecksum>;

/** CLI entry point; returns the process exit code. */
export declare function main(argv?: string[]): Promise<number>;
