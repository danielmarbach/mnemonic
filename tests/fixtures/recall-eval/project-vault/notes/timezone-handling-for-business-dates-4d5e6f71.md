---
title: Timezone handling for business dates
tags:
  - dates
  - conventions
lifecycle: permanent
createdAt: '2026-04-28T09:00:00.000Z'
updatedAt: '2026-05-02T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Timestamps are stored in UTC; business dates such as the invoice date are derived in the merchant's timezone at the moment they are needed.

Use `toLocalBusinessDate` with the merchant's IANA timezone; never format a UTC timestamp and cut off the time, which produced the wrong invoice date for orders placed after 22:00 in Sydney.
