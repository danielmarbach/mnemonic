---
title: 'Testing strategy: contract tests with Pact'
tags:
  - testing
  - contracts
lifecycle: permanent
createdAt: '2026-04-12T09:00:00.000Z'
updatedAt: '2026-07-05T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Service boundaries are covered by consumer-driven contract tests instead of end-to-end environments.

Consumers publish Pact files to the broker, and Alpha's pipeline verifies them before deploying. Unit tests cover domain logic; a small set of integration tests run against real Postgres and RabbitMQ in containers.
