import { describe, expect, it } from 'vitest';
import {
  escapeHtmlTemplateValue,
  renderHtmlTemplateV1,
  validateHtmlTemplateV1Security,
} from '../../src/live-artifacts/render.js';

describe('validateHtmlTemplateV1Security', () => {
  it('rejects script elements', () => {
    // Inline scripts are the highest-impact escape; even a malformed <script>
    // tag with attributes must trip the validator.
    expect(() => validateHtmlTemplateV1Security('<div><script>alert(1)</script></div>'))
      .toThrow(/script elements/i);
  });

  it('rejects iframe elements', () => {
    // iframes can host arbitrary cross-origin content, including js, even
    // without explicit sandbox attributes.
    expect(() => validateHtmlTemplateV1Security('<iframe src="/evil.html"></iframe>'))
      .toThrow(/iframe elements/i);
  });

  it('rejects srcdoc attributes that would inline a nested document', () => {
    // srcdoc would inline a parsable HTML document into the host context.
    // The iframe check fires first if the element is <iframe>; use a custom
    // element so the srcdoc-specific branch is the one that trips.
    expect(() => validateHtmlTemplateV1Security('<my-frame srcdoc="<b>x</b>"></my-frame>'))
      .toThrow(/srcdoc attributes/i);
  });

  it('rejects inline event handler attributes', () => {
    // onclick / onerror / onload etc.; the regex is case-insensitive so
    // mixed-case bypass attempts also fail.
    expect(() => validateHtmlTemplateV1Security('<img src="x" onerror="alert(1)">'))
      .toThrow(/event handler attributes/i);
  });

  it('rejects javascript: URLs in href/src/action/formaction', () => {
    // href=javascript:..., src=javascript:..., action=javascript:..., and
    // formaction=javascript:... must all surface the same diagnostic so the
    // user sees a coherent failure mode.
    expect(() => validateHtmlTemplateV1Security('<a href="javascript:alert(1)">x</a>'))
      .toThrow(/javascript: URLs/i);
  });

  it('rejects raw HTML insertion directives', () => {
    // data-od-html / data-od-raw / data-od-bind-html are application-level
    // opt-outs of escaping; banning them keeps the renderer to a single
    // escape path.
    expect(() => validateHtmlTemplateV1Security('<div data-od-html="x"></div>'))
      .toThrow(/raw HTML insertion directives/i);
  });

  it('accepts a clean template without any executable patterns', () => {
    // Sanity check: a plain template body with text and safe attributes must
    // pass without throwing, otherwise the validator would block every
    // legitimate render.
    expect(() => validateHtmlTemplateV1Security('<div class="card"><p>Hello {{ data.name }}</p></div>'))
      .not.toThrow();
  });
});

describe('escapeHtmlTemplateValue', () => {
  it('escapes the five HTML-significant characters', () => {
    // Each character maps to its named or numeric entity; the result must be
    // safe to paste into element text content or an attribute value.
    expect(escapeHtmlTemplateValue('<')).toBe('&lt;');
    expect(escapeHtmlTemplateValue('>')).toBe('&gt;');
    expect(escapeHtmlTemplateValue('&')).toBe('&amp;');
    expect(escapeHtmlTemplateValue('"')).toBe('&quot;');
    expect(escapeHtmlTemplateValue("'")).toBe('&#39;');
  });

  it('escapes ampersand first so existing entities are not double-decoded', () => {
    // If `<` were escaped before `&`, the resulting `&lt;` would itself get
    // re-escaped on the `&` pass into `&amp;lt;`. The ordering of replaceAll
    // calls in render.ts guards against that.
    expect(escapeHtmlTemplateValue('<a&b>')).toBe('&lt;a&amp;b&gt;');
  });

  it('coerces non-string inputs through String() before escaping', () => {
    // Numbers, booleans, and null must all render as their string form so
    // template authors do not have to pre-cast every binding.
    expect(escapeHtmlTemplateValue(42)).toBe('42');
    expect(escapeHtmlTemplateValue(true)).toBe('true');
    expect(escapeHtmlTemplateValue(null)).toBe('null');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtmlTemplateValue('hello world')).toBe('hello world');
  });
});

describe('renderHtmlTemplateV1', () => {
  it('substitutes a data binding with the escaped value from dataJson', () => {
    // Happy path: a single {{ data.name }} binding resolves to the
    // corresponding key and the surrounding markup is preserved verbatim.
    const result = renderHtmlTemplateV1({
      templateHtml: '<p>Hello, {{ data.name }}!</p>',
      dataJson: { name: 'Ada' },
    });
    expect(result.html).toBe('<p>Hello, Ada!</p>');
  });

  it('escapes substituted values so injected markup cannot break out of text', () => {
    // The whole reason the renderer routes through escapeHtmlTemplateValue:
    // a user-controlled value containing tags is rendered as text, not DOM.
    const result = renderHtmlTemplateV1({
      templateHtml: '<p>{{ data.note }}</p>',
      dataJson: { note: '<script>x</script>' },
    });
    expect(result.html).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });

  it('walks nested keys via dotted paths', () => {
    // data.user.name reads dataJson.user.name; missing intermediate keys
    // resolve to '' rather than throwing, so partial data renders cleanly.
    const result = renderHtmlTemplateV1({
      templateHtml: '<p>{{ data.user.name }}</p>',
      dataJson: { user: { name: 'Grace' } },
    });
    expect(result.html).toBe('<p>Grace</p>');
  });

  it('rejects raw interpolation syntax (triple-brace) before substitution', () => {
    // {{{ ... }}} would bypass HTML escaping; the renderer must surface a
    // clear error rather than silently passing the value through.
    expect(() => renderHtmlTemplateV1({
      templateHtml: '<p>{{{ data.note }}}</p>',
      dataJson: { note: 'x' },
    })).toThrow(/raw template interpolation/i);
  });
});
