---
title: Local MCP dogfooding helper script
tags:
  - dogfooding
  - mcp
  - developer-workflow
  - scripts
lifecycle: permanent
createdAt: '2026-03-07T20:28:59.910Z'
updatedAt: '2026-03-07T20:29:20.819Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: github-packages-publishing-and-ci-workflow-55495350
    type: related-to
  - id: runtime-version-sourced-from-package-json-f5646ce9
    type: related-to
memoryVersion: 1
---
Mnemonic now includes a repo-local helper for development dogfooding.

- Use npm run mcp:local or scripts/mcp-local.sh to rebuild and launch the current build/index.js MCP server.
- The helper exists so local MCP clients can target the latest code without manually rebuilding first.
- AGENT.md and README both point developers at this helper for local testing and MCP client configuration.
