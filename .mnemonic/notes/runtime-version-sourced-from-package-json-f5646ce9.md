---
title: Runtime version sourced from package.json
tags:
  - versioning
  - package-json
  - mcp
  - release
lifecycle: permanent
createdAt: '2026-03-07T20:29:00.474Z'
updatedAt: '2026-03-07T20:37:33.087Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: github-packages-publishing-and-ci-workflow-55495350
    type: related-to
  - id: local-mcp-dogfooding-helper-script-a34e7468
    type: related-to
  - id: npm-package-renamed-to-mnemonic-mcp-54a86ad6
    type: related-to
memoryVersion: 1
---
The MCP server version reported at startup is now read from package.json instead of being hard-coded in src/index.ts. This keeps the runtime metadata aligned with the published npm package version and avoids updating the version in multiple places.
