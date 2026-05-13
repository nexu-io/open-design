import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { scrubBeforeSend } from '../src/analytics/scrub';

function makeEvent(event: string, properties: Record<string, unknown>): CaptureResult {
  return {
    event,
    properties,
    distinct_id: 'test',
    uuid: 'uuid',
    timestamp: new Date(),
  } as unknown as CaptureResult;
}

describe('scrubBeforeSend', () => {
  it('returns null for null input', () => {
    expect(scrubBeforeSend(null)).toBeNull();
  });

  it('drops $opt_in events (already captured via explicit consent toggle)', () => {
    const cleaned = scrubBeforeSend(makeEvent('$opt_in', {}));
    expect(cleaned).toBeNull();
  });

  it('strips $el_text from textarea elements on $autocapture', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$autocapture', {
        $elements: [
          {
            tag_name: 'textarea',
            $el_text: 'A secret prompt the user typed',
            attr__placeholder: 'Type your prompt…',
            attr__value: 'A secret prompt the user typed',
          },
        ],
      }),
    );
    const els = cleaned!.properties.$elements as Array<Record<string, unknown>>;
    expect(els[0]!.$el_text).toBeUndefined();
    expect(els[0]!.attr__value).toBeUndefined();
    expect(els[0]!.attr__placeholder).toBeUndefined();
    expect(els[0]!.tag_name).toBe('textarea');
  });

  it('strips $el_text from password inputs', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$rageclick', {
        $elements: [
          { tag_name: 'input', attr__type: 'password', $el_text: 'sk-ant-xxx' },
        ],
      }),
    );
    const els = cleaned!.properties.$elements as Array<Record<string, unknown>>;
    expect(els[0]!.$el_text).toBeUndefined();
  });

  it('strips $el_text from contenteditable elements', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$dead_click', {
        $elements: [
          { tag_name: 'div', attr__contenteditable: 'true', $el_text: 'user-typed' },
        ],
      }),
    );
    const els = cleaned!.properties.$elements as Array<Record<string, unknown>>;
    expect(els[0]!.$el_text).toBeUndefined();
  });

  it('leaves button text on safe tags untouched', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$autocapture', {
        $elements: [{ tag_name: 'button', $el_text: 'Create project' }],
      }),
    );
    const els = cleaned!.properties.$elements as Array<Record<string, unknown>>;
    expect(els[0]!.$el_text).toBe('Create project');
  });

  it('strips query string from $current_url', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$pageview', {
        $current_url: 'http://localhost:7457/projects/abc-123?prompt=secret&model=foo',
      }),
    );
    expect(cleaned!.properties.$current_url).toBe(
      'http://localhost:7457/projects/abc-123',
    );
  });

  it('strips fragment from URL', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$pageview', {
        $current_url: 'http://localhost:7457/projects/abc#anchor-with-data',
      }),
    );
    expect(cleaned!.properties.$current_url).toBe(
      'http://localhost:7457/projects/abc',
    );
  });

  it('keeps malformed URLs as-is rather than dropping the event', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$pageview', { $current_url: 'not a url' }),
    );
    expect(cleaned!.properties.$current_url).toBe('not a url');
  });

  it('rewrites absolute file:// paths in exception stack traces', () => {
    const cleaned = scrubBeforeSend(
      makeEvent('$exception', {
        $exception_list: [
          {
            type: 'TypeError',
            value: 'x is null',
            stacktrace: {
              frames: [
                {
                  filename: 'file:///Users/alice/work/apps/web/src/App.tsx',
                  abs_path: '/Users/alice/work/apps/web/src/App.tsx',
                  lineno: 42,
                },
              ],
            },
          },
        ],
      }),
    );
    const list = cleaned!.properties.$exception_list as Array<{
      stacktrace: { frames: Array<{ filename: string; abs_path: string }> };
    }>;
    expect(list[0]!.stacktrace.frames[0]!.filename).toBe('app://apps/web/src/App.tsx');
    expect(list[0]!.stacktrace.frames[0]!.abs_path).toBe(
      'app://apps/web/src/App.tsx',
    );
  });

  it('passes events through with no $elements, $current_url, or stack untouched', () => {
    const event = makeEvent('$pageleave', { duration: 1234 });
    const cleaned = scrubBeforeSend(event);
    expect(cleaned).toEqual({ ...event, properties: { duration: 1234 } });
  });
});
