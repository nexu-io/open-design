// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { DesignFilesEmptyState } from '../../src/components/design-files/DesignFilesEmptyState';
import type { RunProgressStep } from '../../src/runtime/run-progress';

// The particle field paints on a canvas and animates on rAF; neither adds
// anything to the text assertions below.
vi.mock('../../src/components/workspace/SpaceBackground', () => ({
  SpaceBackground: () => null,
}));

function step(
  id: string,
  category: RunProgressStep['category'],
  target: string | null,
  toolName = 'Tool',
): RunProgressStep {
  return { id, category, toolName, target, anchor: null };
}

function renderState(props: Parameters<typeof DesignFilesEmptyState>[0]) {
  return render(
    <I18nProvider initial="zh-CN">
      <DesignFilesEmptyState {...props} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('DesignFilesEmptyState', () => {
  it('names the current step instead of a static "thinking"', () => {
    renderState({
      running: true,
      steps: [step('2', 'edit', 'index.html'), step('1', 'read', 'site.css')],
    });

    expect(screen.getByText('编辑 index.html')).toBeTruthy();
    expect(screen.queryByText('思考中')).toBeNull();
  });

  // The steps read as a log now: oldest at the top, the step happening RIGHT
  // NOW on the bottom line. `runProgressSteps` still hands them over
  // newest-first — the ordering is presentation, and lives in the component.
  it('reads as a log: oldest first, the current step on the last line', () => {
    renderState({
      running: true,
      steps: [
        step('3', 'run', 'pnpm build'),
        step('2', 'edit', 'index.html'),
        step('1', 'read', 'site.css'),
      ],
    });

    const feed = screen.getByTestId('run-step-feed');
    expect([...feed.children].map((li) => li.textContent)).toEqual([
      'Bash pnpm build',
    ]);
    const current = [...feed.children].filter(
      (li) => li.getAttribute('data-current') === 'true',
    );
    expect(current.map((li) => li.textContent)).toEqual(['Bash pnpm build']);
  });

  // Before the first tool call the ring says what the CHAT footer is saying —
  // all running phases use the execution header’s single status label.
  it('names the run phase while the turn has called nothing yet', () => {
    renderState({ running: true, steps: [], phase: 'preparing' });
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.queryByTestId('design-files-empty-trail')).toBeNull();

    cleanup();
    renderState({ running: true, steps: [], phase: 'thinking' });
    expect(screen.getByText('进行中')).toBeTruthy();

    cleanup();
    renderState({ running: true, steps: [], phase: 'working' });
    expect(screen.getByText('进行中')).toBeTruthy();
  });

  // The ring reports the agent's work. The prompt the user just typed is
  // already in the chat column, and echoing it here both put user input inside
  // the circle and pushed the status line down a row.
  it('keeps the user\'s own prompt out of the ring, status on the first line', () => {
    renderState({ running: true, steps: [], phase: 'thinking' });

    const center = screen.getByTestId('design-files-empty-chat');
    expect(center.textContent).toBe('进行中');
  });

  // A turn that ended by ASKING is finished but not done: the run stopped
  // because it needs an answer, and the ring names what the wait is about
  // instead of going blank beside an open form in the chat column.
  // The chat column heads a dead run "运行失败"; the ring beside it used to go
  // blank, which reads as "nothing happened" rather than "it broke".
  it('names a failed run the way the chat card heads it', () => {
    renderState({ running: false, failure: 'failed' });

    expect(screen.getByTestId('design-files-empty-failure').textContent).toBe('运行失败');
  });

  it('names a canceled run with the chat\'s own word for it', () => {
    renderState({ running: false, failure: 'canceled' });

    expect(screen.getByTestId('design-files-empty-failure').textContent).toBe('已取消');
  });

  // The steps are what is happening NOW; a failure is how the last run ended.
  it('keeps the failure out of the ring while a new run is in flight', () => {
    renderState({ running: true, steps: [], phase: 'thinking', failure: 'failed' });

    expect(screen.queryByTestId('design-files-empty-failure')).toBeNull();
    expect(screen.getByText('进行中')).toBeTruthy();
  });

  // A turn that broke mid-ask stopped for the failure, not for the answer.
  it('puts the failure ahead of an open question', () => {
    renderState({ running: false, failure: 'failed', question: '开场三问' });

    expect(screen.getByTestId('design-files-empty-failure').textContent).toBe('运行失败');
    expect(screen.queryByTestId('design-files-empty-question')).toBeNull();
  });

  it('names the open question once the run is over', () => {
    renderState({ running: false, question: '开场三问——补齐真实故事的关键信息' });

    expect(screen.getByTestId('design-files-empty-question').textContent).toBe(
      '开场三问——补齐真实故事的关键信息',
    );
  });

  // While it works, the work is the news; the form is still on screen in the
  // chat column either way.
  it('keeps the steps in the ring while the run is still going', () => {
    renderState({
      running: true,
      steps: [step('1', 'edit', 'index.html')],
      question: '开场三问',
    });

    expect(screen.getByText('编辑 index.html')).toBeTruthy();
    expect(screen.queryByTestId('design-files-empty-question')).toBeNull();
  });

  // With no run in flight the ring is just the field turning. The copy that
  // used to rest in it ("designs will appear here") is not the agent doing
  // something, and inside the circle it read as a caption on the animation.
  it('says nothing at all once the run is over', () => {
    renderState({
      running: false,
      steps: [step('2', 'edit', 'index.html'), step('1', 'read', 'site.css')],
    });

    expect(screen.queryByTestId('design-files-empty-trail')).toBeNull();
    expect(screen.queryByText('生成的设计会出现在这里')).toBeNull();
    expect(screen.getByTestId('design-files-empty-chat').textContent).toBe('');
  });

  // Chat heads a tool it has no card for with the raw name (GenericCard), so
  // the ring does too — the two surfaces title one call the same way.
  it('names an unclassified tool by its own name, as Chat does', () => {
    renderState({ running: true, steps: [step('1', 'other', null, 'mcp__figma__export')] });

    expect(screen.getByText('mcp__figma__export')).toBeTruthy();
  });
});
