# OneShot Design Product Direction

OneShot Design is the professional artifact studio built on the Open Design engine. The product promise is simple: one prompt becomes a structured brief, a polished artifact, a critique score, a verified export, and a reusable project record.

The GitHub repository may still be named `nexu-io/open-design` during the rename, but the app-facing product name is OneShot Design.

## Current Build

- The entry screen defaults to a new `Workflows` tab.
- Workflow cards seed the right project type, skill, design system preference, prompt, quality checkpoints, and export expectations.
- The first production packs are BSA Proposal + SOW, Roofing Pitch Deck, OneShot Cover Run, Dashboard Mockup, PRD Factory, and Motion Explainer.
- The app metadata, loading shell, onboarding copy, exported ZIP README, and locale strings now use OneShot Design.
- Next.js dev is configured to allow `127.0.0.1` and `localhost`, which keeps the in-app browser hydrated on local ports like `3004`.

## Workflow Standard

Every OneShot workflow should move through these gates:

1. Brief lock
2. Reference lock
3. Draft artifact
4. Critique score
5. Polish pass
6. Verified export

This makes OneShot different from a blank AI chat. The user starts from a professional production path, and the system should keep the output measurable, export-ready, and reusable.

## Near-Term Build Priorities

1. Persist workflow identity on created projects so the project view can show the selected production path.
2. Add workflow-specific critique scorecards to the agent prompt stack instead of keeping them only inside the seeded prompt.
3. Add export packages for each workflow: PDF/PPTX/HTML/ZIP/Markdown where appropriate.
4. Wire OneShot Cover Run into the CoverVisionOS handoff path for professional book-cover production.
5. Add a history/reuse surface so strong prompts, scorecards, and export packets can become reusable templates.
