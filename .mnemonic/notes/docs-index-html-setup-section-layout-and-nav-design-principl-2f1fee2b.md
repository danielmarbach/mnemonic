---
title: docs/index.html setup section — layout and nav design principles
tags:
  - docs
  - ux
  - landing-page
  - design
  - navigation
lifecycle: permanent
createdAt: '2026-03-12T05:18:19.833Z'
updatedAt: '2026-03-12T05:18:29.203Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: docs-index-html-tools-section-redesign-ux-lessons-912a441c
    type: related-to
memoryVersion: 1
---
## Setup section design lessons (March 2026)

### Install options: group alternatives, don't stack them as steps

When multiple install paths (npm, docker, build from source) were presented as sequential numbered steps, the section felt chaotic — the numbering broke down and the relationship between options was unclear. Fix: consolidate under a single "Install" step with visual "or" dividers between alternatives.

Rule: numbered steps imply a sequence. Mutually exclusive choices need a different visual treatment (tabs, dividers, or "pick one" framing).

### Nav items must match page section order exactly

The nav had "System prompt" after "Dogfooding" even though the agent snippet lived inside the Setup section — well before CLI and Dogfooding on the page. This created a broken scroll expectation for anyone following the nav linearly.

Rule: nav order === DOM order. Any nav item that links into the middle of another section is a signal that it shouldn't be a top-level nav entry.

### Orphan ids and silent sections create hidden debt

- `#agent-snippet` became an orphaned id after removing it from nav — nothing linked to it but it still existed as an anchor target.
- `#why` had no nav entry, sitting silently between the hero and `#how`, skipped by the nav entirely.

Rule: every `id` on a section should either appear in the nav or be reachable from a visible in-page link. Silent sections (no nav, no in-page link) should drop their `id`.

### Keep technical tool names out of user-facing banners

The early-stage banner referenced `list_migrations` — a technical MCP tool name that means nothing to a first-time visitor reading the page. Replace with plain language describing the outcome ("pending migrations are surfaced automatically") rather than the mechanism.
