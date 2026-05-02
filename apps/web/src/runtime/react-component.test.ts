import { describe, expect, it } from 'vitest';

import { buildReactComponentSrcdoc, prepareReactComponentSource } from './react-component';

describe('prepareReactComponentSource', () => {
  it('adapts a default function export for iframe rendering', () => {
    const out = prepareReactComponentSource(`
import React from 'react';
export default function Card() {
  return <div>Card</div>;
}
`);
    expect(out).not.toContain('import React');
    expect(out).toContain('function Card()');
    expect(out).toContain('window.__OpenDesignComponent');
    expect(out).toContain("typeof Card !== 'undefined' ? Card : null");
  });

  it('adapts a named component export for iframe rendering', () => {
    const out = prepareReactComponentSource('export const Preview = () => <main />;');
    expect(out).toContain('const Preview =');
    expect(out).toContain("typeof Preview !== 'undefined' ? Preview : null");
  });

  it('preserves React hook imports as runtime bindings', () => {
    const out = prepareReactComponentSource(`
import { useState, useEffect as useReactEffect } from 'react';
export default function Counter() {
  const [count, setCount] = useState(0);
  useReactEffect(() => setCount(1), []);
  return <button>{count}</button>;
}
`);
    expect(out).not.toContain("import { useState");
    expect(out).toContain('const { useState, useEffect: useReactEffect } = window.React;');
    expect(out).toContain('function Counter()');
  });

  it('detects default re-exports before removing export specifiers', () => {
    const out = prepareReactComponentSource(`
const Foo = () => <main />;
export { Foo as default };
`);
    expect(out).not.toContain('export { Foo as default }');
    expect(out).toContain("typeof Foo !== 'undefined' ? Foo : null");
  });
});

describe('buildReactComponentSrcdoc', () => {
  it('builds a standalone sandbox document with React runtime scripts', () => {
    const doc = buildReactComponentSrcdoc('export default function App(){ return <div /> }', {
      title: 'App',
    });
    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('react@18/umd/react.development.js');
    expect(doc).toContain('@babel/standalone');
    expect(doc).toContain('artifact.tsx');
    expect(doc).toContain('sandboxed iframe');
    expect(doc).toContain('(0, eval)(compiled)');
  });
});
