import { describe, expect, it } from 'vitest';

import {
  defaultUiKitComponentSpecs,
  isReplaceableUiKitScaffold,
  renderUiKitComponent,
} from '../../../../src/design-systems/user/ui-kit.js';

describe('defaultUiKitComponentSpecs', () => {
  it('returns 6 entries', () => {
    const specs = defaultUiKitComponentSpecs();
    expect(specs).toHaveLength(6);
  });

  it('App is the first entry (must load last in script order)', () => {
    const specs = defaultUiKitComponentSpecs();
    expect(specs[0]?.componentName).toBe('App');
  });

  it('all entries have non-empty fileName, componentName, and purpose', () => {
    for (const spec of defaultUiKitComponentSpecs()) {
      expect(spec.fileName.length).toBeGreaterThan(0);
      expect(spec.componentName.length).toBeGreaterThan(0);
      expect(spec.purpose.length).toBeGreaterThan(0);
    }
  });

  it('all fileNames end with .jsx', () => {
    for (const spec of defaultUiKitComponentSpecs()) {
      expect(spec.fileName.endsWith('.jsx')).toBe(true);
    }
  });
});

describe('isReplaceableUiKitScaffold', () => {
  it('returns true for a small file containing the od-ui-kit marker', () => {
    const small = `function App() { return <div className="od-ui-kit-app"></div>; }`;
    expect(isReplaceableUiKitScaffold(small)).toBe(true);
  });

  it('returns false when byte size >= 700', () => {
    const large = `function App() { return <div className="od-ui-kit-app">${'x'.repeat(700)}</div>; }`;
    expect(isReplaceableUiKitScaffold(large)).toBe(false);
  });

  it('returns false when the od-ui-kit marker is absent', () => {
    const small = 'function App() { return <div></div>; }';
    expect(isReplaceableUiKitScaffold(small)).toBe(false);
  });
});

describe('renderUiKitComponent', () => {
  it('returns valid JSX source for each canonical name', () => {
    const canonical = ['App', 'Sidebar', 'AssistantsList', 'ChatArea', 'InputBar', 'MessageBubble'];
    for (const name of canonical) {
      const result = renderUiKitComponent(name, 'Test DS', 'Some purpose');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain(`function ${name}`);
    }
  });

  it('returns a generic fallback for an unknown component name', () => {
    const result = renderUiKitComponent('Unknown', 'Test DS', 'A custom component');
    expect(result).toContain('function Unknown');
    expect(result).toContain('od-ui-kit-unknown');
    expect(result).toContain('A custom component');
    expect(result).toContain('window.Unknown = Unknown');
  });

  it('escapes special characters in title within the generic fallback', () => {
    const result = renderUiKitComponent('Widget', "It's \"quoted\"", 'purpose');
    // The escapeJsString helper replaces ' → \' and the title is inside single-quoted JS string
    // Raw JS source should not have unescaped single quotes
    const titleLine = result.match(/title = '(.+)'/)?.[1] ?? '';
    expect(titleLine).not.toMatch(/(?<!\\)'/);
  });
});
