import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { listDesignSystems } from '../src/design-systems.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// apps/daemon/tests → repo root is three levels up.
const designSystemsRoot = path.resolve(here, '../../../design-systems');

describe('bodoc built-in design system', () => {
  it('is discoverable with brand-critical facts in its DESIGN.md body', async () => {
    const systems = await listDesignSystems(designSystemsRoot);
    const bodoc = systems.find((s) => s.id === 'bodoc');

    expect(bodoc, 'bodoc design system must exist under design-systems/bodoc/').toBeDefined();
    const body = bodoc!.body;

    // Signature color — production invented generic indigo (#4f46e5) without it.
    expect(body).toContain('#16C5FF');
    // A real bodoc deeplink — production used the yourapp://signup placeholder.
    expect(body).toContain('bodoc://action/Login?method=kakao');
    // Voice rule production could not have known.
    expect(body).toContain('전문가');
    // Anti-pattern: placeholder fallback scripts are forbidden in production.
    expect(body).toContain('PREVIEW_PLACEHOLDERS');
  });
});
