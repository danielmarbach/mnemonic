---
title: mnemonic — bugs fixed during initial setup
tags:
  - bugs
  - setup
  - typescript
  - simple-git
createdAt: '2026-03-07T17:59:35.844Z'
updatedAt: '2026-03-07T18:00:23.890Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-source-file-layout-4d11294d
    type: related-to
---
Two bugs found and fixed when first running the server:

**1. `simpleGit` called before vault directory exists**
- `GitOps` constructor called `simpleGit(vaultPath)` immediately
- `Storage.init()` creates the vault directory, but runs *after* `GitOps` is constructed
- `simple-git` throws `GitConstructError` if the directory doesn't exist
- Fix: store `vaultPath` in constructor, call `simpleGit(this.vaultPath)` inside `GitOps.init()` instead

**2. `simple-git` import style wrong under Node16 module resolution**
- `import simpleGit from "simple-git"` → TS2349: not callable
- Fix: `import { simpleGit } from "simple-git"` (named export, not default)

**3. Missing `tsconfig.json`**
- Project had no `tsconfig.json` — `tsc` printed help instead of compiling
- Created with ES2022 target, Node16 module resolution, `esModuleInterop: true`, `outDir: build`

**4. Missing `.gitignore`**
- Added: `node_modules/`, `build/`, sourcemap files
