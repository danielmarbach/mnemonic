---
title: docs/index.html — homepage design principles and UX lessons
tags:
  - docs
  - ux
  - landing-page
  - copywriting
  - design
  - navigation
lifecycle: permanent
createdAt: '2026-03-12T05:20:45.016Z'
updatedAt: '2026-04-05T10:22:33.748Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Accumulated design principles and UX lessons for `docs/index.html`, distilled from two redesign sessions (March 2026).

## Copy and content principles

**Purpose over mechanism** — Users care about "what problem does this solve?", not "what does it technically do?". Replace jargon like "Stores note + embedding; cwd sets project context" with "Tell the AI what to remember — a decision, a pattern, a gotcha."

**Avoid internal vocabulary in user-facing copy** — Words like "embedding", "cosine similarity", "frontmatter", "cwd", "scope routing", and "write scope" mean nothing to a first-time visitor. Reserve them for technical docs.

**Keep technical names out of banners and callouts** — A top-of-page banner referencing `list_migrations` assumes familiarity with MCP tool names. Describe outcomes instead: "pending migrations are surfaced automatically" rather than "run `list_migrations`".

**Selective tool-name usage is acceptable when outcome-first copy stays intact** — Tool or prompt names can appear in homepage copy when they help trust, recognition, or discoverability, but they must stay secondary to the user outcome. If a sentence starts reading like internal workflow documentation, it has gone too far.

**Two-pass copywriting** — First pass produces technically accurate but nerdy text. Second pass rewrites from the user's seat: "what am I trying to do right now?" That second pass is where personality and approachability come from.

## Layout and structure principles

**Numbered steps imply a sequence — don't use them for alternatives** — When mutually exclusive install paths (npm, docker, build from source) were presented as numbered steps, the section felt chaotic and the numbering broke down. Fix: single heading with "or" dividers between alternatives.

**Grouping reveals the mental model** — Organizing 23 tools into 4 categories (Capture & Retrieve, Knowledge Graph, Project Context, Vault Operations) immediately showed the workflow arc instead of forcing users to read 23 descriptions.

**Two information layers for tools** — Card surface answers "when would I use this?". Tooltip answers "how does it work?". Keeping these separate lets both be written well.

## Typography principles

**Design for the full range of screens, not just the smallest** — Text that feels comfortable on a phone can feel cramped and tiring on a large desktop monitor. Typography decisions should account for how the page will actually be viewed across the audience's likely devices.

**Scale proportionally rather than patching individual elements** — When type feels too small, the instinct is to increase specific elements. But isolated overrides create inconsistency and maintenance burden. Prefer a single scaling mechanism that lifts everything in proportion.

**Fluid type adapts without hard breakpoints** — A continuous scale between a comfortable floor and ceiling reads more naturally than a sudden jump at a breakpoint. Readers don't notice a gradual increase; they notice a jarring reflow.

## Navigation principles

**Nav order must match DOM order exactly** — If a nav link points to a section that appears earlier or later than its nav position implies, it breaks the user's scroll expectation. Any mismatch is a bug.

**No nav entry for a section = drop the `id`** — Silent sections (no nav link, no in-page link pointing to them) should lose their `id`. An unreachable anchor is just hidden debt.

**Nav entries inside another section don't belong at the top level** — If a link points to an element nested inside a larger section (e.g. `#agent-snippet` inside `#setup`), it shouldn't be a top-level nav item. Either promote the element to a real section or remove it from the nav.

## Files touched across both sessions

- `docs/index.html`: tools section (card layout, tooltips, categories), setup section (install option grouping, or-dividers), nav (ordering, orphan removal), early-stage banner (plain language), root font-size fluid scaling
