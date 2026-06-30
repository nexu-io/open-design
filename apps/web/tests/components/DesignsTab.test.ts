import { describe, expect, it } from 'vitest';

import { STATUS_LABEL_KEYS, STATUS_ORDER } from '../../src/components/DesignsTab';

describe('DesignsTab status metadata', () => {
  it('keeps queued separate before running and awaiting_input', () => {
    expect(STATUS_ORDER).toEqual([
      'not_started',
      'queued',
      'running',
      'awaiting_input',
      'succeeded',
      'failed',
      'canceled',
    ]);
  });

  it('maps queued to the i18n label key', () => {
    expect(STATUS_LABEL_KEYS.queued).toBe('designs.status.queued');
  });

  it('maps awaiting_input to the i18n label key', () => {
    expect(STATUS_LABEL_KEYS.awaiting_input).toBe('designs.status.awaitingInput');
  });
});
