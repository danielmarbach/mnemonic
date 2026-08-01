---
title: 'Docs gap fixed: attachment configuration documented in README and homepage'
tags:
  - docs
  - attachments
  - document-source
  - documentation
  - homepage
lifecycle: permanent
createdAt: '2026-08-01T09:25:34.726Z'
updatedAt: '2026-08-01T09:25:34.726Z'
role: summary
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: docs-index-html-homepage-design-principles-and-ux-lessons-6bed8673
    type: related-to
memoryVersion: 1
---
The document-source attachment feature (PR #292) shipped but README.md and docs/index.html only mentioned it — neither explained how to configure it. Follow-up docs pass closed the gap: both surfaces now carry concrete configuration guidance.

## The gap

- README.md: the `add_attachment` tool-table row was a wall of parameter names; the "Multi-repository attachments" section described `kind`/`root`/`include`/`exclude`/`acceptedMediaTypes` with no concrete example, no defaults, and no lifecycle flow.
- docs/index.html: one feature-card sentence plus tooltips; no configuration example anywhere on the page.
- The stage review note already flagged this: "README.md: brief feature mention".

## The fix (this session)

README.md:

- Shortened the `add_attachment` tool-table row and linked it to a new "Configuring attachments" subsection.
- Added defaults to the document-source bullet (`root` `.`, `include` `["**/*.md"]`, `exclude` generated/vendor paths, `acceptedMediaTypes` `["text/markdown"]`).
- New subsection: worked JSON examples for both attachment kinds, parameter tables with defaults, glob semantics, per-kind field rules, and the post-attach flow (`sync` → `recall` → `get` → mutation rejection).

docs/index.html:

- Setup section block "Search another repository's docs without copying them" written per homepage principles (docs-index-html-homepage-design-principles-and-ux-lessons-6bed8673): outcome-first prose, no internal vocabulary (cwd/documentChunks/doc:/chunk:) in prose, tool names secondary, plain-language options table.

## Verified facts (from src/tools/add-attachment.ts)

- `kind` default is `mnemonic-vault`; document-source fields: `root` (default `.`), `include` (default `["**/*.md"]`), `exclude` (default `["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage"]`), `acceptedMediaTypes` (default `["text/markdown"]`).
- Kind-mismatched fields are ignored, not rejected.
- Only tracked git blobs at the pinned revision are indexed; symlinks, submodules, and untracked files are skipped. Glob matching is case-sensitive; bare names like `node_modules` match any segment.
- Mutation tools (`update`, `forget`, `move_memory`, `relate`, `unrelate`, `consolidate`) reject `doc:`/`chunk:` refs with an immutable-document error.

## Related

- Plan note plan-read-only-markdown-attachment-retrieval-f4619b6e — its "Documentation and verification" item for README/docs is now addressed.
