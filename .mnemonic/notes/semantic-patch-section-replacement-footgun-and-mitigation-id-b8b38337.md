---
title: Semantic patch section replacement footgun and mitigation ideas
tags:
  - semantic-patch
  - workflow
  - tooling
  - bug-risk
lifecycle: temporary
createdAt: '2026-05-25T16:28:34.246Z'
updatedAt: '2026-05-25T16:28:34.246Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Semantic patch section replacement footgun and mitigation ideas

Repeated duplicate-section issues come from a mismatch between user intent and `semanticPatch` semantics. Heading selectors operate on the heading node, not the whole Markdown section. Operations such as `replace` and `insertAfter` therefore do not remove the existing section body, which can leave duplicated checklist sections.

## Root cause

`src/semantic-patch.ts` selectors resolve to one top-level Markdown AST node. A heading selector returns only the heading node. `replace` splices that one node; `insertAfter` inserts nodes after that heading. Neither operation understands "the section under this heading" or removes sibling nodes until the next heading.

## Product-level fixes to consider

1. Add a real section-level operation, for example `{ selector: { section: "Verification" }, operation: { op: "replaceSection", value: "..." } }`. It should replace the heading and all following nodes until the next heading of the same or higher depth.
2. Guard heading `replace`: if selector is `{ heading: ... }` and the replacement value includes the same heading, reject with an error explaining that heading `replace` only replaces the heading node and suggesting `replaceSection`.
3. Add post-patch duplicate detection for repeated headings, repeated checklist bodies, or `[x]` items followed by equivalent `[ ]` originals. Fail the update before committing when detected.
4. Rename or alias node-level operations to expose the model: `replaceNode`, `insertNodeAfter`, `insertNodeBefore`. Keep current names only as deprecated or guarded aliases.
5. Add semantic patch dry-run diagnostics that state whether the patch will leave the existing section body intact.
6. Operational workaround until section-aware patching exists: use full-content rewrite for multi-section workflow checklist updates instead of heading-level semantic patches.

## Preferred fix

Implement `replaceSection` plus a duplicate-section guard. That addresses the root API footgun and catches future misuse by humans or agents.
