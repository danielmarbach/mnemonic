---
title: Retry policy for payment gateway calls
tags:
  - payments
  - resilience
  - retry
lifecycle: permanent
createdAt: '2026-05-04T09:00:00.000Z'
updatedAt: '2026-08-12T10:00:00.000Z'
role: decision
project: https-github-com-acme-alpha
projectName: alpha
---

Calls to the payment gateway retry only on transport errors and 5xx responses, with capped exponential backoff and full jitter.

## Why

The gateway rate-limits aggressively and a fixed-delay retry made the June brownout worse: every client retried in lockstep. Declines and validation errors (4xx) are final and must never be retried, because retrying a decline can trigger fraud rules on the card.

## Parameters

Each authorisation gets at most three attempts, configured by `maxRetryAttempts`. The first delay is 200 milliseconds and doubles on every attempt, capped by `exponentialBackoffCapMs` at two seconds. Every attempt reuses the same idempotency key so the gateway can deduplicate.

## Timeouts

The client uses a 3 second connect timeout and an 8 second overall deadline. When the deadline passes we surface the `payment-gateway-timeout` error to the caller and leave the order in `payment_pending`, and the reconciliation job resolves it later from the gateway's report.

## Observability

Every retry increments a counter tagged with the attempt number and the gateway status code, which is how we noticed the lockstep behaviour in the first place.
