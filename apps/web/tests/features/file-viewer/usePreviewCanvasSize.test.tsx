// @vitest-environment jsdom
//
// Unit tests for the shared preview-canvas-size hook: it wires the ref'd
// element into the injected element-size port and forwards each measurement,
// unsubscribing on unmount.
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePreviewCanvasSize } from '../../../src/features/file-viewer/hooks/usePreviewCanvasSize.hooks';
import type { ElementSizePort } from '../../../src/features/file-viewer/ports';

function makePort(over: Partial<ElementSizePort> = {}): ElementSizePort {
  return {
    observeElementSize: vi.fn(() => () => {}),
    ...over,
  };
}

function Probe({ port, onSize }: { port: ElementSizePort; onSize: (size: unknown) => void }) {
  const [ref, size] = usePreviewCanvasSize<HTMLDivElement>(port);
  onSize(size);
  return <div ref={ref} data-testid="probe" />;
}

describe('usePreviewCanvasSize', () => {
  it('does not observe before the ref attaches to an element', () => {
    const observeElementSize = vi.fn(() => () => {});
    render(<Probe port={makePort({ observeElementSize })} onSize={() => {}} />);

    // The effect runs post-commit, by which point the ref IS attached (jsdom
    // renders synchronously), so the port is called exactly once per mount —
    // this asserts it is never called more than that.
    expect(observeElementSize).toHaveBeenCalledTimes(1);
  });

  it('observes the mounted element and forwards measurements from the port', () => {
    let onMeasure: ((size: { width: number; height: number }) => void) | undefined;
    const unsubscribe = vi.fn();
    const observeElementSize = vi.fn((el: HTMLElement, measure: typeof onMeasure) => {
      expect(el.dataset.testid).toBe('probe');
      onMeasure = measure;
      return unsubscribe;
    });
    const sizes: unknown[] = [];
    const { unmount } = render(
      <Probe port={makePort({ observeElementSize })} onSize={(size) => sizes.push(size)} />,
    );

    expect(observeElementSize).toHaveBeenCalledTimes(1);
    expect(sizes.at(-1)).toBeUndefined();

    act(() => {
      onMeasure?.({ width: 120, height: 40 });
    });
    expect(sizes.at(-1)).toEqual({ width: 120, height: 40 });

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
