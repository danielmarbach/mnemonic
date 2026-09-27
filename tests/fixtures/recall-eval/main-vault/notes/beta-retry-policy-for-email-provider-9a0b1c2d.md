---
title: Retry policy for email provider calls
tags:
  - email
  - resilience
  - retry
lifecycle: permanent
createdAt: '2026-06-10T09:00:00.000Z'
updatedAt: '2026-09-20T10:00:00.000Z'
role: decision
project: https-github-com-acme-beta
projectName: beta
---

Beta retries calls to the email provider with exponential backoff and jitter, up to five attempts, because the provider throttles bursts.

Hard bounces are final; soft bounces are retried by the provider itself.
