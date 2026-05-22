---
title: Devcontainer uses Node feature major 2 and locked npm install
tags:
  - devcontainer
  - tooling
  - development-setup
lifecycle: permanent
createdAt: '2026-05-22T20:41:43.350Z'
updatedAt: '2026-05-22T22:04:13.274Z'
role: decision
alwaysLoad: false
project: github-com-boblangley-mnemonic
projectName: mnemonic
memoryVersion: 1
---
The repository devcontainer should use `ghcr.io/devcontainers/features/node:2` with `version: "24"`, matching CI's Node 24 runtime while staying on the current major version of the official Node feature.

The devcontainer should run `npm ci` from `postCreateCommand` so the workspace uses the committed `package-lock.json` and avoids reinstalling on every attach. Ollama is installed via the official install script in `postCreateCommand`, started as a background service in `postStartCommand`, and the `nomic-embed-text-v2-moe` embedding model is pulled in `postAttachCommand` so MCP tools work out of the box.

VS Code customization should use `typescript.tsdk` (not `js/ts.tsdk.path`) for the workspace TypeScript SDK path, since `typescript.tsdk` has broader compatibility across VS Code versions.

A CI `check-toolchain-sync` job validates that the Node version in `.devcontainer/devcontainer.json` matches the `node-version` in `.github/workflows/ci.yml`. This prevents the versions from drifting apart and gates the `build-and-test` job.

The devcontainer includes the `vitest.explorer` and `davidanson.vscode-markdownlint` extensions (the project uses `markdownlint` + `ast-grep` for linting, not ESLint/Prettier).

This came up while introducing `.devcontainer/devcontainer.json`: `node:2` is the current feature major, and GHCR metadata for `ghcr.io/devcontainers/features/node:2` resolved to feature version `2.0.0` with digest `sha256:fedd4c11f7adfb64283b578dddc7da906728daa25fa293351c9d913231acf12f` on 2026-05-22. The base image `mcr.microsoft.com/devcontainers/base:noble` was kept for feature compatibility; the lighter `javascript-node` image doesn't support devcontainer features the same way.
