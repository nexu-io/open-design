# Risks / Manual-Review Template (Reconstruction deliverable)

Copy this into `issues.md` next to the re-exported `.pptx`. Its job is to be
honest about what the redesign could *not* confidently preserve, so the user
knows exactly where to put their eyes before sending the deck.

A Reconstruction run is only acceptable if this file lists every item that was
flattened, dropped, approximated, or could not be verified. An empty section
must say "None" explicitly — silence is not acceptance.

---

# Risks / Manual Review

## Content not fully preserved

- Slide N: chart was preserved as an image because the source data was not
  recoverable from the .pptx — values cannot be edited in PowerPoint.
- Slide N: table re-typeset from extracted cell text; verify merged cells /
  number formatting against the original.

## Fidelity risks (HTML → PPTX export)

- Fonts: any face that may substitute on the user's machine (non-standard
  family with no embedded fallback).
- Speaker notes: list any slide whose notes could not be carried over.
- Animations / transitions / embedded video or audio from the original: not
  reconstructed (state explicitly if the source had any).
- Anything `verify_layout.py` flagged and how it was resolved (or that it
  exited 0 across N slides).

## Could not interpret / assumptions made

- Any ambiguous content where intent was inferred — state the assumption so
  the user can correct it. Never invent data, logos, or citations to fill a
  gap; record the gap here instead.

## Manual checks recommended before sending

- Open in PowerPoint (not just LibreOffice/preview) and confirm: no clipped
  text, images/logos intact, slide count = <input count>, notes present where
  expected.
