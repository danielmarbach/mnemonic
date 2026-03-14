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
updatedAt: '2026-03-14T13:29:12.762Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: github-packages-publishing-and-ci-workflow-55495350
    type: related-to
memoryVersion: 1
---
`publish.yml` now creates a pull request for `Formula/mnemonic-mcp.rb` updates instead of pushing commits directly to `main`. This avoids `GH013` repository rule failures when `main` requires the `build-and-test` status check and blocks direct workflow pushes.

Implementation detail: the `publish-homebrew-tap` job now grants `pull-requests: write`, updates the formula file in-place, and uses `peter-evans/create-pull-request@v7` to commit to an automation branch and open a PR with version and tarball metadata.
