---
title: Known open defects and deferred hardening (living backlog)
tags:
  - reference
  - backlog
  - known-gaps
  - follow-up
lifecycle: permanent
createdAt: '2026-10-11T06:43:38.470Z'
updatedAt: '2026-10-11T06:43:38.470Z'
role: reference
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Known open defects and deferred hardening (living backlog)

Items found by review that were judged not data-loss paths and deferred. Remove an item when it ships; add new ones here instead of in version-specific notes.

## Attachments

- `updateAttachedBranchTipHash` persists under the attached repository's own project id instead of the consuming project; the in-memory ref is correct, so the cost is a redundant reload.
- Lazy-loaded document chunks skip the embedding compatibility check after a restart; two models with the same dimensionality give wrong scores until the next `sync`.
- Attachment-side caches live inside the attached repository under its vault folder; a project id change leaves an orphaned cache directory.
- Exclude patterns assume `localPath` is the repository toplevel.
- `sync` structured output omits document-source results (text only).

## Config and process

- Config is cached per process forever; concurrent servers can overwrite each other's config writes. Re-read on mtime change or inside read-modify-write.
- No SIGINT or SIGTERM handlers; termination can land between a note write and its commit.
- `withGenerationLock` is not a mutex; waiters on a failed in-flight call proceed together (callers re-check, low risk).

## Tools and CLI

- `move_memory` commits the source deletion even when the target commit failed and never reports the source commit result.
- `execute_migration` failure returns no `isError`; running one named migration bumps the schema to that migration's max and skips older pending ones.
- `forget` under-counts `relationshipsCleaned` by one per non-primary vault.
- Lazy load caps at 5000 files while `syncDocumentSource` is uncapped.
- `validateOllamaUrl` rejects IPv6 localhost (`[::1]`) and accepts `10.evil.com` through the private-network regex.

## Identity

- Host labels that begin with `http-` or `https.` collapse with their unprefixed form because legacy canonicalization strips by prefix alone (`https.example.com` and `example.com` share an id).
- A trailing slash after `.git` yields an id ending in `-git`.

## Semantic patch

- Duplicate-section detection and dry-run diagnostics from the original footgun analysis are still unimplemented.
