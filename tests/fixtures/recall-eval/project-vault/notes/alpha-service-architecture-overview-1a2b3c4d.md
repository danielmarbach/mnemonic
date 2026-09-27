---
title: Alpha order service — architecture overview
tags:
  - architecture
  - overview
lifecycle: permanent
createdAt: '2026-03-02T09:00:00.000Z'
updatedAt: '2026-08-20T10:00:00.000Z'
role: summary
project: https-github-com-acme-alpha
projectName: alpha
relatedTo:
  - id: decision-transactional-outbox-for-order-events-2b3c4d5e
    type: explains
  - id: queue-consumer-concurrency-limits-3c4d5e6f
    type: related-to
---

Alpha is the order service: it accepts orders over HTTP, stores them in Postgres, and publishes order events to RabbitMQ for fulfilment and billing.

## Components

- HTTP API (Fastify) for order creation, cancellation and lookup
- Postgres as the system of record, with an outbox table for events
- RabbitMQ topic exchange `orders` for downstream consumers
- A background worker that consumes payment results

## Boundaries

Alpha owns order state only. Payment authorisation lives in the payments service and is reached through the payment gateway client. Inventory reservations are requested asynchronously and confirmed through events.
