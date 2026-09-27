---
title: Queue consumer concurrency limits
tags:
  - messaging
  - rabbitmq
  - performance
lifecycle: permanent
createdAt: '2026-05-11T09:00:00.000Z'
updatedAt: '2026-07-18T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Each worker processes at most eight payment result messages at once, enforced by the channel prefetch.

## Settings

The broker prefetch is set with `prefetchCount` = 8 per channel, and the number of channels per worker comes from `CONSUMER_CONCURRENCY`. Raising prefetch above the database pool size caused connection starvation during a backlog, so the two must be changed together.

## Backlogs

When a backlog builds, scale out workers rather than raising prefetch. The autoscaler uses queue depth divided by the per-worker throughput measured over the last ten minutes.
