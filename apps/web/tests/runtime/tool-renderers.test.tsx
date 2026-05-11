import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolCard } from '../../src/components/ToolCard';
import {
  clearToolRenderers,
  deriveToolStatus,
  getToolRenderer,
  registerToolRenderer,
  toRenderProps,
} from '../../src/runtime/tool-renderers';
import type { ToolRenderProps } from '../../src/runtime/tool-renderers';
import type { AgentEvent } from '../../src/types';

type ToolUse = Extract<AgentEvent, { kind: 'tool_use' }>;
type ToolResult = Extract<AgentEvent, { kind: 'tool_result' }>;

function use(input: unknown, name = 'render_chart', id = 't1'): ToolUse {
  return { kind: 'tool_use', id, name, input };
}

function ok(content: string, id = 't1'): ToolResult {
  return { kind: 'tool_result', toolUseId: id, content, isError: false };
}

function err(content: string, id = 't1'): ToolResult {
  return { kind: 'tool_result', toolUseId: id, content, isError: true };
}

describe('deriveToolStatus', () => {
  it('returns "executing" while the run is streaming and no result has arrived', () => {
    expect(deriveToolStatus(undefined, true)).toBe('executing');
  });

  it('returns "complete" when a successful run finished without a tool result', () => {
    expect(deriveToolStatus(undefined, false, true)).toBe('complete');
  });

  it('returns "error" when a failed or canceled run finished without a tool result', () => {
    expect(deriveToolStatus(undefined, false, false)).toBe('error');
  });

  it('returns "complete" on a clean tool result', () => {
    expect(deriveToolStatus(ok('ok'), true)).toBe('complete');
  });

  it('returns "error" when the tool result carries isError', () => {
    expect(deriveToolStatus(err('boom'), true)).toBe('error');
  });
});

describe('toRenderProps', () => {
  it('packs args / result / isError into the AG-UI render-prop shape', () => {
    const u = use({ city: 'SF' }, 'get_weather');
    const props = toRenderProps(u, ok('{"temp":61}'), true);
    expect(props).toEqual({
      status: 'complete',
      name: 'get_weather',
      args: { city: 'SF' },
      result: '{"temp":61}',
      isError: false,
    });
  });

  it('omits result while the tool is still running', () => {
    const u = use({ city: 'SF' }, 'get_weather');
    const props = toRenderProps(u, undefined, true);
    expect(props.status).toBe('executing');
    expect(props.result).toBeUndefined();
    expect(props.isError).toBe(false);
  });

  it('marks missing results complete only for successful terminal runs', () => {
    const u = use({ city: 'SF' }, 'get_weather');

    expect(toRenderProps(u, undefined, false, true).status).toBe('complete');
    expect(toRenderProps(u, undefined, false, false).status).toBe('error');
  });
});

describe('tool renderer registry', () => {
  afterEach(() => clearToolRenderers());

  it('registers, looks up, and unregisters renderers', () => {
    const r = () => null;
    expect(getToolRenderer('xyz')).toBeUndefined();
    const dispose = registerToolRenderer('xyz', r);
    expect(getToolRenderer('xyz')).toBe(r);
    dispose();
    expect(getToolRenderer('xyz')).toBeUndefined();
  });

  it('overwrites on re-registration (last writer wins)', () => {
    const a = () => null;
    const b = () => null;
    registerToolRenderer('xyz', a);
    registerToolRenderer('xyz', b);
    expect(getToolRenderer('xyz')).toBe(b);
  });

  it('does not unregister a renderer that has been overwritten', () => {
    const a = () => null;
    const b = () => null;
    const disposeA = registerToolRenderer('xyz', a);
    registerToolRenderer('xyz', b);
    disposeA();
    expect(getToolRenderer('xyz')).toBe(b);
  });
});

describe('ToolCard dispatch', () => {
  afterEach(() => clearToolRenderers());

  it('routes unknown tool names through the registry', () => {
    registerToolRenderer('render_chart', ({ status, args }) => (
      <div data-testid="custom-chart" data-status={status}>
        {(args as { label?: string }).label}
      </div>
    ));
    const markup = renderToStaticMarkup(
      <ToolCard use={use({ label: 'Q3 revenue' })} runStreaming={true} />,
    );
    expect(markup).toContain('data-testid="custom-chart"');
    expect(markup).toContain('data-status="executing"');
    expect(markup).toContain('Q3 revenue');
  });

  it('passes the result content through as the `result` prop on completion', () => {
    registerToolRenderer('render_chart', ({ status, result }) => (
      <span data-testid="custom-chart" data-status={status}>
        {result}
      </span>
    ));
    const markup = renderToStaticMarkup(
      <ToolCard use={use({})} result={ok('payload')} runStreaming={false} />,
    );
    expect(markup).toContain('data-status="complete"');
    expect(markup).toContain('payload');
  });

  it('falls back to the built-in card when the registered renderer returns null', () => {
    registerToolRenderer('Bash', () => null);
    const markup = renderToStaticMarkup(
      <ToolCard use={use({ command: 'ls' }, 'Bash')} runStreaming={true} />,
    );
    expect(markup).toContain('op-bash');
    expect(markup).toContain('ls');
  });

  it('lets a registered renderer override a built-in family card', () => {
    registerToolRenderer('Bash', ({ args }) => (
      <pre data-testid="custom-bash">{(args as { command?: string }).command}</pre>
    ));
    const markup = renderToStaticMarkup(
      <ToolCard use={use({ command: 'whoami' }, 'Bash')} runStreaming={true} />,
    );
    expect(markup).toContain('data-testid="custom-bash"');
    expect(markup).not.toContain('op-bash');
  });

  it('mounts hookful renderer output as a child component, surviving replace + dispose', () => {
    // The documented contract: renderers must be hook-free, but they may
    // return a component *element* whose body uses hooks. That child gets
    // mounted as its own component, so swapping the renderer (or letting
    // it return null) does not violate the Rules of Hooks on ToolCard.
    function HookfulCardA({ args }: ToolRenderProps) {
      const [count] = useState(() => (args as { start?: number }).start ?? 0);
      return <span data-testid="hookful-a">A:{count}</span>;
    }
    function HookfulCardB({ result }: ToolRenderProps) {
      const [label] = useState('mounted');
      return (
        <span data-testid="hookful-b">
          B:{label}:{result ?? ''}
        </span>
      );
    }

    const disposeA = registerToolRenderer('render_chart', (props) => <HookfulCardA {...props} />);
    const first = renderToStaticMarkup(
      <ToolCard use={use({ start: 7 })} runStreaming={true} />,
    );
    expect(first).toContain('data-testid="hookful-a"');
    expect(first).toContain('A:7');

    // Swap to a renderer with a different hook shape. If the renderer
    // were called as a plain function inside ToolCard, this would shift
    // ToolCard's hook sequence; mounting as a child component isolates
    // each renderer's hooks to its own fiber.
    disposeA();
    registerToolRenderer('render_chart', (props) => <HookfulCardB {...props} />);
    const second = renderToStaticMarkup(
      <ToolCard use={use({})} result={ok('payload')} runStreaming={false} />,
    );
    expect(second).toContain('data-testid="hookful-b"');
    expect(second).toContain('B:mounted:payload');
    expect(second).not.toContain('hookful-a');
  });

  it('falls back to the built-in card when a registered renderer throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerToolRenderer('Bash', () => {
      throw new Error('boom');
    });
    const markup = renderToStaticMarkup(
      <ToolCard use={use({ command: 'ls' }, 'Bash')} runStreaming={true} />,
    );
    expect(markup).toContain('op-bash');
    expect(markup).toContain('ls');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
