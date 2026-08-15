---
title: 'RPIR request: qwen3-embedding endpoints and chunk-size restrictions'
tags:
  - workflow
  - request
lifecycle: temporary
createdAt: '2026-08-15T11:04:08.844Z'
updatedAt: '2026-08-15T11:06:16.882Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Request: verify and fix the restrictions DeepSeek raised while switching an instance from `nomic-embed-text-v2-moe` to `qwen3-embedding` (including the higher 4B/8B variants).

Claims under investigation:

1. Certain embedding endpoints are not supported in mnemonic.
2. The chunking size is fixed.

Requested outcome: RPIR workflow — research claims against code, plan and implement a fix, review with a fresh-context subagent, consolidate durable knowledge. User pre-authorized the full run ("investigate, plan and fix").
