---
name: Update PR Description (agentic)
description: >-
  Regenerates a PR title and description from the mnemonic design decision notes
  (.mnemonic/notes/*.md) changed in the PR. Pure agentic workflow — no script:
  the agent finds the notes, reads them at the PR head ref, and writes a
  structured description from the format spec below. Supports a staged dry-run
  via workflow_dispatch (dry-run input) or `gh aw trial`.

on:
  slash_command:
    name: update-pr
    events: [pull_request_comment]
  workflow_dispatch:
    inputs:
      pr-number:
        description: PR number to update (required for manual runs)
        required: true
        type: string
      dry-run:
        description: Preview the generated title/description without applying it
        required: false
        type: boolean
        default: false

permissions:
  contents: read
  pull-requests: read
  copilot-requests: write

roles: [admin, maintainer, write]
reaction: eyes
status-comment: true

engine: copilot

network:
  allowed:
    - defaults
    - github

tools:
  github:
    toolsets: [default]
  bash:
    - "gh *"
    - "cat *"
    - "head *"
    - "tail *"
    - "wc *"
    - "ls *"
    - "echo *"
    - "sed *"
    - "grep *"

safe-outputs:
  update-pull-request:
    target: ${{ github.event.inputs.pr_number || github.event.issue.number }}
    title: true
    body: true
    operation: replace
    staged: ${{ github.event.inputs.dry-run == 'true' }}

---
# Regenerate PR Title and Description from Mnemonic Notes

Update the title and description of PR #${{ github.event.inputs.pr_number || github.event.issue.number }} in ${{ github.repository }} from the mnemonic design decision notes it contains.

## Find the notes

1. List the files changed in the PR (GitHub API — `gh pr view <number> --json files` — or the GitHub MCP).
2. Keep only paths under `.mnemonic/notes/` ending in `.md`.
3. Read each note **at the PR head ref** via the GitHub API (`gh api repos/<owner>/<repo>/contents/<path>?ref=<head sha>`) or the GitHub MCP. The local checkout is the base branch and does NOT contain the PR's notes.
4. If the PR contains no mnemonic notes, emit `noop` and stop — do not touch the PR.

## Read each note

Every note has YAML frontmatter (`title`, `tags`, `role`, `lifecycle`) followed by a markdown body. Classify notes:

- `role: research` → Research artifact
- `role: plan` → Plan artifact
- `role: review` → Review artifact
- `role: context`, or unroled with `lifecycle: temporary` → Context artifact
- Everything else (no role, or `lifecycle: permanent`) → permanent design decision

## Title

- One note: use that note's `title`.
- Multiple notes: prefer the most actionable one — a bug/fix note first, then a decision/design/architecture note — and use its `title`. When the notes are the result of an applied plan, prefix with `Apply: `.

## Description

Emit the body with exactly these sections, in this order (the `##` headers are literal; omit a section when its condition is not met):

```
## Summary

<lead with what changed and why>

## Changes

<one block per permanent note — only when there are 2+ notes>

## Workflow Artifacts

<grouped research/plan/review/context notes — only when such notes exist>

## Open Questions

<content from any note's "Open Questions" or "Risks" section — only when present>

## Notes / References

_Detailed notes in `.mnemonic/notes/`:_
- `<path>` — <Note title>

---
_Generated from N design decision note(s) in `.mnemonic/notes/`. Run `/update-pr` to regenerate._
```

Per section:

- **Summary** — lead with WHAT changed and WHY. Single permanent note: use its leading paragraph. Multiple notes: one intro line, then one bullet per permanent note. Intro line: if any note is a bug/fix → `This PR fixes the following issues:`; else if any is an enhancement → `This PR adds the following enhancements:`; else → `This PR captures the following design decisions:`. Bullet: `- **<Note title>**`.
- **Changes** — for each permanent note: `### <Note title>`, then `**Tags:** <tags>` when the note has tags, then the note's leading paragraph condensed to one paragraph.
- **Workflow Artifacts** — group notes under `**Research:**`, `**Plan:**`, `**Review:**`, `**Context:**` (skip empty groups), with one line per note: `- <Note title> — <first sentence of the note>`.
- **Open Questions** — include the content of each contributing note's `Open Questions`/`Risks` section; prefix with the note title when more than one note contributes.
- **Notes / References** — the literal `_Detailed notes in `.mnemonic/notes/`:_` line, then one line per note: `` - `<path>` — <Note title> ``.
- **Footer** — `---` followed by `_Generated from N design decision note(s) in `.mnemonic/notes/`. Run `/update-pr` to regenerate._`, where `N` is the number of notes.

## Quality rules

- Summary: WHAT changed and WHY, not HOW; be specific about components or decisions; avoid vague phrases such as "various improvements" or "several changes"; do not list filenames or file extensions; keep it to 2–4 sentences.
- Only state decisions that are actually in the notes — never invent.
- The body must be complete and reviewable. Never collapse it to a one-liner.

## Output

Emit the result with the `update_pull_request` safe output: `title` and `body` (the full markdown body including the footer).

If the resulting title and body are identical to the PR's current values, emit `noop` instead.

Do not edit files, open issues, or post comments — this workflow only updates the PR description.
