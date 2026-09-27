---
title: API rate limiting with a token bucket
tags:
  - api
  - rate-limiting
lifecycle: permanent
createdAt: '2026-06-02T09:00:00.000Z'
updatedAt: '2026-07-25T10:00:00.000Z'
role: decision
project: https-github-com-acme-alpha
projectName: alpha
---

Order creation is rate limited per merchant with a token bucket stored in Redis.

Each merchant gets a sustained rate of 20 requests per second and a burst of 100, configured with `rateLimitBurst`. Rejected requests get 429 with a Retry-After header. Internal batch jobs use a separate bucket so a large import cannot starve interactive checkouts.
