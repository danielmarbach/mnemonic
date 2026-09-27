---
title: Release process and changelog
tags:
  - release
  - process
lifecycle: permanent
createdAt: '2026-04-05T09:00:00.000Z'
updatedAt: '2026-08-01T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Releases are cut from main by release-please, which opens a release pull request with the version bump and the changelog.

Merging that pull request tags the release and triggers the production deploy after staging smoke tests pass. Hotfixes branch from the last tag and are merged back to main immediately.
