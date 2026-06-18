# Example use case

Use this plugin when a user wants a repeatable Open Design workflow from a short goal.

## Example input

- `workflowGoal`: Turn a product positioning brief into a launch landing page.
- `artifactKind`: Landing page prototype.
- `audience`: Product marketers and founder-led teams.
- `platform`: Responsive web.
- `constraints`: Use the supplied brand copy, avoid invented metrics, include a hero, proof section, feature narrative, pricing prompt, and final CTA.

## Expected behavior

The agent should:

1. Ask only for missing hard requirements.
2. Inspect existing project files before editing if this is a continuation.
3. Plan the page structure and file work before writing.
4. Create a local HTML artifact with clear tokens, responsive sections, and working CTA or form behavior when requested.
5. Review the result for clarity, hierarchy, specificity, implementation readiness, and restraint.
6. Finish with a concise readiness summary.
