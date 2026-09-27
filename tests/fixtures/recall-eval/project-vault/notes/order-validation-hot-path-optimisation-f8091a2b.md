---
title: 'Order validation hot path: quadratic line item check removed'
tags:
  - performance
  - orders
lifecycle: permanent
createdAt: '2026-07-14T09:00:00.000Z'
updatedAt: '2026-07-16T10:00:00.000Z'
role: summary
project: https-github-com-acme-alpha
projectName: alpha
---

Large B2B orders took several seconds to validate because duplicate SKU detection compared every line item with every other one.

## Measurement

An order with 4,000 line items spent 3.8 seconds in validation, almost all of it in the duplicate check. Profiling showed the nested loop in `validateLineItems` dominating the flame graph.

## Change

Duplicate detection now builds a Map from SKU to first index in one pass, which makes it linear. Validation for the same order takes 45 milliseconds. The per-item price checks were unchanged.

## Guard

A benchmark test validates a 10,000 line order and fails if it takes more than 500 milliseconds on CI hardware.
