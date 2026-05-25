---
title: TypeScript Development Principles for MCP Servers
tags:
  - typescript
  - principles
  - type-safety
  - security
  - performance
  - mcp-server
lifecycle: permanent
createdAt: '2026-05-25T17:30:10.709Z'
updatedAt: '2026-05-25T17:33:14.896Z'
role: reference
alwaysLoad: true
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# TypeScript Development Principles for MCP Servers

Durable principles extracted from TypeScript code reviews of the mnemonic MCP server. These patterns apply to TypeScript services with MCP tool contracts, git-backed file storage, and local HTTP dependencies.

## Validate Every Trust Boundary

Runtime validation is required at every boundary where data crosses from untrusted to trusted.

- `JSON.parse` results must pass Zod schema validation, never a bare `as` cast.
- MCP tool parameters must validate format at the tool boundary via Zod regex schemas, not only later in storage path construction.
- URL inputs that feed into downstream HTTP calls must restrict scheme and host to prevent SSRF.
- File system path construction from user identifiers must reject `..` and directory traversal.

## Prefer Strict TypeScript Beyond `strict: true`

Enable flags that catch common runtime-unsafe patterns:

- `noUncheckedIndexedAccess` prevents array/map indexing from assuming non-nullable results.
- `noImplicitReturns` catches switch/case fallthrough bugs.
- `noFallthroughCasesInSwitch` forces explicit handling.

Also prefer:

- Branded types for domain primitives (`MemoryId`, `ProjectId`, `ISO8601DateString`) rather than raw `string`.
- Single-sourced union types via `const` arrays + `as const` + `typeof X[number]` to prevent type/runtime value drift.
- `as const` on object/array literals that define behavior configuration.

## Replace Pattern Duplicates with Named Helpers

Repeated error-response patterns, date arithmetic, and content-analysis logic should be extracted:

- `getErrorMessage(err: unknown): string` replaces repeated `err instanceof Error ? err.message : String(err)`.
- `MS_PER_DAY` and `daysSince(isoDate, now?)` replace scattered `1000 * 60 * 60 * 24` math and `Date` construction.
- `analyzeNoteStructure()` replaces duplicate heading/bullet/list regex scans.
- Shared git constants replace identical literal arrays used by different case conventions.

## Parallelize Independent I/O

Sequential `await` across independent operations is wasteful:

- Use bounded `Promise.all` for cross-vault operations that use different git roots or different HTTP endpoints.
- Use `Promise.allSettled` for independent file system deletions.
- Do not parallelize operations that share a per-repo async mutex or git staging area.

## Cache Derived/Parsed Data with Write-Invalidate

Frequently read parsed configurations or computed projections should not re-read from disk on every tool call:

- Cache parsed config with a private `#cache` field and explicit `invalidateCache()` on writes.
- Cache markdown AST processors at module level rather than per-call.
- Session caches should hold full note lists but invalidate fully on mutation to avoid surgical update bugs.

## Use Safe Shell Patterns

- Use `execFile` with explicit argument arrays instead of `exec` with string interpolation to prevent shell injection.
- `execFile` also avoids quoting edge cases with user-provided identifiers.

## Prefer Type Predicates Over `filter(Boolean) as Type[]`

- Replace `.filter(Boolean) as Note[]` with `.filter((n): n is Note => n !== null)` or equivalent type predicates.
- This preserves narrowing across the call chain instead of forcing a later cast.

## Parameter Object Refactor Threshold

- When a function reaches 5+ positional parameters, consider a parameter object.
- This makes call sites self-documenting and prevents accidental reordering bugs.

## Error Handling Must Not Swallow Silently

- Bare `catch {}` blocks that silently return defaults should log at minimum.
- Prefer a `tryOr` utility that logs and returns a safe default, or use a debug-level log before returning.
- This applies especially to git operations that are expected to fail in legitimate edge cases.

## Console Is Not a Logger

- `console.error` used for both debug telemetry and errors makes production diagnostics unreliable.
- Extract a logger abstraction with level control, or at minimum separate `debugLog()` from error logging.
