// @vitest-environment jsdom

// Red-spec for the shared HTML project-cover frame (Batch A §4.2).
//
// `HtmlProjectCoverFrame` (used by the DesignsTab grid) HEAD-probes its cover
// URL and mounts a preview iframe as soon as it mounts, regardless of whether
// the card is anywhere near the viewport. On a large grid that is one probe
// plus one document load per card, all at once. The contract under test: no
// cover network work starts until the card is near the viewport; once visible
// the probe runs and the iframe mounts.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/providers/registry', () => ({
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

import { HtmlProjectCoverFrame } from '../../src/components/project-cover';

type IORecord = {
  cb: IntersectionObserverCallback;
  elements: Set<Element>;
  observer: IntersectionObserver;
};

const ioRecords: IORecord[] = [];

class StubIntersectionObserver {
  private record: IORecord;

  constructor(cb: IntersectionObserverCallback) {
    this.record = { cb, elements: new Set(), observer: this as unknown as IntersectionObserver };
    ioRecords.push(this.record);
  }

  observe(el: Element): void {
    this.record.elements.add(el);
  }

  unobserve(el: Element): void {
    this.record.elements.delete(el);
  }

  disconnect(): void {
    this.record.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function intersectAll(): void {
  for (const record of [...ioRecords]) {
    const entries = [...record.elements].map(
      (el) =>
        ({ isIntersecting: true, target: el }) as unknown as IntersectionObserverEntry,
    );
    if (entries.length === 0) continue;
    act(() => {
      record.cb(entries, record.observer);
    });
  }
}

const flush = async (hops = 6): Promise<void> => {
  for (let i = 0; i < hops; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '',
  } as unknown as Response;
});

beforeEach(() => {
  ioRecords.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HtmlProjectCoverFrame lazy loading (Batch A §4.2)', () => {
  it('starts no probe and mounts no iframe until the card is near the viewport', async () => {
    render(
      <HtmlProjectCoverFrame
        src="/api/projects/p1/files/index.html?v=1"
        initial="P"
        iframeClassName="thumb-iframe"
        glyphClassName="project-thumb-glyph"
        diagnostic="p1:index.html"
      />,
    );
    await flush(20);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();

    intersectAll();
    await flush(20);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('iframe')).not.toBeNull();
  });
});
