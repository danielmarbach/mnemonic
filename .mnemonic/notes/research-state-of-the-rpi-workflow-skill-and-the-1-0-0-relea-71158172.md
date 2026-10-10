---
title: 'Research: state of the rpi-workflow skill and the 1.0.0 release gate'
tags:
  - workflow
  - research
  - rpir
  - release
  - skill-improvement
  - v1
lifecycle: temporary
createdAt: '2026-10-10T22:38:40.439Z'
updatedAt: '2026-10-10T22:38:40.439Z'
role: research
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Research: state of the rpi-workflow skill and the 1.0.0 release gate

Distilled findings for the request root (2026-10-11).

## Skill (skills/mnemonic-rpi-workflow)

- SKILL.md is about 300 lines: core principle, relationship conventions, common failure modes, five stage checklists, handoff templates, canonical graph, commit discipline, examples. `closeout-templates.md` holds the decision and summary note templates.
- The reference note on skill improvement opportunities lists eight items. Item 8 (fresh-context adversarial review) and item 4 (verification evidence block) and item 5 (closeout templates) are already in the skill. Still open: 1 commit hygiene gate with `git diff` step, 2 named dirty worktree rules, 3 commit-class state transitions, 6 branch-finish handshake, 7 dogfood anti-brittleness classification.
- Gap found during this run: the skill mandates user handoffs at Research to Plan and Plan to Implement, but says nothing about runs where the user explicitly authorized autonomous delivery. The autonomous-delivery skill expects those stops to become recorded checkpoints, with stops only for scope or authority changes.
- The MCP prompt `mnemonic-rpi-workflow` in `src/prompts.ts` (lines 86-146) is a separate compact text, not generated from SKILL.md. `tests/tool-descriptions.integration.test.ts` asserts on stage headings and specific phrases (Stage 1 to Stage 5 headings, "One current plan per request", the three commit classes sentence). New prompt lines must keep those phrases.
- README (lines 100-137) and AGENT.md describe the skill install flow and the prompt; their descriptions stay accurate after the planned additions.
- `scripts/install-skills.mjs` copies each skill directory recursively, so extra files beside SKILL.md ship automatically.

## Release gate (0.47.1 to 1.0.0)

- Version lives only in package.json (plus package-lock.json). Formula/mnemonic-mcp.rb is updated by the publish workflow after npm publish, so it is not touched by the release commit.
- Prior release commits are named "Prepare release X.Y.Z" and change CHANGELOG.md, package.json, package-lock.json. CHANGELOG has no Unreleased section right now; commits since v0.47.1 are dependency bumps, a Windows test timeout, and the formula update. None are changelog-worthy on their own.
- Publish workflow triggers on tag push `v*.*.*`, verifies the tag equals package version, publishes npm and Docker, opens the Homebrew formula PR, creates the GitHub release from the matching CHANGELOG section, and closes a milestone named like the tag if present. No milestone exists today.
- `npm run verify:release` runs build, the full vitest suite, and isolated dogfood packs. Ollama is running locally with the embedding model available.
- README line 97 still shows `@0.2.0` as the specific-release example; line 22 already states the storage format is stable with migrations.
- Open PR #390 (renovate, @modelcontextprotocol/server 2.3.1 lockfile) is unrelated and left to the user.
- Memory policy blocks auto-commit on `main`, so the work happens on branch `improve/rpi-skill-and-release-1.0.0`.

## Orchestration findings

- pi-subagents children on `claude-bridge/claude-sonnet-5-5` must be launched with `async: true`; foreground children fail because claude-bridge session hooks are not loaded for them.
