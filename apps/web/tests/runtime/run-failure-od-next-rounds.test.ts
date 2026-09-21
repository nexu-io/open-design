/**
 * The failure card for the OD Next round failures.
 *
 * Since the two-round design the daemon raises a small, fixed set of codes
 * around a round: the build round lost the session it was to continue, the
 * agent process ended before the round settled, the daemon failed while
 * settling a round, its task record did not match the Run, and the two
 * attachment refusals at request time. Each has its own copy in all 19
 * locales; none falls to the generic "the task failed" sentence. Every one
 * except the attachment cap offers Retry, which opens a new round in the
 * same conversation.
 *
 * The codes the daemon no longer produces (the protocol gate, the deliverable
 * gate, the one-question limit, the 409 on a settled task) are only found on
 * messages persisted before the change. They keep rendering — on the generic
 * card, since the mechanism they named is gone — and never crash the resolver.
 */
import { describe, expect, it } from 'vitest';

import {
  resolveRunErrorCardDescription,
  resolveRunFailureUi,
  RUN_FAILURE_FALLBACK_MESSAGE_KEY,
} from '../../src/runtime/amr-guidance';
import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

const ROWS = [
  {
    code: 'OD_NEXT_SESSION_UNAVAILABLE',
    titleKey: 'chat.runError.title.buildRoundSessionLost',
    messageKey: 'chat.runError.buildRoundSessionLostMessage',
    primaryAction: 'retry',
  },
  {
    code: 'od_next_physical_run_interrupted',
    titleKey: 'chat.runError.title.roundInterrupted',
    messageKey: 'chat.runError.roundInterruptedMessage',
    primaryAction: 'retry',
  },
  {
    code: 'OD_NEXT_CONTINUATION_FAILED',
    titleKey: 'chat.runError.title.roundSettlementFailed',
    messageKey: 'chat.runError.roundSettlementFailedMessage',
    primaryAction: 'retry',
  },
  {
    code: 'OD_NEXT_TASK_STATE_INVALID',
    titleKey: 'chat.runError.title.taskRecordMismatch',
    messageKey: 'chat.runError.taskRecordMismatchMessage',
    primaryAction: 'retry',
  },
  {
    code: 'OD_NEXT_SKILL_SNAPSHOT_INVALID',
    titleKey: 'chat.runError.title.taskRecordMismatch',
    messageKey: 'chat.runError.taskRecordMismatchMessage',
    primaryAction: 'retry',
  },
  {
    code: 'OD_NEXT_INPUT_SNAPSHOT_OVERSIZE',
    titleKey: 'chat.runError.title.attachmentsTooLarge',
    messageKey: 'chat.runError.attachmentsTooLargeMessage',
    // Retry would resend the same attachments; the copy names the fix.
    primaryAction: 'contact-support',
  },
  {
    code: 'OD_NEXT_INPUT_SNAPSHOT_TOCTOU',
    titleKey: 'chat.runError.title.attachmentsChanged',
    messageKey: 'chat.runError.attachmentsChangedMessage',
    primaryAction: 'retry',
  },
  {
    code: 'OD_NEXT_INPUT_SNAPSHOT_TAMPERED',
    titleKey: 'chat.runError.title.attachmentsChanged',
    messageKey: 'chat.runError.attachmentsChangedMessage',
    primaryAction: 'retry',
  },
  {
    code: 'OD_NEXT_INPUT_SNAPSHOT_INVALID',
    titleKey: 'chat.runError.title.attachmentsChanged',
    messageKey: 'chat.runError.attachmentsChangedMessage',
    primaryAction: 'retry',
  },
] as const;

const RETIRED_CODES = [
  'od_next_protocol_runtime_state_missing',
  'od_next_protocol_runtime_state_duplicate',
  'od_next_protocol_runtime_state_invalid_json',
  'od_next_protocol_runtime_state_invalid_schema',
  'od_next_canonical_deliverable_invalid',
  'od_next_clarification_repeated',
  'od_next_agent_declared_block',
  'STRATEGY_TASK_STATE_MISMATCH',
] as const;

const NEW_KEYS = [...new Set(ROWS.flatMap((row) => [row.titleKey, row.messageKey]))];

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) throw new Error(`No dictionary export found for locale ${locale}`);
  return dict;
}

describe('the OD Next round failures resolve to their own card', () => {
  it.each(ROWS)('$code has its own copy and never the generic fallback', ({ code, titleKey, messageKey, primaryAction }) => {
    for (const agent of ['claude', 'codex', 'opencode', 'amr', null]) {
      const ui = resolveRunFailureUi(code, null, agent, 'private diagnostic');
      expect(ui.titleKey).toBe(titleKey);
      expect(ui.messageKey).toBe(messageKey);
      expect(ui.suppressCard).not.toBe(true);
      // The card face renders the mapped copy, not the fallback sentence.
      expect(resolveRunErrorCardDescription({
        handedToAnotherSurface: false,
        mappedMessageKey: ui.messageKey,
        paneError: null,
        paneErrorCameFromARun: false,
        failedRunRawDetail: 'private diagnostic',
        turnEndedInTerminalFailure: true,
      })).toEqual({ render: 'mapped', messageKey });
      // A local agent's card carries the Cloud switch in the primary slot and
      // keeps the ladder's own action; the Cloud agent keeps the action only.
      expect(ui.cloudSwitchCta).toBe(agent !== 'amr');
      expect(ui.primaryAction).toBe(primaryAction);
    }
  });
});

describe('the retired codes still render, on the generic card', () => {
  it.each(RETIRED_CODES)('%s resolves without its former copy', (code) => {
    const ui = resolveRunFailureUi(code, null, 'claude', 'private diagnostic');
    expect(ui.messageKey).toBeNull();
    expect(resolveRunErrorCardDescription({
      handedToAnotherSurface: false,
      mappedMessageKey: ui.messageKey,
      paneError: null,
      paneErrorCameFromARun: false,
      failedRunRawDetail: 'private diagnostic',
      turnEndedInTerminalFailure: true,
    })).toEqual({ render: 'fallback' });
    expect(RUN_FAILURE_FALLBACK_MESSAGE_KEY).toBe('chat.runError.fallbackMessage');
  });

  it.each(LOCALES)('%s no longer carries the quality-gate wording', async (locale) => {
    const dict = await loadDict(locale as Locale);
    for (const key of [
      'chat.runError.title.strategyTaskHalted',
      'chat.runError.strategyTaskStateMismatchMessage',
      'chat.runError.title.agentReplyIncomplete',
      'chat.runError.agentReplyIncompleteMessage',
      'chat.runError.title.noDeliverable',
      'chat.runError.noDeliverableMessage',
      'chat.runError.title.clarificationRepeated',
      'chat.runError.clarificationRepeatedMessage',
      'questions.strategyBlockedNotice',
    ]) {
      expect(key in dict, `${locale} still defines ${key}`).toBe(false);
    }
  });
});

describe('the new copy exists in all 19 locales', () => {
  it.each(LOCALES)('%s defines every key, non-empty and without placeholders', async (locale) => {
    const dict = await loadDict(locale as Locale);
    for (const key of NEW_KEYS) {
      const value = dict[key];
      expect(typeof value, `${locale} ${key} missing`).toBe('string');
      expect(value.trim().length, `${locale} ${key} is empty`).toBeGreaterThan(0);
      expect(value, `${locale} ${key} is a placeholder`).not.toMatch(/TODO|TBD|FIXME|XXX/i);
    }
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s is not a copy of the English text', async (locale) => {
    const dict = await loadDict(locale as Locale);
    const enDict = await loadDict('en');
    for (const key of NEW_KEYS) {
      expect(dict[key], `${locale} ${key} equals the English text`).not.toBe(enDict[key]);
    }
  });
});
