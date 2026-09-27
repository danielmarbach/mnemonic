---
title: 'Bug: duplicate order events created duplicate shipments'
tags:
  - bug
  - idempotency
  - messaging
lifecycle: permanent
createdAt: '2026-06-18T09:00:00.000Z'
updatedAt: '2026-06-25T10:00:00.000Z'
role: summary
project: https-github-com-acme-alpha
projectName: alpha
relatedTo:
  - id: decision-transactional-outbox-for-order-events-2b3c4d5e
    type: derives-from
---

Fulfilment created two shipments for 41 orders after a dispatcher restart because the consumer was not idempotent.

## Symptom

Customers received two parcels. Warehouse staff noticed first; there was no alert.

## Root cause

The outbox guarantees at-least-once delivery. The fulfilment consumer treated every `OrderPlaced` event as new and created a shipment each time. The dispatcher restarted during a deploy after publishing but before marking a batch as published, so the batch went out twice.

## Fix

Consumers now record processed message ids in the `IdempotencyKeyStore`, a Postgres table keyed by message id with a unique constraint. A second delivery hits the constraint, the consumer logs `ERR_DUPLICATE_ORDER_KEY` at debug level, and acknowledges the message without side effects. Keys expire after fourteen days, longer than the broker's maximum redelivery window.

## Follow-ups

- Alert when the duplicate rate exceeds 1% of deliveries
- Contract test that replays every event twice against each consumer
- Documented in the consumer template so new consumers get it by default
