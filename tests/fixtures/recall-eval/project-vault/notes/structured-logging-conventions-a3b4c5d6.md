---
title: Structured logging conventions
tags:
  - logging
  - observability
  - conventions
lifecycle: permanent
createdAt: '2026-03-05T09:00:00.000Z'
updatedAt: '2026-05-12T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

All logs are JSON with a fixed set of top-level keys so they can be queried without parsing message strings.

Required keys are level, message, service, orderId when known, and `correlationId`, which is propagated from the incoming request header or generated at the edge. Never log card numbers, addresses or email addresses; the logger redacts known field names but that is a safety net, not a licence. Errors are logged once, at the boundary that handles them, with the error code as a separate key.
