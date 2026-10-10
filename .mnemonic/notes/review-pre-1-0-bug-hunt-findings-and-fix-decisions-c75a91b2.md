---
title: 'Review: pre-1.0 bug hunt findings and fix decisions'
tags:
  - workflow
  - review
  - bug-hunt
  - release
  - v1
lifecycle: temporary
createdAt: '2026-10-10T22:52:20.280Z'
updatedAt: '2026-10-10T22:52:20.280Z'
role: review
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Review: pre-1.0 bug hunt findings and fix decisions

Outcome: update plan (fix lanes D and E added before the release commit)

Source: read-only fresh-context reviewer on claude-bridge/claude-sonnet-5-5, 2026-10-11, full report in the session artifact 3bd93501. Verified claims: M1 reproduced by the orchestrator in node (HTTPS form yields https-github-com-acme-myapp, SSH form github-com-acme-myapp); M2, M4, W5, W7 confirmed by reading the cited code.

## Must fix (reviewer severity) and decision

| Id | Finding | Decision |
| --- | --- | --- |
| M1 | HTTPS and SSH remotes produce different project ids; docs promise the same id | Product call for the user: a code fix needs a migration of project frontmatter and config keys. Not changed autonomously. |
| M2 | Unparseable config.json reads as defaults and the next write clobbers it; non-atomic write | Fix in Lane D (refuse writes while unreadable, atomic rename) |
| M3 | git ls-tree quotes non-ASCII paths (core.quotePath) so such docs are silently skipped | Fix in Lane E (NUL-separated listing in document-sync, lazy-load, recency map) |
| M4 | Malformed note in an attached vault throws out of readNote and breaks list or drops the attachment from recall | Fix in Lane D (return null like Storage) |

## Worth fixing soon and decision

| Id | Finding | Decision |
| --- | --- | --- |
| W1 | Loading a read-only attachment runs Storage.init and ensureGitignore inside the attached repo, dirtying its tree | Fix in Lane E (skip for non-writable) |
| W2 | updateAttachedBranchTipHash persists under the attached repo's project id instead of the consuming project | Defer (in-memory ref is correct; only a redundant reload) |
| W3 | pushBranch different from the checked-out branch fails (src refspec); branch names may start with a dash | Fix in Lane E (push HEAD to refs/heads/branch, reject leading dash) |
| W4 | move_memory commits the source deletion even when the target commit failed and never reports the source commit | Defer, follow-up issue (note stays on disk, no data loss) |
| W5 | section selector with non-replaceSection ops acts like a heading selector | Fix in Lane D (reject up front). Hit during this run: section plus appendChild fails with a misleading heading error |
| W6 | Heading text ignores inline code and emphasis so such headings cannot be selected | Fix in Lane D |
| W7 | Empty-string env vars crash startup (empty OLLAMA_URL) or select empty models | Fix in Lane D (empty means unset) |
| W8 | Lazy-loaded document chunks skip the embedding compatibility check | Defer, follow-up issue |
| W9 | Config cached per process forever; concurrent servers overwrite each other's config | Defer, follow-up issue |
| W10 | execute_migration failure lacks isError; a single migration run bumps the schema past older pending ones; forget under-counts relationshipsCleaned; lazy-load 5000-file cap versus uncapped sync; IPv6 localhost rejected and 10.evil.com accepted by validateOllamaUrl; withGenerationLock is not a mutex; no SIGINT or SIGTERM handlers | Defer, follow-up issues; none lose data |

## Known gaps from memory notes

The reviewer cross-checked eight notes. Fixed in code: section replace footgun, heading child ops, writable attached cache invalidation, writable error messages, document-source chunk embeddings, compatibility identity, per-repo git mutex, language-independent conflict detection, stdio onclose. Still open: sync structured output omits document results, branchTipHash persist key (W2), signal handlers; hindsight M3, M6, M13, M16 remain deferred by design.

## Checked and clean

git mutex and scoped commits, startup and stdio, mutation guard, list pagination and limits, documented defaults, storage frontmatter round trip, migration idempotency and locking, manifest atomic write, lazy-load cat-file parser, relate guards, forget and consolidate retry capture.
