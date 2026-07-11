// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorIcon } from '../../../src/features/handoff/components/EditorIcon';

afterEach(cleanup);

describe('EditorIcon', () => {
  it('renders a known editor with its brand background', () => {
    const { container } = render(<EditorIcon editorId="vscode" size={20} />);
    const span = container.querySelector('.editor-icon') as HTMLElement;
    expect(span).toBeTruthy();
    expect(span.style.background).toBe('rgb(0, 122, 204)');
    expect(span.style.width).toBe('20px');
    expect(span.querySelector('svg')).toBeTruthy();
  });

  it('renders every catalogued editor id without throwing', () => {
    const ids = [
      'vscode', 'cursor', 'windsurf', 'zed', 'qoder', 'antigravity', 'webstorm',
      'idea', 'xcode', 'finder', 'explorer', 'file-manager', 'terminal', 'warp',
    ] as const;
    for (const id of ids) {
      const { container, unmount } = render(<EditorIcon editorId={id} />);
      expect(container.querySelector('.editor-icon svg')).toBeTruthy();
      unmount();
    }
  });

  it('renders the neutral folder fallback for an unrecognized id', () => {
    const { container } = render(<EditorIcon editorId="some-unknown-editor" size={16} />);
    const span = container.querySelector('.editor-icon') as HTMLElement;
    expect(span.style.background).toBe('rgb(156, 163, 175)');
    expect(span.querySelector('svg')).toBeTruthy();
  });

  it('defaults to size 16 when unset', () => {
    const { container } = render(<EditorIcon editorId="finder" />);
    const span = container.querySelector('.editor-icon') as HTMLElement;
    expect(span.style.width).toBe('16px');
  });
});
