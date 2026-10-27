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
  it('draws nothing in the lead slot for finished work', () => {
    // OPEND-3133: a finished run keeps the folder and reports through the
    // unread dot at the row's end (ProjectCompletionDot), never a ✓ here.
    expect(shapeOf('succeeded').kind).toBe('none');
    expect(hasRunStatusGlyph('succeeded')).toBe(false);
    expect(hasCompletionNotice('succeeded')).toBe(true);
  });

  it('reports a completion notice for finished work only', () => {
    const others: ProjectDisplayStatus[] = [
      'not_started', 'queued', 'running', 'awaiting_input', 'incomplete', 'failed', 'canceled',
    ];
    for (const status of others) expect(hasCompletionNotice(status), status).toBe(false);
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
    'draws %s as the interrupted badge, not the orb',
    (status) => {
      // A stopped run must not spin: the rotation is what says "working".
      const result = shapeOf(status);
      expect(result.kind).toBe('badge');
      expect(result.root!.querySelector('path')?.getAttribute('fill')).toBe('#F34801');
      // The glyph is a knockout, so it needs the dark plate behind it.
      expect(result.root!.querySelector('rect')?.getAttribute('fill')).toBe('#121212');
    },
  );

  it('gives every interrupted status the identical mark', () => {
    // One mark for all three; the reason is carried by the status text.
    const marks = (['failed', 'canceled', 'incomplete'] as const).map(
      (status) => (shapeOf(status) as { root: Element }).root.innerHTML,
    );
    expect(new Set(marks).size).toBe(1);
  });

  it('turns the attention orb at running speed', () => {
    // A pending question is a live run, not a stalled one. Only `queued` may
    // turn slowly, and only because it has not started.
    const speedOf = (status: ProjectDisplayStatus) => {
      const { root } = shapeOf(status) as { root: HTMLElement };
      return root.className
        .split(' ')
        .find((c) => c.includes('isThinking') || c.includes('isIdle'));
    };

    expect(speedOf('awaiting_input')).toBe(speedOf('running'));
    expect(speedOf('queued')).not.toBe(speedOf('running'));
  });

  it('leaves running and queued on the default green', () => {
    // Same family, same colour — only the speed differs, so neither may set a
    // palette override.
    for (const status of ['running', 'queued'] as const) {
      const { root } = shapeOf(status) as { root: HTMLElement };
      expect(root.style.getPropertyValue('--c1')).toBe('');
    }
  });

  it('recolours the orb for the state that needs attention', () => {
    const attention = (shapeOf('awaiting_input') as { root: HTMLElement }).root;

    expect(attention.style.getPropertyValue('--c1')).toBe('#FF8D02');
  });

  it('renders the attention orb literally', () => {
    // Without this the orb edits the colour it is given: three slots still
    // hold green, and the highlight/saturation/texture passes push a
    // mid-channel accent off its hue.
    const { root } = shapeOf('awaiting_input') as { root: HTMLElement };
    expect(root.className).toContain('isLiteral');
    // `contrast()` is one of those passes and is set inline, so a class rule
    // cannot neutralise it — the component has to.
    expect(root.style.getPropertyValue('--contrast')).toBe('1');
  });

  it('moves the second accent with the first', () => {
    // `--c2` is the other accent AND the glow. Left on the stock spring-green
    // it blends with an orange `--c1` into a muddy red-green dot, which is
    // exactly what the first pass shipped.
    const { root } = shapeOf('awaiting_input') as { root: HTMLElement };
    const c2 = root.style.getPropertyValue('--c2');
    expect(c2).not.toBe('');
    expect(c2.toLowerCase()).not.toBe('#00ffae');
    // Amber to the accent's orange: a second hue, but the warm neighbour of
    // the first, the way the stock green/spring-green pair is.
    expect(c2).toBe('#EDC337');
    // Gold in the glint slot. `literal` strips the white highlights, so the
    // orb has no lit side at all unless one is named here.
    expect(root.style.getPropertyValue('--c5')).toBe('#FFC400');
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

    const badge = render(<ProjectRunStatusIcon status="failed" size={14} />)
      .container.firstElementChild;
    expect(badge?.getAttribute('width')).toBe('14');
    expect(badge?.getAttribute('height')).toBe('14');
  });
});
