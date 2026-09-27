---
title: Error handling conventions
tags:
  - conventions
  - errors
  - typescript
lifecycle: permanent
createdAt: '2026-03-08T09:00:00.000Z'
updatedAt: '2026-06-20T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Expected failures are returned as values; exceptions are reserved for bugs and infrastructure failures.

## Rules

Domain functions return a Result with either a value or a `DomainError` carrying a stable code. The HTTP layer maps error codes to status codes in one table, so a new error code without a mapping fails a unit test. Infrastructure errors are thrown, caught at the request boundary, logged once, and returned as 503 with a retry hint.

## Why

Before this, validation failures were thrown and caught in five different places, and two of them logged the same error again, which doubled alert noise.
