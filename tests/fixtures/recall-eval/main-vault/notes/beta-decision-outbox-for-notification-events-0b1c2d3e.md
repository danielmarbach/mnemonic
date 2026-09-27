---
title: 'Decision: transactional outbox for notification events'
tags:
  - decision
  - messaging
lifecycle: permanent
createdAt: '2026-06-12T09:00:00.000Z'
updatedAt: '2026-09-21T10:00:00.000Z'
role: decision
project: https-github-com-acme-beta
projectName: beta
---

Beta writes notification events to an outbox table in the same transaction as the notification record and publishes them to SQS afterwards.

Chosen for the same reasons as elsewhere: publishing after commit loses events on crashes.
