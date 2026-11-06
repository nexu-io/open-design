import { describe, expect, it } from 'vitest';

import { DISCOVERY_AND_PHILOSOPHY } from '../../src/prompts/discovery.js';

// A project opened through a Home plugin chip includes the user's choices in
// `## Active plugin` / `## Plugin inputs`. On-demand discovery must consume
// those choices together with project metadata instead of treating a missing
// metadata field as a reason to ask another question.

describe('discovery.ts — Plugin inputs are authoritative for Quick brief defaults', () => {
  it('directs the agent to read both Project metadata AND the Active plugin / Plugin inputs block', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Read the "Project metadata" section AND any "## Active plugin" \/ "## Plugin inputs" block/,
    );
  });

  it('treats metadata and plugin inputs as authoritative known context', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('Both sources are authoritative.');
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Never re-ask a value already supplied by metadata or Plugin inputs/,
    );
  });

  it('infers defaults from all known context before deciding to ask', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Use them with the current request, conversation, and memory to infer reasonable defaults/,
    );
  });

  it('does not turn absent fields into mandatory questions', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /A missing field is an unresolved fact, not an instruction to ask/,
    );
  });

  it('asks only when the answer would materially change the result', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /Include a question only when that specific answer would materially change what you build or how you deliver it/,
    );
  });
});
