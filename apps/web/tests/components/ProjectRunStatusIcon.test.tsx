// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectDisplayStatus } from '@open-design/contracts';

import {
  hasCompletionNotice,
  hasRunStatusGlyph,
  ProjectCompletionDot,
  ProjectFolderGlyph,
  ProjectRunStatusIcon,
} from '../../src/components/ProjectRunStatusIcon';

afterEach(cleanup);

/** The orb is a span tree; the badges are svg. */
function shapeOf(status: ProjectDisplayStatus) {
  const { container } = render(<ProjectRunStatusIcon status={status} />);
  const root = container.firstElementChild;
  if (!root) return { kind: 'none' as const };
  if (root.tagName.toLowerCase() === 'svg') return { kind: 'badge' as const, root };
  return { kind: 'orb' as const, root: root as HTMLElement };
}

describe('ProjectRunStatusIcon', () => {
  // P0-24 设计答复(2026-10-26):有新结果「也改成蓝色球,无标签」,失败「用新的红色球,
  // 不用红色感叹号」;研发负责人要求四颗球与设计稿完全一致,所以两颗都按设计稿约 6 秒一圈。
  it('draws an unopened finished run as the turning blue ball in the lead slot', () => {
    const result = shapeOf('succeeded');
    expect(result.kind).toBe('orb');
    expect((result as { root: HTMLElement }).root.style.getPropertyValue('--c1')).toBe('#578EFF');
    expect((result as { root: HTMLElement }).root.className).toContain('isThinking');
    expect((result as { root: HTMLElement }).root.className).toContain('isLiteral');
    expect(hasRunStatusGlyph('succeeded')).toBe(true);
  });

  it('never reports a row-end completion notice any more', () => {
    const all: ProjectDisplayStatus[] = [
      'not_started', 'queued', 'running', 'awaiting_input', 'incomplete', 'failed', 'canceled', 'succeeded',
    ];
    for (const status of all) expect(hasCompletionNotice(status), status).toBe(false);
    expect(hasCompletionNotice(undefined)).toBe(false);
  });

  it('draws the folder for a project with nothing live to report', () => {
    const { container } = render(<ProjectFolderGlyph size={16} />);
    const glyph = container.firstElementChild;
    expect(glyph?.getAttribute('data-testid')).toBe('project-folder-glyph');
    expect(glyph?.getAttribute('width')).toBe('16');
  });

  it('announces the completion dot as the finished status', () => {
    const { container } = render(
      <ProjectCompletionDot className="dot" label="Completed" testId="dot" />,
    );
    const dot = container.firstElementChild;
    expect(dot?.getAttribute('role')).toBe('img');
    expect(dot?.getAttribute('aria-label')).toBe('Completed');
    expect(dot?.className).toBe('dot');
  });

  it.each<[ProjectDisplayStatus]>([['running'], ['queued'], ['awaiting_input']])(
    'draws %s as the orb',
    (status) => {
      expect(shapeOf(status).kind).toBe('orb');
    },
  );

  it.each<[ProjectDisplayStatus]>([['failed'], ['canceled'], ['incomplete']])(
    'draws %s as the design draft\'s red ball',
    (status) => {
      // The draft's `.entry-nav-rail__failed-orb` turns at 6s like the others
      // (overrides PRD rule ① "失败静止", decided 2026-10-26).
      const result = shapeOf(status) as { kind: string; root: HTMLElement };
      expect(result.kind).toBe('orb');
      expect(result.root.style.getPropertyValue('--c1')).toBe('#F34801');
      expect(result.root.style.getPropertyValue('--c2')).toBe('#FF6038');
      expect(result.root.style.getPropertyValue('--c5')).toBe('#FFE6DF');
      expect(result.root.className).toContain('isThinking');
      expect(result.root.className).toContain('isBlurOnly');
      expect(result.root.className).not.toContain('isLiteral');
    },
  );

  it('gives every interrupted status the identical mark', () => {
    // One mark for all three; the reason is carried by the status text.
    const marks = (['failed', 'canceled', 'incomplete'] as const).map(
      (status) => (shapeOf(status) as { root: Element }).root.outerHTML,
    );
    expect(new Set(marks).size).toBe(1);
  });

  it('turns each orb at the design draft\'s pace', () => {
    // Draft: green / blue / red turn every 6s, the orange wedge every 20s.
    const speedOf = (status: ProjectDisplayStatus) => {
      const { root } = shapeOf(status) as { root: HTMLElement };
      return root.className
        .split(' ')
        .find((c) => c.includes('isThinking') || c.includes('isIdle'));
    };

    expect(speedOf('queued')).toBe(speedOf('running'));
    expect(speedOf('succeeded')).toBe(speedOf('running'));
    expect(speedOf('failed')).toBe(speedOf('running'));
    expect(speedOf('awaiting_input')).toContain('isIdle');
  });

  it('keeps every sidebar orb from breathing or scaling', () => {
    const all: ProjectDisplayStatus[] = [
      'queued', 'running', 'awaiting_input', 'incomplete', 'failed', 'canceled', 'succeeded',
    ];
    for (const status of all) {
      const { root } = shapeOf(status) as { root: HTMLElement };
      expect(root.className, status).toContain('isSteady');
    }
  });

  it('leaves running and queued on the default green', () => {
    // Same family, same colour and speed, so neither may set a palette override.
    for (const status of ['running', 'queued'] as const) {
      const { root } = shapeOf(status) as { root: HTMLElement };
      expect(root.style.getPropertyValue('--c1')).toBe('');
    }
  });

  it('recolours the orb for the state that needs attention', () => {
    const attention = (shapeOf('awaiting_input') as { root: HTMLElement }).root;

    expect(attention.style.getPropertyValue('--c1')).toBe('#FF8D02');
  });

  it('draws the attention orb as the draft\'s flat orange wedge', () => {
    const { root } = shapeOf('awaiting_input') as { root: HTMLElement };
    expect(root.className).toContain('isWedge');
    expect(root.className).not.toContain('isLiteral');
    for (const slot of ['--c1', '--c2', '--c5', '--fill']) {
      expect(root.style.getPropertyValue(slot), slot).toBe('#FF8D02');
    }
  });

  it('renders nothing for the status with nothing to say', () => {
    // The caller reserves the slot; this must not fill it with a placeholder.
    expect(shapeOf('not_started').kind).toBe('none');
    expect(hasRunStatusGlyph('not_started')).toBe(false);
    expect(hasRunStatusGlyph(undefined)).toBe(false);
  });

  it('is decorative unless given a label', () => {
    const bare = render(<ProjectRunStatusIcon status="running" />).container.firstElementChild;
    expect(bare?.getAttribute('aria-hidden')).toBe('true');
    cleanup();

    const labelled = render(
      <ProjectRunStatusIcon status="running" label="Running" />,
    ).container.firstElementChild;
    expect(labelled?.getAttribute('role')).toBe('img');
    expect(labelled?.getAttribute('aria-label')).toBe('Running');
  });

  it('sizes both shapes from the same prop', () => {
    const orb = render(<ProjectRunStatusIcon status="running" size={14} />)
      .container.firstElementChild as HTMLElement;
    expect(orb.style.getPropertyValue('--size')).toBe('14px');
    cleanup();

    const failed = render(<ProjectRunStatusIcon status="failed" size={14} />)
      .container.firstElementChild as HTMLElement;
    expect(failed.style.getPropertyValue('--size')).toBe('14px');
  });
});
