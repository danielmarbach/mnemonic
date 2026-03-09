---
title: mnemonic git commit protocol standardization
tags:
  - git
  - protocol
  - standards
  - mcp-tools
  - documentation
  - enhancement
  - llm
lifecycle: permanent
createdAt: '2026-03-07T23:34:04.303Z'
updatedAt: '2026-03-07T23:50:48.095Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
relatedTo:
  - id: mnemonic-key-design-decisions-3f2a6273
    type: related-to
memoryVersion: 1
---
Enhanced git commit protocol with comprehensive LLM-provided summary support across multiple tools.

**Extended LLM Summary Support:**

Beyond `remember`, the following tools now accept optional `summary` parameters:

1. **`update` tool** - `summary` parameter:
   - LLM explains what changed and why
   - Example: "Clarify JWT migration timeline after security review"
   - Fallback: "Updated title, content, tags" listing actual changes

2. **`consolidate` tool** - `mergePlan.summary` parameter:
   - LLM explains merge rationale
   - Example: "Merge release workflow notes into single comprehensive guide"
   - Fallback: "Consolidated N notes into new note"

**Benefits of LLM-provided summaries:**

- LLM has full context when composing operations
- Better quality than auto-generated descriptions
- Follows conventional commit best practices
- No extra AI calls in code (simpler, faster)
- Commit messages tell the story; metadata provides structure

**Implementation pattern:**

```typescript
// Tool accepts optional summary parameter
summary: z.string().optional()

// Use LLM-provided or fallback
const commitSummary = summary ?? generateFallbackSummary()

// Include in commit body
formatCommitBody({ summary: commitSummary, ... })
```

**Updated documentation:**

- AGENT.md: Extended tool conventions table with all summary sources
- AGENT.md: Added comprehensive LLM summary guidance section
- README.md: System prompt guidance for `remember` tool

**Tools with LLM summary support:**

- `remember` - `summary` parameter (primary use case)
- `update` - `summary` parameter
- `consolidate` - `mergePlan.summary` parameter

All 26 tests passing. Build successful. Architecture is extensible - easy to add to additional tools if needed.
