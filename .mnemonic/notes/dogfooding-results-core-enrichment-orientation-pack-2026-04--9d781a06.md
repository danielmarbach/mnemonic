---
title: 'Dogfooding results: core enrichment/orientation pack (2026-04-05)'
tags:
  - dogfooding
  - testing
  - scorecard
  - regression
lifecycle: permanent
createdAt: '2026-04-05T13:21:41.304Z'
updatedAt: '2026-04-05T13:21:41.304Z'
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Dogfooding results for the core enrichment/orientation pack on 2026-04-05 using the installed mnemonic server.

Results summary:

- A1 cold-start orientation useful: Pass
- A2 design entry path coherent: Pass
- B1 canonical design question answered: Pass with friction
- B2 temporal recall bounded and informative: Pass
- B3 verbose temporal ranking: Pass
- B4 cold hybrid phrasing: Pass
- C1 relationship follow-up usefulness: Pass with friction
- D1 warm-session stability: Pass
- E1 theme quality: Pass with friction
- F1 provenance and confidence: Pass
- F2 alwaysLoad persistence: Pass
- G1 single-commit history summary: Pass
- G2 multi-commit history summary: Pass
- E2E-1 resume-after-a-week: Pass with friction
- E2E-2 design archaeology: Pass
- E2E-3 recent-to-architecture navigation: Pass with friction
- E2E-4 read-first query: Pass

Notable observations:

- Summary primary entry was `mnemonic — key design decisions` with suggested follow-ups `GitHub Packages publishing and CI workflow`, `mnemonic — project overview and purpose`, `mnemonic — source file layout`.
- B1 top hit was `Sync redesign: decouple embedding from git, force flag, remove reindex` and included provenance with last commit hash `651637b8147013cf1aa14deb6c9e25fcb469339a`.
- B2 top temporal hit was `Temporal Interpretation Strategy` with history summary: This note was created and has not been modified since.
- The alwaysLoad frontmatter flipped cleanly from true to false in `.mnemonic/notes/dogfood-alwaysload-toggle-2026-04-05-1775395288082-b3f822f9.md` before cleanup.
- The strongest friction points were B4 and E2E-4 if the top hit was semantically close but not the exact intended anchor.

Scorecard:

- [x] cold-start orientation useful
- [x] design entry path coherent
- [ ] recall answers canonical design questions
- [x] temporal recall bounded and informative
- [x] cold hybrid phrasing still works
- [ ] relationship follow-ups useful
- [x] warm-session behavior stable
- [ ] themes meaningful
- [x] provenance and confidence sensible
- [x] alwaysLoad persistence behaves cleanly
- [x] single-commit history summary correct
- [x] multi-commit history summary useful
- [ ] resume-after-a-week works
- [x] design archaeology works
- [ ] recent-to-architecture navigation works
- [x] "what should I read first?" works
