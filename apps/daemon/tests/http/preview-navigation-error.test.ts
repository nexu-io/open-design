import { describe, expect, it } from 'vitest';
import {
  buildPreviewVersionChangedNavigationDocument,
  parsePreviewNavigationAttempt,
} from '../../src/http/preview-navigation-error.js';

describe('preview navigation error document', () => {
  it('accepts only a bounded attempt marker owned by the current scope', () => {
    expect(parsePreviewNavigationAttempt('scope-0001.0', 'scope-0001')).toBe(0);
    expect(parsePreviewNavigationAttempt('scope-0001.42', 'scope-0001')).toBe(42);
    expect(parsePreviewNavigationAttempt('scope-0002.1', 'scope-0001')).toBeNull();
    expect(parsePreviewNavigationAttempt('scope-0001.-1', 'scope-0001')).toBeNull();
    expect(parsePreviewNavigationAttempt(['scope-0001.1'], 'scope-0001')).toBeNull();
  });

  it('reports the exact failed version and answers a later host probe', () => {
    const html = buildPreviewVersionChangedNavigationDocument({
      sessionId: 'scope-0001',
      documentVersion: 'sha256:version-one',
      navigationAttempt: 2,
    });

    expect(html).toContain('od:preview:navigation-failed');
    expect(html).toContain('"reason":"version_changed"');
    expect(html).toContain('"navigationAttempt":2');
    expect(html).toContain("data.type==='od:preview:probe'");
    expect(html).toContain("data.sessionId===message.sessionId");
    expect(html).not.toContain('</script><script');
  });
});
