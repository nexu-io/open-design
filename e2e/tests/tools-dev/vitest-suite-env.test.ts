import { describe, expect, test } from 'vitest';

import { resolveVitestToolsDevEnv } from '@/vitest/suite';

describe('Vitest tools-dev runtime environment', () => {
  test('pins the fake Codex transport while preserving explicit overrides', () => {
    expect(resolveVitestToolsDevEnv()).toMatchObject({
      OD_CODEX_TRANSPORT: 'exec-json',
    });
    expect(resolveVitestToolsDevEnv({ OD_CODEX_TRANSPORT: 'app-server' })).toMatchObject({
      OD_CODEX_TRANSPORT: 'app-server',
    });
  });
});
