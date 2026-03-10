---
title: 'execute-merge idempotency: avoid duplicate target notes on repeated calls'
tags:
  - consolidate
  - idempotency
  - future
  - design
lifecycle: temporary
createdAt: '2026-03-10T20:04:35.192Z'
updatedAt: '2026-03-10T20:06:31.733Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Problem

`execute-merge` calls `makeId(targetTitle)` which always appends a unique suffix. Calling it twice with the same title and source IDs creates two separate notes instead of updating the existing one. This happened in practice during dogfooding when push failures caused the tool to return `isError: true` — triggering retry attempts that each created a new note.

## Options

### A — Deterministic ID from title + sorted source IDs

Hash target title + sorted source IDs into the note ID. Same inputs → same ID → second call updates in place. Downside: changing one source produces a different target, silently orphaning the original.

### B — Pre-flight duplicate check (preferred)

Before writing the target, scan for an existing note that already has `supersedes` relationships to all requested source IDs and whose title matches. If found, update rather than create. Adds one read scan per execute-merge call; no change to ID generation or callers.

### C — Explicit idempotency key in mergePlan

Let caller pass a stable `targetId`. If note exists, update rather than create. Explicit and predictable but shifts burden to callers.

## Recommendation

Option B: pre-flight scan is the most transparent — requires no caller changes and handles the common retry case automatically. Scope it narrowly: match on (title slug prefix + all source IDs present in supersedes). Only trigger update if all sources are already superseded; partial overlap creates a new note as today.
