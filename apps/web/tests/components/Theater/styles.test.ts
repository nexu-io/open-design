import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Critique Theater styles', () => {
  it('keeps the Theater UI selectors in the global stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toContain('.theater-stage');
    expect(css).toContain('.theater-lane');
    expect(css).toContain('.theater-score-ticker');
    expect(css).toContain('.theater-interrupt');
    expect(css).toContain('.theater-transcript');
    expect(css.indexOf('.theater-stage')).toBeLessThan(css.indexOf('.assistant-feedback-wrap'));
  });
});
