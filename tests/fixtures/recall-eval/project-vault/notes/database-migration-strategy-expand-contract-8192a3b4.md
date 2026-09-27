---
title: Database migrations follow expand and contract
tags:
  - database
  - postgres
  - migrations
lifecycle: permanent
createdAt: '2026-03-15T09:00:00.000Z'
updatedAt: '2026-07-22T10:00:00.000Z'
role: decision
project: https-github-com-acme-alpha
projectName: alpha
---

Schema changes ship in two releases: first expand (add columns, tables, dual writes), then contract (drop the old shape) once no running version reads it.

## Why

Alpha runs rolling deploys with old and new pods side by side for up to ten minutes. A migration that renames a column breaks the old pods immediately.

## Rules

1. Never rename or drop in the same release that stops using a column.
2. Backfills run as batched background jobs, never inside the migration.
3. New non-null columns start nullable, get backfilled, and become non-null in the contract release.

## Tooling

Expand migrations run automatically on deploy through the `migrate:expand` script. Contract migrations are run manually with `migrate:contract` after the release is confirmed healthy, and the runbook requires a second reviewer. Lock timeouts are set to two seconds so a migration waiting on a busy table fails fast instead of blocking writes.
