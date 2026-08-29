---
title: 'RPIR request: smarter default scoping for recall and read tools'
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-08-29T10:49:24.929Z'
updatedAt: '2026-08-29T10:49:24.929Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Request: investigate, plan, and (if warranted) implement improvements so that recall (and potentially other read tools) do smarter scoping by default.

Problem observed: LLMs using the recall tool often (a) omit `cwd`, so recall only searches the main/global vault and misses project notes entirely, or (b) pass broad queries with default scope `all`, so notes from the project vault AND the global vault are both returned — increasing rank misses and context bloat.

Context: mnemonic has project memory policy settings (`defaultScope: project|global|ask`) that drive WRITE routing via `resolveWriteScope`, but READ tools (recall, list, recent_memories, memory_graph) hard-default `scope: "all"` and never consult the policy.

Question: should read tools derive a smarter default scope from the project policy/settings, or is there another solution (e.g. server-side cwd detection, in-band hints, description improvements)?

Requested outcome: RPIR workflow — research, present direction for confirmation, plan, implement via subagents (ollama/glm-5.3-flash:cloud for scouting/implementation; session model or flash for verification), fresh-context review, consolidate. Push back if nothing should change.
