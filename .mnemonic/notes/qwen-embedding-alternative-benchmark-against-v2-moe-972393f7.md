---
title: Qwen embedding alternative benchmark against v2 moe
tags:
  - embeddings
  - benchmark
  - qwen
  - ollama
  - retrieval
createdAt: '2026-03-08T14:08:00.922Z'
updatedAt: '2026-03-08T14:08:04.842Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Benchmarked `qwen3-embedding:0.6b` against `nomic-embed-text-v2-moe` through Ollama's `/api/embed` endpoint on the current mnemonic note corpus.

- Qwen is fully compatible with the current code path; no code changes are required beyond setting `EMBED_MODEL=qwen3-embedding:0.6b`.
- Qwen's larger context window makes it attractive for longer notes, but on the current mnemonic workload it was not clearly better overall.
- Measured results: `nomic-embed-text-v2-moe` achieved `top1=11/14`, `top3=13/14`, `MRR=0.875`, `avg_query_seconds=0.019`, `avg_note_seconds=0.0431`; `qwen3-embedding:0.6b` achieved `top1=11/14`, `top3=14/14`, `MRR=0.869`, `avg_query_seconds=0.0184`, `avg_note_seconds=0.1017`.
- Decision: keep `nomic-embed-text-v2-moe` as the default for now, but document Qwen as a viable long-context alternative because the runtime is already compatible.
