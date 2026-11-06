import { describe, expect, it } from 'vitest';

import { STATUS_LABEL_KEYS, STATUS_ORDER } from '../../src/components/DesignsTab';

describe('DesignsTab status metadata', () => {
  it('places awaiting_input and incomplete before succeeded', () => {
    // `incomplete` is a terminal-but-needs-attention state (a succeeded run that
    // ended with unfinished declared work, #1247 / #1060). It sorts alongside
    // awaiting_input, ahead of the plain `succeeded` "Completed" pill.
    expect(STATUS_ORDER).toEqual([
      'not_started',
      'running',
      'awaiting_input',
      'incomplete',
      'succeeded',
      'failed',
      'canceled',
    ]);
  });

  it('maps awaiting_input and incomplete to their i18n label keys', () => {
    expect(STATUS_LABEL_KEYS.awaiting_input).toBe('designs.status.awaitingInput');
    expect(STATUS_LABEL_KEYS.incomplete).toBe('designs.status.incomplete');
  });
});
