import { describe, expect, it } from 'vitest';

import { getStaticComposioCatalogDefinitions } from '../src/connectors/composio.js';
import { COMPOSIO_TOOLKIT_METADATA } from '../src/connectors/composio-descriptions.js';

describe('composio catalog descriptions', () => {
  it('replaces the generic placeholder description with curated copy for known toolkits', () => {
    const catalog = getStaticComposioCatalogDefinitions();
    // Slack and Linear are not in the hand-tuned FEATURED catalog, so they
    // demonstrate that the curated metadata map drives their description.
    const slackMetadata = COMPOSIO_TOOLKIT_METADATA.SLACK;
    const linearMetadata = COMPOSIO_TOOLKIT_METADATA.LINEAR;
    if (!slackMetadata || !linearMetadata) throw new Error('curated metadata missing fixtures');
    const slack = catalog.find((c) => c.id === 'slack');
    expect(slack?.description).toBe(slackMetadata.description);
    const linear = catalog.find((c) => c.id === 'linear');
    expect(linear?.description).toBe(linearMetadata.description);
  });

  it('falls back to a neutral description that does not echo the legacy "through Composio" phrasing', () => {
    const catalog = getStaticComposioCatalogDefinitions();
    for (const connector of catalog) {
      // All descriptions should be set and must not use the old
      // uninformative default.
      expect(connector.description).toBeDefined();
      expect(connector.description).not.toMatch(/^Connect to .* through Composio\.$/);
      expect(connector.description).not.toMatch(/integration via Composio/i);
    }
  });

  it('prefers the curated category over the generic "Composio" bucket', () => {
    const catalog = getStaticComposioCatalogDefinitions();
    const slack = catalog.find((c) => c.id === 'slack');
    expect(slack?.category).toBe('Communication');
    const linear = catalog.find((c) => c.id === 'linear');
    expect(linear?.category).toBe('Project management');
  });
});
