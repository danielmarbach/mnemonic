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
updatedAt: '2026-03-14T13:15:56.816Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Accumulated design principles and UX lessons for `docs/index.html`, distilled from two redesign sessions (March 2026).

## Copy and content principles

**Purpose over mechanism** — Users care about "what problem does this solve?", not "what does it technically do?". Replace jargon like "Stores note + embedding; cwd sets project context" with "Tell the AI what to remember — a decision, a pattern, a gotcha."

**Avoid internal vocabulary in user-facing copy** — Words like "embedding", "cosine similarity", "frontmatter", "cwd", "scope routing", and "write scope" mean nothing to a first-time visitor. Reserve them for technical docs.

**Keep technical names out of banners and callouts** — A top-of-page banner referencing `list_migrations` assumes familiarity with MCP tool names. Describe outcomes instead: "pending migrations are surfaced automatically" rather than "run `list_migrations`".

**Two-pass copywriting** — First pass produces technically accurate but nerdy text. Second pass rewrites from the user's seat: "what am I trying to do right now?" That second pass is where personality and approachability come from.

## Layout and structure principles

**Numbered steps imply a sequence — don't use them for alternatives** — When mutually exclusive install paths (npm, docker, build from source) were presented as numbered steps, the section felt chaotic and the numbering broke down. Fix: single heading with "or" dividers between alternatives.

**Grouping reveals the mental model** — Organizing 23 tools into 4 categories (Capture & Retrieve, Knowledge Graph, Project Context, Vault Operations) immediately showed the workflow arc instead of forcing users to read 23 descriptions.

**Two information layers for tools** — Card surface answers "when would I use this?". Tooltip answers "how does it work?". Keeping these separate lets both be written well.

## Typography principles

**Fluid root font-size scales the entire page** — Set `font-size: clamp(min, fluid, max)` on `html` rather than overriding individual elements. Since the page uses `rem` throughout, one declaration makes everything scale proportionally. Used: `clamp(15px, 0.625vw + 12px, 18px)` → 15px on mobile, ~18px on 1200px+ screens.

**Clamp for cross-device legibility** — Small fixed `rem` values (0.75–0.875rem) that look fine on mobile become uncomfortably small on 27"+ screens. The fluid root approach avoids adding per-element media queries and keeps proportions intact across breakpoints.

## Navigation principles

**Nav order must match DOM order exactly** — If a nav link points to a section that appears earlier or later than its nav position implies, it breaks the user's scroll expectation. Any mismatch is a bug.

**No nav entry for a section = drop the `id`** — Silent sections (no nav link, no in-page link pointing to them) should lose their `id`. An unreachable anchor is just hidden debt.

**Nav entries inside another section don't belong at the top level** — If a link points to an element nested inside a larger section (e.g. `#agent-snippet` inside `#setup`), it shouldn't be a top-level nav item. Either promote the element to a real section or remove it from the nav.

## Files touched across both sessions

- `docs/index.html`: tools section (card layout, tooltips, categories), setup section (install option grouping, or-dividers), nav (ordering, orphan removal), early-stage banner (plain language), root font-size fluid scaling
