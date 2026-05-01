# OneShot Design Product Direction

OneShot Design is the professional artifact studio built on the Open Design engine. The product promise is simple: one prompt becomes a structured brief, a polished artifact, a critique score, a verified export, and a reusable project record.

The GitHub repository may still be named `nexu-io/open-design` during the rename, but the app-facing product name is OneShot Design.

## Current Build

- The entry screen defaults to a new `Workflows` tab.
- Workflow cards seed the right project type, skill, design system preference, prompt, quality checkpoints, and export expectations.
- Workflow-created projects preserve their workflow identity in metadata, show the selected production path in the project header, and inject workflow gates/export expectations into the agent prompt stack.
- Workflow scorecards are now structured metadata, so each production path carries its own critique rubric into the agent prompt even after the starter prompt changes.
- Workflow export packages are structured metadata, visible on the workflow cards, and injected into the agent prompt as concrete deliverable contracts.
- OneShot Cover Run now carries a CoverVisionOS handoff contract with production stages, expected files, and downstream router commands.
- Workflow-created projects now show a reusable blueprint strip with gates, exports, scorecards, handoff context, a copyable prompt, and a save action.
- Saved blueprints appear on the Workflows tab and can start a new project with the original skill, design system, metadata, and reusable prompt. They can also be grouped by workflow category, filtered to pinned items, renamed, pinned above recent items, promoted to the top of the library, and deleted after confirmation.
- The first production packs are iOS 26 App Prototype, BSA Proposal + SOW, Roofing Pitch Deck, OneShot Cover Run, Dashboard Mockup, PRD Factory, and Motion Explainer.
- James's iOS 26 Liquid Glass reference is available as the `ios-26-liquid-glass` design system and is the default visual route for the iOS 26 App Prototype workflow.
- The Liquid Glass system includes `design-systems/ios-26-liquid-glass/assets/reference-prototype.html`, a compact visual reference for lock screen widgets, Control Center tiles, app chrome, modal sheets, and reduced-brightness behavior.
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

1. Add custom blueprint collections so saved templates can move beyond automatic workflow groups.
