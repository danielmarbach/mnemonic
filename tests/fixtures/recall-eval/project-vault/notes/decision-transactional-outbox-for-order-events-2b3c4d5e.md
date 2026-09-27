---
title: 'Decision: use a transactional outbox for order events'
tags:
  - decision
  - messaging
  - postgres
lifecycle: permanent
createdAt: '2026-03-10T09:00:00.000Z'
updatedAt: '2026-07-01T10:00:00.000Z'
role: decision
project: https-github-com-acme-alpha
projectName: alpha
---

Order events are written to an outbox table in the same Postgres transaction as the order change, and a dispatcher publishes them to RabbitMQ afterwards.

## Context

Early versions published events directly after committing the order. During the April incident we lost 312 events when pods were killed between commit and publish, and fulfilment never shipped those orders.

## Decision

Every state change inserts a row into `order_outbox` in the same transaction. The `OutboxDispatcher` polls for unpublished rows, publishes them with publisher confirms, and marks them published only after the broker acknowledges.

The dispatcher runs inside the same process as the API so that a deploy never leaves rows unpublished for long. Rows are claimed with SELECT ... FOR UPDATE SKIP LOCKED so two replicas never publish the same row. Published rows are kept for seven days for forensics and then removed by a nightly job.

We considered change data capture with Debezium. It would remove the polling loop, but it adds a Kafka Connect cluster we would have to operate, and our message volume does not justify it. We also considered publishing directly after commit, which loses messages whenever the process crashes between the commit and the publish.

## Tuning

The poll interval is controlled by `OUTBOX_POLL_INTERVAL_MS` and defaults to 250 milliseconds. Batches are capped at 200 rows. When the broker is unavailable the dispatcher backs off up to five seconds and keeps the rows; nothing is dropped.

## Consequences

Consumers must be idempotent because the dispatcher guarantees at-least-once delivery. Duplicate deliveries happen after dispatcher restarts, typically a handful per deploy.
