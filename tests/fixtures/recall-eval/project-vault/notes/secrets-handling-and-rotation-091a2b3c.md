---
title: Secrets handling and rotation
tags:
  - security
  - secrets
lifecycle: permanent
createdAt: '2026-03-18T09:00:00.000Z'
updatedAt: '2026-06-12T10:00:00.000Z'
role: decision
project: https-github-com-acme-alpha
projectName: alpha
---

Secrets are mounted as files from the secret store and never passed as environment variables or committed.

The application reads them from `SECRETS_MOUNT_PATH` at startup and watches the directory so rotated credentials apply without a restart. Database credentials rotate every thirty days; the payment gateway key rotates every ninety days, with both keys valid during a one day overlap.
