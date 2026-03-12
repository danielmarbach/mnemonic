---
title: 'CI: create-release checkout fails fetching tag ref over HTTPS'
tags:
  - ci
  - github-actions
  - bug
  - checkout
  - release
lifecycle: permanent
createdAt: '2026-03-12T05:41:48.692Z'
updatedAt: '2026-03-12T05:41:48.692Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
The `create-release` job in `.github/workflows/publish.yml` fails when `workflow_dispatch` is triggered targeting a tag ref (e.g. `v0.5.0`) in the GitHub UI.

**Symptom:** git fetch of `refs/tags/v0.5.0` fails with "could not read Username for <https://github.com>: terminal prompts disabled", retries with 11s/19s backoff then gives up.

**Root cause:** `create-release` uses `actions/checkout@v6` with no explicit `ref:`. When `workflow_dispatch` targets the tag as its run ref, `github.ref` = `refs/tags/v0.5.0`. Checkout tries to fetch that tag over HTTPS and fails — either because the tag doesn't exist on the remote yet, or the credential helper isn't wired for that refspec.

**Fix:** Add `ref: ${{ github.sha }}` to the checkout step in `create-release`. The job only needs `CHANGELOG.md` — a SHA-pinned checkout is sufficient and avoids tag resolution.

File: `.github/workflows/publish.yml`, job `create-release`, first step (`Check out repository`).
