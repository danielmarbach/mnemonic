---
title: Devcontainer uses Node feature major 2 and locked npm install
tags:
  - devcontainer
  - tooling
  - development-setup
lifecycle: permanent
createdAt: '2026-05-22T20:41:43.350Z'
updatedAt: '2026-05-22T20:41:43.350Z'
role: decision
alwaysLoad: false
project: github-com-boblangley-mnemonic
projectName: mnemonic
memoryVersion: 1
---
The repository devcontainer should use `ghcr.io/devcontainers/features/node:2` with `version: "24"`, matching CI's Node 24 runtime while staying on the current major version of the official Node feature.

The devcontainer should run `npm ci` from `postCreateCommand` so the workspace uses the committed `package-lock.json` and avoids reinstalling on every attach. VS Code customization should use the current JS/TS setting key `js/ts.tsdk.path` instead of the deprecated `typescript.tsdk` key.

This came up while introducing `.devcontainer/devcontainer.json`: `node:2` is the current feature major, and GHCR metadata for `ghcr.io/devcontainers/features/node:2` resolved to feature version `2.0.0` with digest `sha256:fedd4c11f7adfb64283b578dddc7da906728daa25fa293351c9d913231acf12f` on 2026-05-22.
