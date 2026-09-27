---
title: 'CI pipeline: dependency caching and Node version pinning'
tags:
  - ci
  - github-actions
  - performance
lifecycle: permanent
createdAt: '2026-04-01T09:00:00.000Z'
updatedAt: '2026-08-02T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

CI restores the npm cache keyed on the lockfile hash, which cut the install step from four minutes to forty seconds.

## Details

The workflow uses `actions/cache@v4` with the key built from the operating system and the hash of package-lock.json. A partial restore key lets a changed lockfile still reuse most of the cache.

## Node version

Node is pinned to `node-22.4.1` in .nvmrc and read by setup-node. Floating to the latest 22.x broke the build twice when a minor release changed fetch behaviour, so upgrades are now explicit pull requests from Renovate.
