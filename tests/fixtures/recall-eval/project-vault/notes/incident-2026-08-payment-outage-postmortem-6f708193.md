---
title: 'Postmortem: August payment outage'
tags:
  - incident
  - postmortem
  - payments
lifecycle: permanent
createdAt: '2026-08-09T09:00:00.000Z'
updatedAt: '2026-08-14T10:00:00.000Z'
role: summary
project: https-github-com-acme-alpha
projectName: alpha
relatedTo:
  - id: retry-policy-for-payment-gateway-calls-4d5e6f70
    type: related-to
---

For 47 minutes on 8 August no orders could be paid because the gateway client kept its circuit open after the gateway had recovered.

## Timeline

- 14:02 gateway starts returning 503 for a subset of requests
- 14:03 our circuit breaker opens as designed
- 14:09 gateway recovers
- 14:49 on-call restarts the payment workers and payments resume

## What went wrong

The breaker only probed the gateway after a long cool-down. The half-open delay was configured as `circuitBreakerHalfOpenAfterMs` = 3,600,000 instead of 60,000 because a unit mix-up between seconds and milliseconds slipped through review. Nothing alerted on the breaker being open, so on-call only found out from the order drop dashboard.

## Actions

1. Configuration values carry their unit in the name and are validated at startup against sane ranges.
2. Alert when the breaker stays open for more than five minutes.
3. Add a runbook step for manually closing the breaker.
