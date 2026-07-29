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

  it('expands a data-od-repeat element once per array item with loop-scoped bindings', () => {
    // The documented one-level repeat: the element carries the whole subtree,
    // and `{{item.*}}` inside it resolves against each array entry.
    const result = renderHtmlTemplateV1({
      templateHtml:
        '<ul><li data-od-repeat="row in data.kpis"><b>{{ row.label }}</b>: {{ row.value }}</li></ul>',
      dataJson: { kpis: [{ label: 'GMV', value: '¥128' }, { label: 'Orders', value: '8,742' }] },
    });
    expect(result.html).toBe(
      '<ul><li><b>GMV</b>: ¥128</li><li><b>Orders</b>: 8,742</li></ul>',
    );
  });

  it('treats literal data-od-repeat text in content and comments as inert copy', () => {
    // Reviewer-reported bug (#5603): the directive scan matched anywhere in
    // the fragment, so authored prose like `Example: data-od-repeat="row in
    // data.rows"` repeated the paragraph, and the same string inside an HTML
    // comment threw "outside of an element". Both are content per the
    // html_template_v1 contract: the directive is an ATTRIBUTE on the
    // repeated element, nothing else.
    const prose = renderHtmlTemplateV1({
      templateHtml: '<p>Example: data-od-repeat="row in data.rows" repeats a row. {{ data.note }}</p>',
      dataJson: { note: 'ok' },
    });
    expect(prose.html).toBe(
      '<p>Example: data-od-repeat="row in data.rows" repeats a row. ok</p>',
    );

    const comment = renderHtmlTemplateV1({
      templateHtml: '<div><!-- use data-od-repeat="item in data.list" here --><span>{{ data.note }}</span></div>',
      dataJson: { note: 'ok' },
    });
    expect(comment.html).toBe(
      '<div><!-- use data-od-repeat="item in data.list" here --><span>ok</span></div>',
    );

    // A real directive after a literal mention still expands.
    const mixed = renderHtmlTemplateV1({
      templateHtml: '<p>docs: data-od-repeat="x in data.y"</p><ul><li data-od-repeat="t in data.tags">{{ t }}</li></ul>',
      dataJson: { tags: ['a', 'b'] },
    });
    expect(mixed.html).toBe(
      '<p>docs: data-od-repeat="x in data.y"</p><ul><li>a</li><li>b</li></ul>',
    );
  });

  it('keeps literal data-od-repeat text inside a repeated element inert', () => {
    // Second-round reviewer repro (#5603): the nested-repeat guard scanned
    // the whole item template, so a literal mention INSIDE the repeated body
    // threw "nested data-od-repeat is not supported".
    const result = renderHtmlTemplateV1({
      templateHtml:
        '<ul><li data-od-repeat="row in data.rows"><span>docs: data-od-repeat="x in data.y"</span>{{ row }}</li></ul>',
      dataJson: { rows: ['a', 'b'] },
    });
    expect(result.html).toBe(
      '<ul><li><span>docs: data-od-repeat="x in data.y"</span>a</li><li><span>docs: data-od-repeat="x in data.y"</span>b</li></ul>',
    );
  });

  it('ignores directive-looking text inside a quoted attribute value', () => {
    // Third-round reviewer repro (#5603): the inside-open-tag check alone
    // still treated `title='docs data-od-repeat="x in data.y"'` as a real
    // loop, duplicating the element and truncating the title.
    const result = renderHtmlTemplateV1({
      templateHtml:
        `<div title='docs data-od-repeat="x in data.y"'>{{ data.note }}</div>`,
      dataJson: { note: 'ok', y: ['a', 'b'] },
    });
    expect(result.html).toBe(
      `<div title='docs data-od-repeat="x in data.y"'>ok</div>`,
    );
  });

  it('keeps same-tag comment text inside a repeated element inert', () => {
    // Fourth-round reviewer repros (#5603): `<!-- <div> -->` inside a
    // repeated <div> incremented the element-boundary depth counter and threw
    // "unbalanced"; `<!-- </div> -->` closed the repeat early.
    const open = renderHtmlTemplateV1({
      templateHtml:
        '<ul><div data-od-repeat="row in data.rows"><!-- <div> --><span>{{ row }}</span></div></ul>',
      dataJson: { rows: ['a', 'b'] },
    });
    expect(open.html).toBe(
      '<ul><div><!-- <div> --><span>a</span></div><div><!-- <div> --><span>b</span></div></ul>',
    );

    const close = renderHtmlTemplateV1({
      templateHtml:
        '<ul><div data-od-repeat="row in data.rows"><!-- </div> --><span>{{ row }}</span></div></ul>',
      dataJson: { rows: ['a'] },
    });
    expect(close.html).toBe('<ul><div><!-- </div> --><span>a</span></div></ul>');
  });

  it('ignores a full tag-like directive inside an HTML comment', () => {
    const result = renderHtmlTemplateV1({
      templateHtml:
        '<section><!-- <div data-od-repeat="row in data.rows">example</div> --><p>{{ data.note }}</p></section>',
      dataJson: { note: 'ok', rows: ['a', 'b'] },
    });
    expect(result.html).toBe(
      '<section><!-- <div data-od-repeat="row in data.rows">example</div> --><p>ok</p></section>',
    );
  });

  it('still rejects a REAL nested data-od-repeat element', () => {
    expect(() => renderHtmlTemplateV1({
      templateHtml:
        '<ul><li data-od-repeat="row in data.rows"><span data-od-repeat="x in data.y">{{ x }}</span></li></ul>',
      dataJson: { rows: ['a'], y: ['b'] },
    })).toThrow(/nested data-od-repeat/);
  });

  it('lets a bare {{item}} binding render each scalar array entry', () => {
    const result = renderHtmlTemplateV1({
      templateHtml: '<ul><li data-od-repeat="tag in data.tags">{{ tag }}</li></ul>',
      dataJson: { tags: ['a', 'b', 'c'] },
    });
    expect(result.html).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
  });

  it('resolves global data.* bindings alongside the loop variable inside a repeat', () => {
    const result = renderHtmlTemplateV1({
      templateHtml:
        '<div data-od-repeat="s in data.stages">{{ s.name }} of {{ data.total }}</div>',
      dataJson: { total: 'Q3', stages: [{ name: 'visit' }, { name: 'pay' }] },
    });
    expect(result.html).toBe('<div>visit of Q3</div><div>pay of Q3</div>');
  });

  it('escapes loop-scoped values so array data cannot inject markup', () => {
    const result = renderHtmlTemplateV1({
      templateHtml: '<span data-od-repeat="r in data.rows">{{ r.note }}</span>',
      dataJson: { rows: [{ note: '<script>x</script>' }] },
    });
    expect(result.html).toBe('<span>&lt;script&gt;x&lt;/script&gt;</span>');
  });

  it('does not re-scan substituted values, so array-supplied braces stay inert', () => {
    // Single-pass invariant: a value that itself looks like a binding must be
    // rendered as literal text, never interpolated a second time.
    const result = renderHtmlTemplateV1({
      templateHtml: '<span data-od-repeat="r in data.rows">{{ r.note }}</span>',
      dataJson: { rows: [{ note: '{{ data.secret }}' }], secret: 'LEAKED' },
    });
    expect(result.html).toBe('<span>{{ data.secret }}</span>');
  });

  it('renders nothing for an empty repeat array', () => {
    const result = renderHtmlTemplateV1({
      templateHtml: '<ul><li data-od-repeat="r in data.rows">{{ r.v }}</li></ul>',
      dataJson: { rows: [] },
    });
    expect(result.html).toBe('<ul></ul>');
  });

  it('handles same-tag nesting when finding the repeat element boundary', () => {
    // The element being repeated contains a child of the same tag name; depth
    // tracking must pair the correct closing tag.
    const result = renderHtmlTemplateV1({
      templateHtml:
        '<div data-od-repeat="c in data.cards"><div class="inner">{{ c.t }}</div></div>',
      dataJson: { cards: [{ t: 'one' }, { t: 'two' }] },
    });
    expect(result.html).toBe(
      '<div><div class="inner">one</div></div><div><div class="inner">two</div></div>',
    );
  });

  it('rejects a nested data-od-repeat as unsupported', () => {
    expect(() => renderHtmlTemplateV1({
      templateHtml:
        '<div data-od-repeat="a in data.groups"><span data-od-repeat="b in a.items">{{ b }}</span></div>',
      dataJson: { groups: [{ items: [1] }] },
    })).toThrow(/nested data-od-repeat/i);
  });

  it('rejects a repeat whose source path is not an array', () => {
    expect(() => renderHtmlTemplateV1({
      templateHtml: '<li data-od-repeat="r in data.rows">{{ r }}</li>',
      dataJson: { rows: 'oops' },
    })).toThrow(/not an array/i);
  });

  it('rejects a malformed repeat directive', () => {
    expect(() => renderHtmlTemplateV1({
      templateHtml: '<li data-od-repeat="just-a-name">{{ x }}</li>',
      dataJson: {},
    })).toThrow(/invalid data-od-repeat directive/i);
  });
});
