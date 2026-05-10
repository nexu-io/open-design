import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from '../../src/components/Icon';

function McpJsonHelper({ localId }: { localId: string }) {
  const [showMcpExample, setShowMcpExample] = useState(false);
  const helperId = `mcp-json-helper-panel-${localId}`;

  return (
    <div className={`mcp-json-helper ${showMcpExample ? 'is-open' : ''}`}>
      <button
        type="button"
        className="mcp-json-helper-toggle"
        aria-expanded={showMcpExample}
        aria-controls={helperId}
        onClick={() => setShowMcpExample((prev) => !prev)}
      >
        <span className="mcp-json-helper-toggle-content">
          <span className="mcp-json-helper-eye">
            <Icon name="eye" />
          </span>
          <span className="mcp-json-helper-toggle-text">
            Need help? Map your MCP server's JSON config using the example below.
          </span>
        </span>
        <span className="mcp-json-helper-toggle-icon">
          {showMcpExample ? <Icon name="arrow-up" /> : <Icon name="chevron-down" />}
        </span>
      </button>

      {showMcpExample && (
        <div className="mcp-json-helper-example" id={helperId}>
          <div className="mcp-json-helper-example-head">Example MCP JSON</div>
          <div className="mcp-json-helper-conversion">
            <div><strong>Command</strong><code>npx</code></div>
            <div><strong>Args</strong><code>-y tdesign-mcp-server@latest</code></div>
            <div><strong>Env</strong><code>API_KEY = your-key-here</code></div>
            <div><strong>HTTP / SSE</strong><code>use url + headers instead of command / args</code></div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderHelper(localId = 'mcp-row-1') {
  return renderToStaticMarkup(<McpJsonHelper localId={localId} />);
}

describe('McpJsonHelper', () => {
  it('renders collapsed by default with no panel visible', () => {
    const html = renderHelper();
    expect(html).toContain('class="mcp-json-helper "');
    expect(html).not.toContain('mcp-json-helper-example');
    expect(html).not.toContain('Example MCP JSON');
  });

  it('renders toggle button with localId-scoped aria-controls when collapsed', () => {
    const html = renderHelper('mcp-row-1');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="mcp-json-helper-panel-mcp-row-1"');
  });

  it('uses unique ids for different row instances', () => {
    const html1 = renderHelper('mcp-row-1');
    const html2 = renderHelper('mcp-row-2');
    expect(html1).toContain('aria-controls="mcp-json-helper-panel-mcp-row-1"');
    expect(html2).toContain('aria-controls="mcp-json-helper-panel-mcp-row-2"');
    expect(html1).not.toContain('mcp-row-2');
    expect(html2).not.toContain('mcp-row-1');
  });

  it('renders the helper text inside the toggle', () => {
    const html = renderHelper();
    expect(html).toContain(
      "Need help? Map your MCP server&#x27;s JSON config using the example below.",
    );
  });

  it('renders chevron-down icon when collapsed', () => {
    const html = renderHelper();
    expect(html).toContain('mcp-json-helper-toggle-icon');
    expect(html).not.toContain('arrow-up');
  });
});

describe('McpJsonHelper — open state', () => {
  function McpJsonHelperOpen({ localId }: { localId: string }) {
    const helperId = `mcp-json-helper-panel-${localId}`;
    return (
      <div className="mcp-json-helper is-open">
        <button
          type="button"
          className="mcp-json-helper-toggle"
          aria-expanded={true}
          aria-controls={helperId}
        >
          <span className="mcp-json-helper-toggle-content">
            <span className="mcp-json-helper-toggle-text">
              Need help? Map your MCP server's JSON config using the example below.
            </span>
          </span>
        </button>
        <div className="mcp-json-helper-example" id={helperId}>
          <div className="mcp-json-helper-example-head">Example MCP JSON</div>
          <div className="mcp-json-helper-conversion">
            <div><strong>Command</strong><code>npx</code></div>
            <div><strong>Args</strong><code>-y tdesign-mcp-server@latest</code></div>
            <div><strong>Env</strong><code>API_KEY = your-key-here</code></div>
            <div><strong>HTTP / SSE</strong><code>use url + headers instead of command / args</code></div>
          </div>
        </div>
      </div>
    );
  }

  it('renders with is-open class when expanded', () => {
    const html = renderToStaticMarkup(<McpJsonHelperOpen localId="mcp-row-1" />);
    expect(html).toContain('mcp-json-helper is-open');
  });

  it('renders aria-expanded as true when open', () => {
    const html = renderToStaticMarkup(<McpJsonHelperOpen localId="mcp-row-1" />);
    expect(html).toContain('aria-expanded="true"');
  });

  it('renders panel id matching aria-controls', () => {
    const html = renderToStaticMarkup(<McpJsonHelperOpen localId="mcp-row-3" />);
    expect(html).toContain('aria-controls="mcp-json-helper-panel-mcp-row-3"');
    expect(html).toContain('id="mcp-json-helper-panel-mcp-row-3"');
  });

  it('renders Example MCP JSON heading when open', () => {
    const html = renderToStaticMarkup(<McpJsonHelperOpen localId="mcp-row-1" />);
    expect(html).toContain('Example MCP JSON');
  });

  it('renders all four conversion fields when open', () => {
    const html = renderToStaticMarkup(<McpJsonHelperOpen localId="mcp-row-1" />);
    expect(html).toContain('Command');
    expect(html).toContain('npx');
    expect(html).toContain('Args');
    expect(html).toContain('-y tdesign-mcp-server@latest');
    expect(html).toContain('Env');
    expect(html).toContain('API_KEY = your-key-here');
    expect(html).toContain('HTTP / SSE');
    expect(html).toContain('use url + headers instead of command / args');
  });

  it('renders the panel div with mcp-json-helper-example class', () => {
    const html = renderToStaticMarkup(<McpJsonHelperOpen localId="mcp-row-1" />);
    expect(html).toContain('class="mcp-json-helper-example"');
  });
});