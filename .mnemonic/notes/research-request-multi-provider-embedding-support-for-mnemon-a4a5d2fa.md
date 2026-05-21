---
title: 'Research Request: Multi-provider embedding support for mnemonic'
tags:
  - workflow
  - request
  - embeddings
lifecycle: temporary
createdAt: '2026-05-21T10:27:43.889Z'
updatedAt: '2026-05-21T10:31:43.521Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
# Research Request: Multi-provider Embedding Support For Mnemonic

Research and plan what is necessary for mnemonic to support not only Ollama embeddings, but also external embedding providers such as OpenAI embeddings and Gemini API embeddings.

## Inputs

- Existing mnemonic repository in `/Users/danielmarbach/Projects/mnemonic`
- OpenAI embedding model/API update: <https://openai.com/index/new-embedding-models-and-api-updates/>
- Gemini API embeddings docs: <https://ai.google.dev/gemini-api/docs/embeddings>

## Desired Output

- Current architecture findings
- Provider/API requirements and differences
- Implementation plan, including configuration, provider abstraction, storage/index compatibility, migration/backfill considerations, tests, docs, and risks

## Scope

Research and planning only in this pass; no code implementation requested.
