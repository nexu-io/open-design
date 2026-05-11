---
name: meeting-notes
description: |
  Meeting notes page — title bar with attendees, agenda checklist, decisions
  block, action items table with owners + dates, and a "next meeting" footer.
  Use when the brief mentions "meeting notes", "minutes", "1:1 notes",
  "all-hands recap", or "会议纪要".
triggers:
  - "meeting notes"
  - "minutes"
  - "1:1 notes"
  - "all-hands recap"
  - "会议纪要"
od:
  mode: prototype
  platform: desktop
  scenario: operations
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Write up notes from a 60-minute Growth squad weekly — agenda, decisions, action items with owners, next meeting."
---

# Meeting Notes Skill

Produce a single-screen meeting notes page.

## Workflow

1. Read DESIGN.md.
2. Layout:
   - Header: meeting title, date, time, location/Zoom, attendees row.
   - Agenda checklist (4–6 items).
   - Decisions panel — bulleted list with strong styling.
   - Action items table with owner, due date, status.
   - "Open questions" + "next meeting" footer.
3. Subdued colour palette, clear hierarchy.

## Output contract

```
<artifact identifier="notes-name" type="text/html" title="Meeting Notes">
<!doctype html>...</artifact>
```
