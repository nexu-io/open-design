// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectDisplayStatus } from '@open-design/contracts';

import { ProjectRunStatusIcon } from '../../src/components/ProjectRunStatusIcon';

afterEach(cleanup);

/** The orb is a span tree; the succeeded badge is an svg. */
function shapeOf(status: ProjectDisplayStatus) {
  const { container } = render(<ProjectRunStatusIcon status={status} />);
  const root = container.firstElementChild;
  if (!root) return { kind: 'none' as const };
  if (root.tagName.toLowerCase() === 'svg') return { kind: 'badge' as const, root };
  return { kind: 'orb' as const, root: root as HTMLElement };
}

describe('ProjectRunStatusIcon', () => {
  it('draws finished work as the static badge, not the orb', () => {
    const result = shapeOf('succeeded');
    expect(result.kind).toBe('badge');
    // The two hardcoded fills are the whole point of it not going through Icon.
    const fills = [...result.root!.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills).toEqual(['#202020', '#00FF08']);
  });

  it.each<[ProjectDisplayStatus]>([['running'], ['queued'], ['awaiting_input'], ['incomplete'], ['failed']])(
    'draws %s as the orb',
    (status) => {
      expect(shapeOf(status).kind).toBe('orb');
    },
  );

  it('leaves running and queued on the default green', () => {
    // Same family, same colour — only the speed differs, so neither may set a
    // palette override.
    for (const status of ['running', 'queued'] as const) {
      const { root } = shapeOf(status) as { root: HTMLElement };
      expect(root.style.getPropertyValue('--c1')).toBe('');
    }
  });

  it('recolours the orb per the states that need attention', () => {
    const attention = (shapeOf('awaiting_input') as { root: HTMLElement }).root;
    const incomplete = (shapeOf('incomplete') as { root: HTMLElement }).root;
    const failed = (shapeOf('failed') as { root: HTMLElement }).root;

    expect(attention.style.getPropertyValue('--c1')).toBe('#EDC337');
    expect(incomplete.style.getPropertyValue('--c1')).toBe('#EDC337');
    expect(failed.style.getPropertyValue('--c1')).toBe('#F8672F');
  });

  it('moves the second accent with the first', () => {
    // `--c2` is the other accent AND the glow. Left on the stock spring-green
    // it blends with an orange `--c1` into a muddy red-green dot, which is
    // exactly what the first pass shipped.
    for (const status of ['awaiting_input', 'incomplete', 'failed'] as const) {
      const { root } = shapeOf(status) as { root: HTMLElement };
      const c2 = root.style.getPropertyValue('--c2');
      expect(c2).not.toBe('');
      expect(c2.toLowerCase()).not.toBe('#00ffae');
    }
  });

  it('renders nothing for the statuses with nothing to say', () => {
    // The caller reserves the slot; this must not fill it with a placeholder.
    expect(shapeOf('not_started').kind).toBe('none');
    expect(shapeOf('canceled').kind).toBe('none');
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

    const badge = render(<ProjectRunStatusIcon status="succeeded" size={14} />)
      .container.firstElementChild;
    expect(badge?.getAttribute('width')).toBe('14');
    expect(badge?.getAttribute('height')).toBe('14');
  });
});
