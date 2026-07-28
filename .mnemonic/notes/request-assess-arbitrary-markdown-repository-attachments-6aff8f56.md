---
title: 'Request: assess arbitrary Markdown repository attachments'
tags:
  - workflow
  - request
  - attachments
  - markdown
lifecycle: temporary
createdAt: '2026-07-28T07:54:22.604Z'
updatedAt: '2026-07-28T07:54:22.604Z'
role: context
alwaysLoad: false
project: https-github-com-danielmarbach-mnemonic
projectName: mnemonic
memoryVersion: 1
---
Assess whether mnemonic should extend its existing attachment model so an arbitrary Git repository containing Markdown can participate in recall without containing a `.mnemonic` vault.

The proposal is to keep attachments as the top-level federation concept, distinguish Mnemonic-vault and Markdown attachment kinds, and let both feed the existing projection and embedding pipeline. It further proposes heading-aware chunking so one Markdown document may produce multiple retrieval projections.

The requested outcome is a codebase- and memory-informed decision: endorse, narrow, or push back on the idea, followed by an implementation plan if justified. This workflow is decision and planning only; no product code should be changed.
