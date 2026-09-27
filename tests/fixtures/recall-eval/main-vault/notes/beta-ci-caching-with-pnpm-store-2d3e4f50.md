---
title: CI caching with the pnpm store
tags:
  - ci
  - performance
lifecycle: permanent
createdAt: '2026-06-15T09:00:00.000Z'
updatedAt: '2026-09-19T10:00:00.000Z'
project: https-github-com-acme-beta
projectName: beta
---

Beta caches the pnpm store in CI keyed on pnpm-lock.yaml, which cut installs to under a minute.
