---
title: 'Review: Lanes D and E pre-1.0 fixes (fresh-context adversarial)'
tags:
  - workflow
  - review
  - rpir
  - bug-fixes
  - v1
lifecycle: temporary
createdAt: '2026-10-10T23:07:58.185Z'
updatedAt: '2026-10-10T23:07:58.665Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: apply-lane-a-skill-improvements-and-lane-b-1-0-0-release-pre-74934374
    type: derives-from
memoryVersion: 1
---
# Review: Lanes D and E pre-1.0 fixes (fresh-context adversarial)

Outcome: update plan (two P1 gaps in the config fix; Lane F added to close F1 to F7 before the release commit)

Reviewer: fresh-context reviewer on claude-bridge/claude-sonnet-5-5, 2026-10-11. Scope: commits fa6e519 (Lane D) and 6548339 (Lane E), diff aefd759..6548339 for src and tests.

## Constraint checklist

| Constraint | Status | Evidence |
| --- | --- | --- |
| D1 unparseable config | partial | writeAll refuses with path and parse error (config.ts 442-446), atomic temp plus rename (447-449), first write not blocked, schema-invalid fallback kept. Gaps F1 and F2 |
| D2 attached read returns null on malformed | pass | attached-storage.ts 129-138 and 162-172; catch broader than MalformedNoteError (F5) |
| D3 empty env is unset | pass | envValue at embeddings.ts 148 used for all eight variables; EMBED_PROVIDER and EMBED_DIMENSIONS unchanged |
| D4 section selector guard | pass | throwIfSectionSelectorMisused runs before resolveSelector (semantic-patch.ts 196) |
| D5 heading text | pass | getPhrasingText flattens value, children, alt; diagnostic uses it; image alt untested (F6) |
| E1 NUL listings | pass | git log -z record shape confirmed in a scratch repo with four commits |
| E2 read-only attachments | pass with gaps | clean status test passes, but exclude behavior itself untested (F3) and CRLF idempotency broken (F4) |
| E3 pushBranch | pass | HEAD:refs/heads/branch; validation in validateBranch, add_attachment, set_attachment_branch |
| Tests fail without fix | reasoned | not run against a reverted copy for D2 and E3 |
| Style and scope | pass | no any, shared helper only |
| Windows | reasoned | CRLF issue found (F4) |

## Verification evidence (reviewer, fresh)

- Command: npm run build / Result: pass
- Command: npm run lint / Result: pass
- Command: npm run format:check / Result: pass
- Command: npm test / Result: pass / Details: 99 files, 1549 tests
- Scratch script against build/config.js reproduced F1 (getter returns 9 after a refused write) and F2 (writeVaultSchemaVersion replaced a corrupt file)

## Findings

- F1 P1: a refused config write leaves the mutation in the per-process cache; later reads show unpersisted data.
- F2 P1: writeVaultSchemaVersion still overwrites an unparseable config.json (called from migration.ts 144 and 236), the same data-loss scenario the fix targeted.
- F3 P2: info/exclude behavior has no direct test. F4 P2: exclude idempotency breaks on CRLF files. F5 P2: attached read catch broader than MalformedNoteError. F6 P2: no image-alt heading test. F7 P2: config.json.tmp left behind when rename fails.

## Decision

All seven go to Lane F before the release commit. Lesson for the skill reviewers: when a fix closes a data-loss path, enumerate every writer of that file, not only the one the report named.
