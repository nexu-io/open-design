# Claude Review: Production Generation Workflow

Date: 2026-07-10

## What Was Reviewed

A sanitized summary of the proposed production generation workflow for Open
Design, covering:

- the generation service boundary
- OpenRouter as the text-generation / review path
- FAL.ai as the media-generation path
- the normalized segment graph
- rollback and validation expectations
- beginner-friendly workflow constraints

## Claude Findings

Claude's review was useful and mostly aligned with the direction, but it
flagged several critical gaps:

- rollback strategy was undefined
- provider failure handling was underspecified
- segment graph invariants were too loose
- the service extraction path was ambiguous
- voice profile stability needed a clearer contract
- media generation needed a clearer v1 boundary
- JSON validation should be explicitly versioned
- transient generation fields should not pollute the base model
- voice profile display labels should stay separate from ids

## Actions Taken

The spec was updated to address the review:

- added a refactor-in-place migration path
- added state safety and rollback requirements
- added explicit validation invariants
- added provider failure expectations
- clarified that storyboard generation can be text-first but media-ready
- clarified that voice profile ids remain stable even when narration changes
- added cancellation / pending / failed expectations for media jobs
- tightened the Claude verification section to keep it sanitized

## Outcome

The workflow direction is still approved, but the spec is only considered
ready after these guardrails are present. The next implementation step should
extract the production generation service and keep the existing UI buttons
working while moving prompt / parse / merge logic out of the component.
