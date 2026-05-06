import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentIcon } from '../../src/components/AgentIcon';

describe('AgentIcon', () => {
  it('renders Qoder with a dedicated supplied-mark visual', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="qoder" size={24} />);

    expect(markup).toContain('background:#111113');
    expect(markup).toContain('fill="#2ADB5C"');
    expect(markup).toContain('fill="#FFFFFF"');
  });

  it('keeps unknown agents on the generic fallback visual', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="unknown-agent" size={24} />);

    expect(markup).toContain('linear-gradient(135deg, #6b7280 0%, #4b5563 100%)');
    expect(markup).not.toContain('fill="#2ADB5C"');
  });
});
