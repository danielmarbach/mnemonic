---
title: mnemonic — bugs fixed during initial setup
tags:
  - bugs
  - setup
  - typescript
  - simple-git
lifecycle: permanent
createdAt: '2026-03-07T17:59:35.844Z'
updatedAt: '2026-03-07T19:41:09.084Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-source-file-layout-4d11294d
    type: related-to
memoryVersion: 1
---
Early setup exposed a few enduring implementation constraints:

- `simpleGit()` must be created in `GitOps.init()`, not the constructor, because the vault directory does not exist until `Storage.init()` runs.
- Under Node16 module resolution, `simple-git` must be imported as `import { simpleGit } from "simple-git"`.
- The project needs an explicit `tsconfig.json` with Node16 module resolution and a `build/` output directory.
- Basic repo hygiene matters: ignore `node_modules/`, `build/`, and sourcemaps from the start.
