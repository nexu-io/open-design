// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CommentCanvasTarget } from '../../src/components/CommentCanvasTarget';
import type { PreviewCommentSnapshot } from '../../src/comments/anchor';
afterEach(cleanup);
const snapshot: PreviewCommentSnapshot = { filePath: 'index.html', elementId: 'cmt:a', selector: '#a', label: 'Long element name 很长的元素名称', text: '', htmlHint: '', position: { x: 796, y: 4, width: 4, height: 4 } };
it('renders the name and full title independently from a real 4px edge box', () => {
  render(<CommentCanvasTarget snapshot={snapshot} scale={1} canvas={{ left: 0, top: 0, width: 800, height: 600 }} selected />);
  const box = screen.getByTestId('comment-target-overlay');
  expect(box.style.width).toBe('4px'); expect(box.style.height).toBe('4px'); expect(box.title).toBe(snapshot.label);
  const label = screen.getByText(snapshot.label);
  expect(label.title).toBe(snapshot.label); expect(label.style.transform).toBe('translate(-100%, 0)'); expect(label.style.left).toBe('792px');
});
it('clips scaled geometry once and omits a wholly offscreen selection', () => {
  const { rerender } = render(<CommentCanvasTarget snapshot={{ ...snapshot, position: { x: -4, y: 10, width: 8, height: 8 } }} scale={.5} canvas={{ left: 0, top: 0, width: 800, height: 600 }} />);
  expect(screen.getByTestId('comment-target-overlay').style.width).toBe('2px');
  rerender(<CommentCanvasTarget snapshot={{ ...snapshot, position: { x: 1700, y: 10, width: 8, height: 8 } }} scale={.5} canvas={{ left: 0, top: 0, width: 800, height: 600 }} />);
  expect(screen.queryByTestId('comment-target-overlay')).toBeNull();
});
