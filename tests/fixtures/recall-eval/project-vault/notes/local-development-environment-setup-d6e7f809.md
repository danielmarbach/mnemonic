---
title: Local development environment setup
tags:
  - dev-setup
  - docker
lifecycle: permanent
createdAt: '2026-03-01T09:00:00.000Z'
updatedAt: '2026-07-10T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Run the whole stack locally with Docker Compose: Postgres, RabbitMQ and a fake payment gateway.

Start everything with `make dev-up` and seed data with `make dev-seed`. The fake gateway declines any card ending in 0002, which is how the decline paths are tested by hand. Use the provided .env.example; never point a local run at shared staging credentials.
