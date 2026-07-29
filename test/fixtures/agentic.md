---
name: Issue responder
on:
  issue_comment:
    types: [created]
permissions:
  contents: read
  issues: write
engine: codex
tools:
  github:
    toolsets: [issues]
---

Read the following comment and decide how to respond:

${{ github.event.comment.body }}
