import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatConversationCompaction,
  ChatMessage,
} from '@open-design/contracts';

vi.mock('../src/providers/daemon', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/providers/daemon')>();
  return {
    ...mod,
    fetchConversationCompaction: vi.fn(),
    compactConversation: vi.fn(),
  };
});

import {
  AUTO_COMPACTION_FALLBACK_WINDOW_TOKENS,
  computeAutoCompactionDecision,
  estimateTextTokens,
  maybeAutoCompactConversation,
  resolveModelContextWindowTokens,
} from '../src/state/compaction-auto';
import {
  compactConversation,
  fetchConversationCompaction,
} from '../src/providers/daemon';

const fetchMock = vi.mocked(fetchConversationCompaction);
const compactMock = vi.mocked(compactConversation);

const config = {
  enabled: true,
  dryRun: false,
  ratio: 0.75,
  minMessages: 8,
};

function msg(id: string, content: string): ChatMessage {
  return { id, role: 'user', content } as ChatMessage;
}

function checkpoint(cutAtMessageId: string): ChatConversationCompaction {
  return {
    conversationId: 'conversation-1',
    cutAtMessageId,
    summaryText: 'earlier turns summarized',
    ledger: [],
  } as ChatConversationCompaction;
}

describe('estimateTextTokens', () => {
  it('counts ascii as a quarter token and non-ascii as one', () => {
    expect(estimateTextTokens('abcd')).toBe(1);
    expect(estimateTextTokens('中文')).toBe(2);
    expect(estimateTextTokens('abcd中文')).toBe(3);
    expect(estimateTextTokens('')).toBe(0);
  });
});

describe('resolveModelContextWindowTokens', () => {
  it('resolves antigravity labels', () => {
    expect(resolveModelContextWindowTokens('antigravity', 'default')).toBe(1_000_000);
    expect(resolveModelContextWindowTokens('antigravity', 'Gemini 3.5 Flash (Low)')).toBe(
      1_000_000,
    );
    expect(resolveModelContextWindowTokens('antigravity', 'Claude Sonnet 4.6 (Thinking)')).toBe(
      200_000,
    );
    expect(resolveModelContextWindowTokens('antigravity', 'GPT-OSS 120B (Medium)')).toBe(128_000);
  });

  it('resolves BYOK model ids from the LiteLLM catalog', () => {
    // Exact id, provider-prefixed id (stripped), and dotted provider id.
    expect(resolveModelContextWindowTokens('openai-api', 'openai/gpt-5.2')).toBe(272_000);
    expect(resolveModelContextWindowTokens('anthropic-api', 'claude-sonnet-4-6')).toBe(1_000_000);
    expect(resolveModelContextWindowTokens('anthropic-api', 'anthropic.claude-sonnet-4-6')).toBe(
      1_000_000,
    );
    expect(resolveModelContextWindowTokens('google-gemini-api', 'gemini-3.1-pro-preview')).toBe(
      1_048_576,
    );
    // Normalized suffix match against provider variants (azure_ai/kimi-k2.6, …).
    expect(resolveModelContextWindowTokens('azure-openai-api', 'kimi-k2.6')).toBe(262_144);
    // Suffix hit through `google/gemini-3-flash` (no bare catalog key).
    expect(resolveModelContextWindowTokens('google-gemini-api', 'gemini-3-flash')).toBe(1_048_576);
    // Ids the catalog does not track fall through to the prefix table.
    expect(resolveModelContextWindowTokens('google-gemini-api', 'gemini-9-future')).toBe(1_000_000);
    // Provider-prefixed gateway ids resolve through the bare model id: the
    // catalog tracks the whole DeepSeek v4 line at 1M behind other providers.
    expect(resolveModelContextWindowTokens('deepseek-harness', 'xdf/deepseek-v4.1-flash')).toBe(
      1_048_576,
    );
    expect(resolveModelContextWindowTokens('deepseek-harness', 'xdf/deepseek-v4-flash')).toBe(
      1_000_000,
    );
    expect(resolveModelContextWindowTokens('deepseek-harness', 'xdf/deepseek-v4-pro')).toBe(
      1_000_000,
    );
  });

  it('falls back for unknown ids', () => {
    expect(resolveModelContextWindowTokens('openai-api', 'some-mystery-model')).toBe(
      AUTO_COMPACTION_FALLBACK_WINDOW_TOKENS,
    );
    // Prefix fallback still applies for self-hosted / untracked families.
    expect(resolveModelContextWindowTokens('openai-api', 'my-fake-llama-99b')).toBe(128_000);
    expect(resolveModelContextWindowTokens('openai-api', null)).toBe(
      AUTO_COMPACTION_FALLBACK_WINDOW_TOKENS,
    );
  });
});

describe('computeAutoCompactionDecision', () => {
  const history = Array.from({ length: 12 }, (_, i) => msg(`m${i}`, `hello ${i}`));

  it('skips when disabled', () => {
    const decision = computeAutoCompactionDecision({
      agentId: 'openai-api',
      model: 'openai/gpt-5.2',
      history,
      checkpoint: null,
      config: { ...config, enabled: false },
    });
    expect(decision.shouldCompact).toBe(false);
    expect(decision.reason).toBe('disabled');
  });

  it('skips ineligible agents', () => {
    const decision = computeAutoCompactionDecision({
      agentId: 'amr',
      model: null,
      history,
      checkpoint: null,
      config,
    });
    expect(decision.reason).toBe('ineligible-agent');
  });

  it('skips when the post-checkpoint span has too few messages', () => {
    const decision = computeAutoCompactionDecision({
      agentId: 'openai-api',
      model: 'openai/gpt-5.2',
      history,
      checkpoint: checkpoint('m7'),
      config,
    });
    expect(decision.reason).toBe('too-few-messages');
    expect(decision.span.map((m) => m.id)).toEqual(['m8', 'm9', 'm10', 'm11']);
  });

  it('skips below the threshold', () => {
    const decision = computeAutoCompactionDecision({
      agentId: 'openai-api',
      model: 'openai/gpt-5.2',
      history,
      checkpoint: null,
      config,
    });
    expect(decision.reason).toBe('below-threshold');
    expect(decision.thresholdTokens).toBe(204_000);
  });

  it('arms when the estimated transcript crosses the threshold', () => {
    const big = [
      ...Array.from({ length: 7 }, (_, i) => msg(`a${i}`, 'x'.repeat(1000))),
      msg('big', '中'.repeat(131_100)),
    ];
    const decision = computeAutoCompactionDecision({
      agentId: 'antigravity',
      model: 'GPT-OSS 120B (Medium)',
      history: big,
      checkpoint: null,
      config: { ...config, ratio: 1 },
    });
    expect(decision.shouldCompact).toBe(true);
    expect(decision.reason).toBe('eligible-threshold');
    expect(decision.estimatedTokens).toBeGreaterThan(decision.thresholdTokens);
  });

  it('skips when the checkpoint lookup failed', () => {
    const decision = computeAutoCompactionDecision({
      agentId: 'openai-api',
      model: 'openai/gpt-5.2',
      history,
      checkpoint: null,
      checkpointUnavailable: true,
      config,
    });
    expect(decision.reason).toBe('checkpoint-fetch-failed');
  });
});

describe('maybeAutoCompactConversation', () => {
  const base = {
    projectId: 'project-1',
    conversationId: 'conversation-1',
    agentId: 'openai-api',
    model: 'openai/gpt-5.2',
    history: [] as ChatMessage[],
  };

  beforeEach(() => {
    fetchMock.mockReset();
    compactMock.mockReset();
  });

  it('does not compact below the threshold', async () => {
    fetchMock.mockResolvedValue(null);
    const outcome = await maybeAutoCompactConversation({
      ...base,
      history: Array.from({ length: 10 }, (_, i) => msg(`m${i}`, 'short')),
    });
    expect(outcome.compacted).toBe(false);
    expect(outcome.decision.reason).toBe('below-threshold');
    expect(compactMock).not.toHaveBeenCalled();
  });

  it('compacts when armed', async () => {
    fetchMock.mockResolvedValue(null);
    compactMock.mockResolvedValue(checkpoint('m5'));
    const history = [
      ...Array.from({ length: 7 }, (_, i) => msg(`a${i}`, 'x'.repeat(1000))),
      msg('big', '中'.repeat(131_100)),
    ];
    const outcome = await maybeAutoCompactConversation({
      ...base,
      agentId: 'antigravity',
      model: 'GPT-OSS 120B (Medium)',
      history,
    });
    expect(outcome.compacted).toBe(true);
    expect(outcome.dryRun).toBe(false);
    expect(outcome.checkpoint?.cutAtMessageId).toBe('m5');
    expect(compactMock).toHaveBeenCalledWith(
      'project-1',
      'conversation-1',
      expect.objectContaining({ workspaceContext: undefined }),
    );
  });

  it('dry-run decides without invoking the daemon', async () => {
    const oldRatio = process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_RATIO;
    const oldDryRun = process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_DRY_RUN;
    process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_DRY_RUN = '1';
    process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_RATIO = '0.1';
    try {
      fetchMock.mockResolvedValue(null);
      const history = [
        ...Array.from({ length: 7 }, (_, i) => msg(`a${i}`, 'x'.repeat(1000))),
        msg('big', '中'.repeat(20_000)),
      ];
      const outcome = await maybeAutoCompactConversation({
        ...base,
        agentId: 'antigravity',
        model: 'GPT-OSS 120B (Medium)',
        history,
      });
      expect(outcome.compacted).toBe(false);
      expect(outcome.dryRun).toBe(true);
      expect(outcome.decision.shouldCompact).toBe(true);
      expect(compactMock).not.toHaveBeenCalled();
    } finally {
      if (oldRatio === undefined) delete process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_RATIO;
      else process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_RATIO = oldRatio;
      if (oldDryRun === undefined) delete process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_DRY_RUN;
      else process.env.NEXT_PUBLIC_OD_COMPACTION_AUTO_DRY_RUN = oldDryRun;
    }
  });

  it('skips quietly when the checkpoint fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const outcome = await maybeAutoCompactConversation({
      ...base,
      history: Array.from({ length: 10 }, (_, i) => msg(`m${i}`, 'short')),
    });
    expect(outcome.compacted).toBe(false);
    expect(outcome.decision.reason).toBe('checkpoint-fetch-failed');
    expect(compactMock).not.toHaveBeenCalled();
  });

  it('propagates compaction failures to the caller', async () => {
    fetchMock.mockResolvedValue(null);
    compactMock.mockRejectedValue(new Error('HTTP 409'));
    const history = [
      ...Array.from({ length: 7 }, (_, i) => msg(`a${i}`, 'x'.repeat(1000))),
      msg('big', '中'.repeat(131_100)),
    ];
    await expect(
      maybeAutoCompactConversation({
        ...base,
        agentId: 'antigravity',
        model: 'GPT-OSS 120B (Medium)',
        history,
      }),
    ).rejects.toThrow('HTTP 409');
  });
});
