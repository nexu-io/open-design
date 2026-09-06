// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IframeKeepAliveProvider,
  PooledIframe,
  previewIframeKeepAliveKey,
  useIframeKeepAlivePool,
} from '../../src/components/IframeKeepAlivePool';

afterEach(cleanup);

describe('PooledIframe', () => {
  it('uses an atomic DOM move when parking and reattaching a loaded frame', () => {
    const elementPrototype = Element.prototype as Element & {
      moveBefore?: (node: Node, child: Node | null) => void;
    };
    const originalMoveBefore = elementPrototype.moveBefore;
    const moveBefore = vi.fn(function moveBeforePolyfill(
      this: Element,
      node: Node,
      child: Node | null,
    ) {
      this.insertBefore(node, child);
    });
    Object.defineProperty(Element.prototype, 'moveBefore', {
      configurable: true,
      value: moveBefore,
      writable: true,
    });

    function Harness({ shown }: { shown: boolean }) {
      return (
        <IframeKeepAliveProvider>
          {shown ? (
            <PooledIframe
              cacheKey={previewIframeKeepAliveKey('project-1', 'index.html')}
              src="http://n-scope-0001.localhost:17456/index.html"
              title="index.html"
              data-testid="pooled-frame"
            />
          ) : null}
        </IframeKeepAliveProvider>
      );
    }

    try {
      const { container, rerender } = render(<Harness shown />);
      const frame = screen.getByTestId('pooled-frame');
      const src = frame.getAttribute('src');

      rerender(<Harness shown={false} />);
      expect(moveBefore).toHaveBeenNthCalledWith(1, frame, null);
      expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBe(frame);
      expect(frame.getAttribute('src')).toBe(src);

      rerender(<Harness shown />);
      expect(screen.getByTestId('pooled-frame')).toBe(frame);
      expect(moveBefore).toHaveBeenNthCalledWith(2, frame, null);
      expect(frame.getAttribute('src')).toBe(src);
    } finally {
      if (originalMoveBefore) {
        Object.defineProperty(Element.prototype, 'moveBefore', {
          configurable: true,
          value: originalMoveBefore,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(Element.prototype, 'moveBefore');
      }
    }
  });

  it('updates a forwarded ref without parking or reattaching the browsing context', () => {
    const firstRef = vi.fn();
    const secondRef = vi.fn();
    function Harness({ second }: { second: boolean }) {
      return (
        <IframeKeepAliveProvider>
          <PooledIframe
            ref={second ? secondRef : firstRef}
            cacheKey={previewIframeKeepAliveKey('project-1', 'index.html')}
            src="http://n-scope-0001.localhost:17456/index.html"
            title="index.html"
            data-testid="pooled-frame"
          />
        </IframeKeepAliveProvider>
      );
    }

    const { container, rerender } = render(<Harness second={false} />);
    const frame = screen.getByTestId('pooled-frame');
    const parkedHost = container.querySelector('.iframe-keep-alive-pool');
    if (!parkedHost) throw new Error('missing iframe pool host');
    const appendChild = vi.spyOn(parkedHost, 'appendChild');

    rerender(<Harness second />);

    expect(screen.getByTestId('pooled-frame')).toBe(frame);
    expect(appendChild).not.toHaveBeenCalledWith(frame);
    expect(firstRef).toHaveBeenLastCalledWith(null);
    expect(secondRef).toHaveBeenLastCalledWith(frame);
  });

  it('blurs a focused frame before parking its live browsing context', () => {
    function Harness({ shown }: { shown: boolean }) {
      return (
        <IframeKeepAliveProvider>
          {shown ? (
            <PooledIframe
              cacheKey={previewIframeKeepAliveKey('project-1', 'index.html')}
              src="http://n-scope-0001.localhost:17456/index.html"
              title="index.html"
              data-testid="pooled-frame"
            />
          ) : null}
        </IframeKeepAliveProvider>
      );
    }

    const { rerender } = render(<Harness shown />);
    const frame = screen.getByTestId('pooled-frame') as HTMLIFrameElement;
    frame.focus();
    expect(document.activeElement).toBe(frame);
    const blur = vi.spyOn(frame, 'blur');

    rerender(<Harness shown={false} />);

    expect(blur).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(frame);
  });

  it('blurs a focused retained frame when it becomes inactive without parking', () => {
    function Harness({ active }: { active: boolean }) {
      return (
        <IframeKeepAliveProvider>
          <PooledIframe
            cacheKey={previewIframeKeepAliveKey('project-1', 'index.html')}
            src="http://n-scope-0001.localhost:17456/index.html"
            title="index.html"
            data-testid="pooled-frame"
            data-od-active={active ? 'true' : 'false'}
            aria-hidden={active ? undefined : 'true'}
            tabIndex={active ? 0 : -1}
          />
        </IframeKeepAliveProvider>
      );
    }

    const { rerender } = render(<Harness active />);
    const frame = screen.getByTestId('pooled-frame') as HTMLIFrameElement;
    frame.focus();
    expect(document.activeElement).toBe(frame);
    const blur = vi.spyOn(frame, 'blur');

    rerender(<Harness active={false} />);

    expect(screen.getByTestId('pooled-frame')).toBe(frame);
    expect(blur).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(frame);
  });

  it('evicts the least-recently-used suspended file frame at the retention limit', () => {
    function Harness({ fileName }: { fileName: string }) {
      return (
        <IframeKeepAliveProvider maxEntries={2}>
          <PooledIframe
            cacheKey={previewIframeKeepAliveKey('project-1', fileName)}
            src={`http://n-scope-0001.localhost:17456/${fileName}`}
            title={fileName}
            data-testid="pooled-frame"
          />
        </IframeKeepAliveProvider>
      );
    }

    const { rerender } = render(<Harness fileName="a.html" />);
    const frameA = screen.getByTestId('pooled-frame');
    rerender(<Harness fileName="b.html" />);
    const frameB = screen.getByTestId('pooled-frame');
    expect(frameB).not.toBe(frameA);

    // Touch A again so B becomes the least-recently-used suspended session.
    rerender(<Harness fileName="a.html" />);
    expect(screen.getByTestId('pooled-frame')).toBe(frameA);
    rerender(<Harness fileName="c.html" />);
    const frameC = screen.getByTestId('pooled-frame');
    expect(frameC).not.toBe(frameA);
    expect(frameC).not.toBe(frameB);
    expect(frameB.isConnected).toBe(false);

    rerender(<Harness fileName="b.html" />);
    expect(screen.getByTestId('pooled-frame')).not.toBe(frameB);
  });

  it('matches a versioned runtime frame by its logical file name during eviction', () => {
    const runtimeKey = `${previewIframeKeepAliveKey('project-1', 'index.html')}\0scope-0001\0v1`;
    function PoolContents({ shown }: { shown: boolean }) {
      const pool = useIframeKeepAlivePool();
      return (
        <>
          <button
            type="button"
            onClick={() => pool.evictMatching((entry) => (
              entry.projectId === 'project-1' && entry.fileName === 'index.html'
            ))}
          >
            evict index
          </button>
          {shown ? (
            <PooledIframe
              cacheKey={runtimeKey}
              src="http://n-scope-0001.localhost:17456/index.html"
              title="index.html"
              data-testid="pooled-frame"
            />
          ) : null}
        </>
      );
    }
    const view = (shown: boolean) => (
      <IframeKeepAliveProvider>
        <PoolContents shown={shown} />
      </IframeKeepAliveProvider>
    );

    const { container, rerender } = render(view(true));
    const frame = screen.getByTestId('pooled-frame');
    rerender(view(false));
    expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBe(frame);

    fireEvent.click(screen.getByRole('button', { name: 'evict index' }));

    expect(frame.isConnected).toBe(false);
    expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBeNull();
  });
});
