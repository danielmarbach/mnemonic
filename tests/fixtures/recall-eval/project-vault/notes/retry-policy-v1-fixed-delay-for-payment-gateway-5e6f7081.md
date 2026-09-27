---
title: 'Retry policy v1: fixed delay for payment gateway'
tags:
  - payments
  - retry
lifecycle: permanent
createdAt: '2026-03-20T09:00:00.000Z'
updatedAt: '2026-05-04T09:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
relatedTo:
  - id: retry-policy-for-payment-gateway-calls-4d5e6f70
    type: supersedes
---

Retry failed payment gateway calls up to five times with a fixed one second delay between attempts.

This was the first retry policy. It retries every failure, including declines, which later turned out to be harmful. Replaced by the capped exponential backoff policy.
