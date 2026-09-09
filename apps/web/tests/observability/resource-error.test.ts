// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import { installResourceErrorObserver } from '../../src/observability/resource-error';

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;

let uninstall: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  clearExceptionTrackingContext();
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'device-1',
    sessionId: 'session-1',
  });
  window.history.replaceState(
    {},
    '',
    '/projects/project-secret/conversations/conversation-secret/files/Customer%20Plan.pdf?auth=page-secret#slide-4',
  );
  uninstall = installResourceErrorObserver();
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  vi.useRealTimers();
});

function dispatchResourceError(tag: string, url: string): void {
  const element = document.createElement(tag);
  if (element instanceof HTMLLinkElement) {
    element.href = url;
    element.rel = 'stylesheet';
  } else {
    element.setAttribute('src', url);
  }
  document.body.append(element);
  element.dispatchEvent(new Event('error'));
  element.remove();
}

function fetchedProperties(index: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  expect(init?.body).toEqual(expect.any(String));
  const body = JSON.parse(init!.body as string) as {
    properties: Record<string, unknown>;
  };
  return body.properties;
}

describe('resource error privacy and volume boundary', () => {
  it('classifies resources without sending user paths, URL secrets, or external locations', () => {
    const origin = window.location.origin;
    const cases = [
      {
        tag: 'script',
        url: `${origin}/_next/static/chunks/app/projects/%5Bid%5D/page-a1b2c3.js?build=chunk-secret#runtime`,
        expected: {
          category: 'next_chunk',
          resource_route: '/_next/static/chunks/:chunk',
          normalized_resource: 'next:a1b2c3.js',
          resource_type: 'script',
          resource_extension: 'js',
          origin_relation: 'same_origin',
        },
      },
      {
        tag: 'link',
        url: `${origin}/fonts/remixicon.woff2?v=font-secret#font`,
        expected: {
          category: 'product_asset',
          resource_route: '/fonts/:asset',
          normalized_resource: '/fonts/:asset:style.woff2',
          resource_type: 'style',
          resource_extension: 'woff2',
          origin_relation: 'same_origin',
        },
      },
      {
        tag: 'iframe',
        url: `${origin}/api/projects/prj-private-123/raw/Finance/Customer%20Board.pdf?downloadToken=file-secret#page=9`,
        expected: {
          category: 'user_artifact',
          resource_route: '/api/projects/:project_id/raw/:file',
          normalized_resource: '/api/projects/:project_id/raw/:file.pdf',
          resource_type: 'frame',
          resource_extension: 'pdf',
          origin_relation: 'same_origin',
        },
      },
      {
        tag: 'video',
        url: 'https://viewer:password@media.customer.example/private/Alice%20Interview.mp4?X-Amz-Credential=external-secret#clip',
        expected: {
          category: 'external_media',
          resource_route: 'external',
          normalized_resource: 'external:video.mp4',
          resource_type: 'video',
          resource_extension: 'mp4',
          origin_relation: 'cross_origin',
        },
      },
    ] as const;

    for (const item of cases) dispatchResourceError(item.tag, item.url);

    expect(fetchMock).toHaveBeenCalledTimes(cases.length);
    for (const [index, item] of cases.entries()) {
      expect(fetchedProperties(index)).toMatchObject({
        ...item.expected,
        tag: item.tag,
        event_kind: 'first',
        repeat_count: 0,
        $current_url: `${origin}/projects/:project_id/conversations/:conversation_id/files/:file`,
      });
    }

    const serialized = fetchMock.mock.calls
      .map((call) => String((call[1] as RequestInit).body))
      .join('\n');
    for (const secret of [
      'project-secret',
      'conversation-secret',
      'Customer%20Plan.pdf',
      'prj-private-123',
      'Customer%20Board.pdf',
      'chunk-secret',
      'font-secret',
      'file-secret',
      'Alice%20Interview.mp4',
      'external-secret',
      'viewer:password',
      'media.customer.example',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('does not serialize private names hidden by product prefixes or custom schemes', () => {
    const productLookingPrivateUrl =
      `${window.location.origin}/fonts/Customer%20Contract.pdf`;
    const customSchemeUrl = 'customer-project-123:payload';

    dispatchResourceError('link', productLookingPrivateUrl);
    dispatchResourceError('img', customSchemeUrl);

    expect(fetchedProperties(0)).toMatchObject({
      category: 'product_asset',
      resource_route: '/fonts/:asset',
      resource_extension: 'pdf',
    });
    expect(fetchedProperties(1)).toMatchObject({
      category: 'user_artifact',
      resource_route: 'opaque',
      normalized_resource: 'opaque:image',
    });

    const serialized = fetchMock.mock.calls
      .map((call) => String((call[1] as RequestInit).body))
      .join('\n');
    expect(serialized).not.toContain('Customer%20Contract.pdf');
    expect(serialized).not.toContain('customer-project-123');
    expect(serialized).not.toContain('payload');
  });

  it('retains only a restrictive bundler identifier from chunk filenames', () => {
    dispatchResourceError(
      'script',
      `${window.location.origin}/_next/static/chunks/Customer%20Contract-a1b2c3.js`,
    );

    expect(fetchedProperties(0)).toMatchObject({
      category: 'next_chunk',
      normalized_resource: 'next:a1b2c3.js',
      resource_route: '/_next/static/chunks/:chunk',
    });
    expect(JSON.stringify(fetchedProperties(0))).not.toContain('Customer');
    expect(JSON.stringify(fetchedProperties(0))).not.toContain('Contract');
  });

  it('emits one immediate event and one bounded repeat summary per resource window', () => {
    const resource =
      `${window.location.origin}/api/projects/private-project/raw/Private%20deck.pdf?token=private-token`;

    for (let count = 0; count < 5; count += 1) {
      dispatchResourceError('iframe', resource);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedProperties(0)).toMatchObject({
      category: 'user_artifact',
      event_kind: 'first',
      repeat_count: 0,
    });

    vi.advanceTimersByTime(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchedProperties(1)).toMatchObject({
      category: 'user_artifact',
      event_kind: 'repeat_summary',
      repeat_count: 4,
    });
    expect(JSON.stringify(fetchedProperties(1))).not.toContain('private-project');
    expect(JSON.stringify(fetchedProperties(1))).not.toContain('Private%20deck.pdf');
    expect(JSON.stringify(fetchedProperties(1))).not.toContain('private-token');
  });

  it('closes a repeat window once the resource loads and starts fresh after recovery', () => {
    const resource = document.createElement('img');
    resource.src = `${window.location.origin}/api/projects/private/raw/Recovered%20image.png?token=secret`;
    document.body.append(resource);

    resource.dispatchEvent(new Event('error'));
    resource.dispatchEvent(new Event('error'));
    resource.dispatchEvent(new Event('load'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchedProperties(1)).toMatchObject({
      event_kind: 'repeat_summary',
      repeat_count: 1,
    });

    resource.dispatchEvent(new Event('error'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchedProperties(2)).toMatchObject({
      event_kind: 'first',
      repeat_count: 0,
    });
    resource.remove();
  });

  it('tracks private resources independently when their telemetry classifications collide', () => {
    const first = document.createElement('iframe');
    first.src = `${window.location.origin}/api/projects/private/raw/First%20deck.pdf`;
    const second = document.createElement('iframe');
    second.src = `${window.location.origin}/api/projects/private/raw/Second%20deck.pdf`;
    document.body.append(first, second);

    first.dispatchEvent(new Event('error'));
    first.dispatchEvent(new Event('error'));
    second.dispatchEvent(new Event('error'));
    second.dispatchEvent(new Event('error'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchedProperties(0).normalized_resource).toBe(
      fetchedProperties(1).normalized_resource,
    );

    first.dispatchEvent(new Event('load'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchedProperties(2)).toMatchObject({
      event_kind: 'repeat_summary',
      repeat_count: 1,
    });

    vi.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchedProperties(3)).toMatchObject({
      event_kind: 'repeat_summary',
      repeat_count: 1,
    });

    first.remove();
    second.remove();
  });

  it('flushes the repeat count when the page session ends before the window expires', () => {
    const resource =
      `${window.location.origin}/api/projects/private/raw/Leaving%20page.pdf?token=secret`;
    dispatchResourceError('iframe', resource);
    dispatchResourceError('iframe', resource);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchedProperties(1)).toMatchObject({
      event_kind: 'repeat_summary',
      repeat_count: 1,
    });
  });

  it('bounds tracked resource windows and allows an evicted chunk to report again', () => {
    const origin = window.location.origin;
    for (let index = 0; index < 129; index += 1) {
      const chunkId = index.toString(16).padStart(6, '0');
      dispatchResourceError(
        'script',
        `${origin}/_next/static/chunks/chunk-${chunkId}.js`,
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(129);

    dispatchResourceError(
      'script',
      `${origin}/_next/static/chunks/chunk-000000.js`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(130);
    expect(fetchedProperties(129)).toMatchObject({
      category: 'next_chunk',
      normalized_resource: 'next:000000.js',
      event_kind: 'first',
    });
  });
});
