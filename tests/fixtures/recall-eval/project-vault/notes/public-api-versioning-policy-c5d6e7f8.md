---
title: Public API versioning policy
tags:
  - api
  - versioning
  - decision
lifecycle: permanent
createdAt: '2026-03-25T09:00:00.000Z'
updatedAt: '2026-06-01T10:00:00.000Z'
role: decision
project: https-github-com-acme-alpha
projectName: alpha
---

Breaking changes to the public order API get a new major path version; additive changes ship in place.

The current version is served under `/v2/orders`. A deprecated version keeps working for at least six months after its successor ships, and responses from it carry a Sunset header with the removal date. Adding optional fields or new enum values is not breaking, and clients are told to ignore unknown fields.
