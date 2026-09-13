// Mirror-lock for the #5991 compaction eligibility contract: the UI
// availability gate (ChatComposer) and the replay gate (`streamViaDaemon`)
// both read `COMPACTION_ELIGIBLE_AGENT_IDS` from providers/daemon.ts, and the
// daemon's creation gate (`POST …/compact`) uses the same classification from
// apps/daemon/src/routes/project/conversations.ts. A snapshot test sits on
// each side of the apps split so a one-sided edit goes red (the daemon side
// lives in apps/daemon/tests/conversation-compaction-route.test.ts).

import { describe, expect, it } from 'vitest';
import { COMPACTION_ELIGIBLE_AGENT_IDS } from '../../src/providers/daemon.js';

describe('compaction eligibility contract (#5991)', () => {
  it('covers the eight direct API adapters, antigravity, and the byok-opencode family head', () => {
    expect([...COMPACTION_ELIGIBLE_AGENT_IDS].sort()).toEqual([
      'aihubmix-api',
      'anthropic-api',
      'antigravity',
      'azure-openai-api',
      'bedrock-api',
      'byok-opencode',
      'google-gemini-api',
      'ollama-cloud-api',
      'openai-api',
      'senseaudio-api',
    ]);
  });
});