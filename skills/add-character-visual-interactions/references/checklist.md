# Validation Checklist

Do not claim completion until every applicable P0 gate has fresh evidence. Report pre-existing failures separately from failures introduced by the visual change.

## P0 — Required Gates

- Review the diff and confirm APIs, authentication, routing, stores, permissions, validation, submissions, and analytics are unchanged.
- Confirm existing uncommitted user changes were preserved.
- Confirm the visual component mounts only on the requested page.
- Confirm decorative layers do not intercept pointer input unless direct character interaction was requested.
- Verify original clicks, keyboard focus order, validation, and submission behavior.
- Verify listeners, observers, timers, animation frames, canvases, and renderer resources are released on unmount.
- Verify prefers-reduced-motion and the narrow-screen fallback.
- Run the production build or equivalent compile check.
- Check the browser console for new errors and asset-loader warnings.
- Record the source and license status of every newly added image, model, texture, font, or audio asset.

## P1 — Motion and Layout

- Add one focused test for non-trivial normalization, clamping, damping, direction, or recovery math; observe it fail before implementation when practical.
- Run focused motion tests after implementation.
- Verify desktop and mobile viewports.
- Confirm no horizontal or accidental vertical overflow.
- Confirm functional controls remain visible and correctly layered.
- Confirm target tracking, bounded rotation, blink or local-part motion, and neutral recovery.
- Confirm the native pointer remains visible unless replacement was requested.

## P2 — Performance and Failure Paths

- Confirm motion uses bounded transform or renderer updates without unnecessary layout work.
- Confirm off-screen or inactive animation work is paused when the project pattern supports it.
- For 3D, confirm the canvas is nonblank, the model is framed, pixel ratio is capped, and unrelated routes do not load the model.
- For 3D, test missing WebGL, model-load failure, and unsupported-material paths; the functional page must remain usable.
- Record residual asset, browser, rendering, and performance warnings.

## Completion Report

State the files changed, target page, framework and version actually verified, checks run, browser viewports inspected, asset provenance, and remaining warnings. Do not describe an unverified framework, asset route, or visual effect as working.
