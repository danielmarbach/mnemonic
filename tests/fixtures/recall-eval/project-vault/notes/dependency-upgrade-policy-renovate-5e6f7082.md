---
title: Dependency upgrade policy
tags:
  - dependencies
  - renovate
lifecycle: permanent
createdAt: '2026-03-28T09:00:00.000Z'
updatedAt: '2026-06-05T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Renovate opens grouped weekly pull requests for minor and patch updates; majors get individual pull requests with a changelog review.

Security updates bypass the schedule. A dependency that has not had a release in two years gets flagged for replacement.
