---
title: Feature flag rollout process
tags:
  - feature-flags
  - release
lifecycle: permanent
createdAt: '2026-04-10T09:00:00.000Z'
updatedAt: '2026-06-30T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

New order behaviour ships dark behind a flag, rolls out to internal accounts, then 5%, 25% and 100% over at least three days.

Flags are environment variables read at startup and reloaded every minute. Each flag has an owner and an expiry date in the flag registry file. The split shipment work is gated by `ENABLE_SPLIT_SHIPMENTS`, which stays off in production until the warehouse integration is certified. Removing a flag is a separate pull request once it has been at 100% for two weeks.
