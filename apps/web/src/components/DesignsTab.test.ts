import { describe, expect, it } from 'vitest';

import { STATUS_LABEL_KEYS, STATUS_ORDER } from './DesignsTab';

describe('DesignsTab status metadata', () => {
  it('places awaiting_input between running and succeeded', () => {
    expect(STATUS_ORDER).toEqual([
      'not_started',
      'running',
      'awaiting_input',
      'succeeded',
      'failed',
      'canceled',
    ]);
  });

  it('maps awaiting_input to the i18n label key', () => {
    expect(STATUS_LABEL_KEYS.awaiting_input).toBe('designs.status.awaitingInput');
  });
});
