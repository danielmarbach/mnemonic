---
title: GitHub Packages publishing and CI workflow
tags:
  - github-actions
  - github-packages
  - ci
  - publishing
  - npm
lifecycle: permanent
createdAt: '2026-03-07T20:29:20.704Z'
updatedAt: '2026-03-07T20:51:25.054Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: local-mcp-dogfooding-helper-script-a34e7468
    type: related-to
  - id: runtime-version-sourced-from-package-json-f5646ce9
    type: related-to
  - id: npm-package-renamed-to-mnemonic-mcp-54a86ad6
    type: related-to
  - id: dynamic-project-context-loading-plan-9f2ed29c
    type: related-to
memoryVersion: 1
---
As of March 2026, mnemonic has GitHub Actions automation for both verification and publishing.

- CI runs on push and pull_request and executes npm ci, npm run build, and npm test.
- Pushes to main publish a staging package to GitHub Packages using the staging dist-tag and a prerelease version like 0.1.0-staging.RUN_NUMBER.
- Tags matching v*.*.* publish stable packages to GitHub Packages after verifying the tag matches package.json.
- The published package name is @danielmarbach/mnemonic-mcp and consumers need the GitHub Packages registry configured for the @danielmarbach scope.
