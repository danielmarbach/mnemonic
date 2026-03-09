---
title: move_memory rewrites project association on project-vault ingress
tags:
  - move-memory
  - vault-routing
  - project-metadata
  - dogfooding
  - decision
lifecycle: permanent
createdAt: '2026-03-08T18:14:44.358Z'
updatedAt: '2026-03-08T18:14:44.358Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Decision: `move_memory` should rewrite `project` and `projectName` from `cwd` when moving a note from the main vault into a project vault, but it should preserve existing project association when moving a project note out to the main vault.

Why: storage location and project association are separate concerns, but moving a global note into project-specific storage is usually correcting a missing project context rather than changing only physical location. The reverse move is different: a project note moved to the main vault should stay associated with the project for recall and relationships.

This came from a dogfooding incident where a note was created without `cwd`, landed in the main vault as a global note, and then needed both relocation and metadata normalization.
