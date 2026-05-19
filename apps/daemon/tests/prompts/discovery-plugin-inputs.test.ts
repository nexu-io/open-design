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

  it('explicitly equates plugin input values with answers to Quick-brief defaults', () => {
    // Wording-level lock so a future trim of the rule cannot accidentally
    // demote plugin inputs back to "ignore unless metadata is set".
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Both sources are equally authoritative — treat a plugin input value as a complete answer/,
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Drop the matching default question whenever EITHER source supplies the answer/,
    );
  });

  it('names the common input → question mappings the agent should follow', () => {
    // The list is non-exhaustive on purpose (semantic match handles the
    // long tail). These five cover the regressions the bug report
    // surfaced and the canonical Web Prototype scenario plugin's inputs.
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('`fidelity` answers the Fidelity question');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('`platform`');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('Target platform');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('`artifactKind`');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('`audience` answers "Who is this for?"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('`designSystem`');
  });

  it('teaches the agent to accept semantically-equivalent input names', () => {
    // Web Prototype's manifest uses `platform`; other scenarios may use
    // `surface` / `platformTargets` / `target`. The agent must treat any
    // of them as the Target platform answer instead of bailing because
    // the literal key isn't `platform`.
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(/semantically-equivalent input such as `surface`, `platformTargets`, `target`/);
  });

  it('does not re-ask the kind when the active plugin already names it', () => {
    // RULE 1 used to scope the "don't re-ask kind" carve-out to
    // `metadata.kind` only. Extending it to the active plugin's
    // `od.kind` / `taskKind` closes the loop for chip-launched flows.
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /metadata\.kind is set or the active plugin's `od\.kind` \/ `taskKind` already names it/,
    );
  });
});
