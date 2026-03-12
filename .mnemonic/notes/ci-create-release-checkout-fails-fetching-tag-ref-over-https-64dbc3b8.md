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
updatedAt: '2026-03-12T05:42:36.826Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
The `create-release` job in `.github/workflows/publish.yml` fails when `workflow_dispatch` is triggered targeting a tag ref (e.g. `v0.5.0`) in the GitHub UI.

**Symptom:** git fetch of `refs/tags/v0.5.0` fails with "could not read Username for <https://github.com>: terminal prompts disabled", retries with 11s/19s backoff then gives up.

**Root cause:** `create-release` uses `actions/checkout@v6` with no explicit `ref:`. When `workflow_dispatch` targets the tag as its run ref, `github.ref` = `refs/tags/v0.5.0`. Checkout tries to fetch that tag over HTTPS and fails — either because the tag doesn't exist on the remote yet, or the credential helper isn't wired for that refspec.

**Fix:** Sparse-checkout only `CHANGELOG.md` with an explicit `ref: ${{ github.sha }}`. The job only needs that one file to extract release notes — a full clone is wasteful and tag resolution is the source of the failure.

File: `.github/workflows/publish.yml`, job `create-release`, first step (`Check out repository`).

Replace the bare checkout with:

    - name: Check out repository
      uses: actions/checkout@v6
      with:
        ref: ${{ github.sha }}
        sparse-checkout: CHANGELOG.md
        sparse-checkout-cone-mode: false

This mirrors the pattern already used in the `verify` job (which also does a sparse checkout of `package.json`).
