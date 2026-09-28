---
title: Publish workflow routes Homebrew formula updates through PRs
tags:
  - ci
  - github-actions
  - publish
  - homebrew
  - branch-protection
lifecycle: permanent
createdAt: '2026-03-14T13:29:09.280Z'
updatedAt: '2026-09-28T13:18:39.157Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: github-packages-publishing-and-ci-workflow-55495350
    type: related-to
memoryVersion: 1
---
`publish.yml` creates a pull request for `Formula/mnemonic-mcp.rb` updates instead of pushing commits directly to `main`. This avoids `GH013` repository rule failures when `main` requires the `build-and-test` status check and blocks direct workflow pushes.

Implementation detail: the `publish-homebrew-tap` job grants `pull-requests: write`, updates the formula `url` and `sha256` in place, pushes an `automation/homebrew-tap-<version>` branch, opens the PR with `gh pr create`, and enables squash auto-merge.

## Tarball checksum reliability

- `scripts/ci/verify-formula.mjs` hashes the downloaded tarball in-process and rejects empty bodies; a shell pipeline once put the SHA256 of zero bytes into the 0.45.1 formula.
- 0.46.0 (run 36327448079): `publish-npm` succeeded, but registry.npmjs.org still returned 404 for the tarball after 10 attempts 6 s apart (~54 s). The step failed, and because `create-release` needs `publish-homebrew-tap`, no GitHub release was created and the `v0.46.0` milestone stayed open. Renovate later updated the formula (#382).
- Fix `df5f4ea` (0.47.0): exponential backoff 5 s, 10 s, 20 s, then 30 s, 15 attempts (~6 min); sleep is injectable for unit tests.
- Decoupled (0.47.0): `create-release` now needs only `verify`, `publish-npm` and `publish-docker`, so a formula PR failure no longer skips the GitHub release or milestone close; the run still shows failed.
- Recovery for a failed run: once the tarball resolves, `gh run rerun <id> --failed` reruns the homebrew job (formula unchanged skips the PR) and then `create-release`.
