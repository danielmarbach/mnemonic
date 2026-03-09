---
title: docs/index.html tools section redesign — UX lessons
tags:
  - docs
  - ux
  - landing-page
  - copywriting
  - design
lifecycle: permanent
createdAt: '2026-03-08T12:50:29.190Z'
updatedAt: '2026-03-08T12:50:29.190Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
## Tools section redesign (March 2026)

The "Everything you need, nothing you don't." section on the homepage was redesigned from a flat list of 23 tool chips to a categorized card layout with hover tooltips.

### What changed

- **Structure:** flat grid → 4 named categories (Capture & Retrieve, Knowledge Graph, Project Context, Vault Operations)
- **Card primary text:** tool name + a human-readable purpose sentence ("Save something worth keeping", "Pick up where you left off")
- **Hover tooltip:** concise explanation of what the tool actually does, written for a new user, not an implementor
- **CSS:** CSS-only tooltip via `[data-tip]::after` with scale + opacity transition; no JavaScript needed

### Key UX lessons

1. **Purpose over mechanism** — Users care about "what problem does this solve?" not "what does it technically do?". Replace jargon like "Stores note + embedding; cwd sets project context" with "Tell the AI what to remember — a decision, a pattern, a gotcha."

2. **Avoid internal vocabulary in user-facing copy** — Words like "embedding", "cosine similarity", "frontmatter", "cwd", "scope routing", and "write scope" mean nothing to a first-time visitor. Reserve them for technical docs.

3. **Grouping reveals the mental model** — Organizing 23 tools into 4 categories immediately shows the workflow arc (capture → relate → organize → maintain) instead of forcing users to read 23 descriptions.

4. **Tooltip is the right place for detail** — The card surface answers "when would I use this?". The tooltip answers "how does it work?". Keeping these separate lets both be written well.

5. **Two-pass copywriting** — First pass produces technically accurate but nerdy text. Second pass rewrites from the user's seat: "what am I trying to do right now?" That second pass is where the personality and approachability comes from.

### Files touched

- `docs/index.html`: CSS (`.tool-card`, `.tool-category-*`, `[data-tip]::after`) and HTML (tools section)
