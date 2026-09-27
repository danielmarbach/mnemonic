---
title: Product catalog cache invalidation
tags:
  - caching
  - redis
lifecycle: permanent
createdAt: '2026-05-20T09:00:00.000Z'
updatedAt: '2026-07-30T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Catalog prices are cached in Redis for five minutes and invalidated by events from the catalog service.

Keys follow the pattern `catalog:v3:{sku}`; bumping the version segment is how a cache format change is rolled out without a flush. On a price change event Alpha deletes the key instead of writing the new value, so a delayed event can never write a stale price back.
