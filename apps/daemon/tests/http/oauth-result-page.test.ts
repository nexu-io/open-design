import { describe, expect, it } from 'vitest';

import { renderOAuthResultPage } from '../../src/http/oauth-result-page.js';

describe('renderOAuthResultPage', () => {
  it('keeps a reflected message from breaking out of the inline script', () => {
    // The OAuth provider echoing `?error=` lands in the payload verbatim; a
    // literal `</script>` inside JSON.stringify output would close the script
    // block and inject markup.
    const hostile = '</script><script>alert(document.domain)</script>';
    const html = renderOAuthResultPage({ ok: false, message: hostile });

    // The script block must contain no literal < / > & from the message.
    const scriptBody = html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>'));
    expect(scriptBody).not.toContain('</script><script>');
    expect(scriptBody).not.toContain('<script>alert');
    // The same payload value must still deserialize identically in-page.
    const payloadLiteral = /var payload = (\{.*\});/s.exec(scriptBody)?.[1];
    expect(payloadLiteral).toBeDefined();
    expect(JSON.parse(payloadLiteral!)).toEqual({
      type: 'mcp-oauth',
      ok: false,
      message: hostile,
    });
    // The visible body is HTML-escaped, so the hostile markup renders inert.
    expect(html).toContain('&lt;/script&gt;');
    expect(html).not.toContain(`<p>${hostile}</p>`);
  });

  it('escapes HTML-significant characters in the success serverId', () => {
    const html = renderOAuthResultPage({ ok: true, serverId: 'srv"><img onerror=alert(1)>' });
    expect(html).toContain('srv&quot;&gt;&lt;img onerror=alert(1)&gt;');
    const scriptBody = html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>'));
    expect(scriptBody).not.toContain('srv"><img');
  });
});
