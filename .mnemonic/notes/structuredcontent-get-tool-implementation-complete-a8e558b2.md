---
title: 'structuredContent: get tool implementation complete'
tags:
  - mcp
  - structured-content
  - get-tool
  - completed
lifecycle: permanent
createdAt: '2026-03-08T14:32:09.877Z'
updatedAt: '2026-03-08T14:32:09.877Z'
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Successfully implemented structuredContent for the get tool (4th tool overall).

Implementation details:

- Added structuredContent with action: 'got', count, notes[], and notFound[]
- Each note includes: id, title, content, project, tags, relatedTo, createdAt, updatedAt, vault
- Handles missing IDs correctly in notFound array
- Maintains backward compatibility with text output
- Tested with multiple note IDs including missing ones

4 of 23 tools now have structuredContent (17% complete):

1. remember ✅
2. recall ✅
3. list ✅
4. get ✅

Next priority: update tool (modifies existing notes)
