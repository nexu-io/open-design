import { describe, expect, it } from 'vitest';

import { DISCOVERY_AND_PHILOSOPHY } from '../../src/prompts/discovery.js';

// When a project is opened through a plugin chip on Home, the daemon
// renders the chosen plugin inputs (fidelity, platform, audience,
// artifactKind, designSystem, …) into the system prompt as the
// `## Active plugin` / `## Plugin inputs` block — see
// `docs/plugins-spec.md` §1258 ("Selecting a plugin adds the
// snapshot-derived `## Active plugin`, `## Plugin inputs`, and
// active-stage atom blocks"). Before this change RULE 1 only told the
// agent to consult the `## Project metadata` block when deciding which
// default Quick-brief questions to drop, so the Quick brief still asked
// "Target platform" + "Fidelity" even when the user had already chosen
// both on Home. These tests lock the broader rule: plugin inputs are
// treated as equally authoritative answers to the matching question.

describe('discovery.ts — Plugin inputs are authoritative for Quick brief defaults', () => {
  it('directs the agent to read both Project metadata AND the Active plugin / Plugin inputs block', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Read the "Project metadata" section AND any "## Active plugin" \/ "## Plugin inputs" block/,
    );
  });

  it('treats plugin input values as equally authoritative answers to Quick-brief defaults', () => {
    // Wording-level lock so a future trim of the rule cannot accidentally
    // demote plugin inputs back to "ignore unless metadata is set".
    // The upstream on-demand discovery rewrite (#6223) generalised the
    // per-field mapping list into this single authoritative rule.
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(/Both sources are authoritative/);
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Never re-ask a value already supplied by metadata or Plugin inputs/,
    );
  });
});
