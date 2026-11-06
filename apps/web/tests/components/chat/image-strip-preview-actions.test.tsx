// @vitest-environment jsdom
/**
 * OPEND-2945 / PR #8013 scrollbar follow-up: preserve real execution-record
 * previews and their actions while fixing the completed strip's scrollport.
 * These are behavior controls, not scrollbar geometry tests: jsdom has no
 * native scrollbar. The macOS Electron overlap is recorded in the PR review;
 * the frozen browser probe checks the actual 26×34px previews and scrollbar.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';
import type { PersistedAgentEvent } from '@open-design/contracts';

afterEach(cleanup);

function completedShell(count: number): ShellData {
  const events: PersistedAgentEvent[] = [
    {
      kind: 'tool_use', id: 'batch', name: 'Bash', startedAt: 0,
      input: { command: Array.from({ length: count }, (_, i) => `od media generate image-${i + 1}`).join(' && ') },
    },
    {
      kind: 'tool_result', toolUseId: 'batch', isError: false, completedAt: 3000,
      content: Array.from({ length: count }, (_, i) => JSON.stringify({
        status: 'succeeded', path: `image-${i + 1}.png`,
      })).join('\n'),
    },
  ];
  const shell = buildTurnBlocks({ events, runStatus: 'succeeded' })
    .find((block): block is ShellData => block.kind === 'shell');
  if (!shell) throw new Error('Expected media batch execution record');
  return shell;
}

describe('completed media strip preview actions', () => {
  it.each([2, 16])('preserves all %i previews and first/middle/last open actions', (count) => {
    const onOpenImage = vi.fn();
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <ExecutionShell
          shell={completedShell(count)}
          onOpenFile={onOpenImage}
          imageSrc={(path) => `/previews/${path}`}
          runTerminal
          deferCollapsedBodies={false}
        />
      </I18nProvider>,
    );
    const previews = screen.getAllByRole('button', { name: /查看第 \d+ 张大图/, hidden: true });
    expect(previews).toHaveLength(count);
    expect(Array.from(container.querySelectorAll('img'), (img) => img.getAttribute('src')))
      .toEqual(Array.from({ length: count }, (_, i) => `/previews/image-${i + 1}.png`));
    for (const index of new Set([0, Math.floor(count / 2), count - 1])) {
      fireEvent.click(previews[index]!);
      expect(onOpenImage).toHaveBeenLastCalledWith(`image-${index + 1}.png`);
    }
    expect(onOpenImage).toHaveBeenCalledTimes(new Set([0, Math.floor(count / 2), count - 1]).size);
  });
});
