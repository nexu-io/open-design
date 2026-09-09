import { describe, expect, it } from 'vitest';

import { validateProjectPath } from '../src/projects.js';

/**
 * `./x` is how HTML writes a sibling reference, and it names exactly the same
 * file as `x`. The validator rejected it along with `..`, and the route turned
 * that rejection into a 500 — so writing a file the document itself asks for
 * looked like a server fault.
 *
 * Measured on a corpus run of 400 real design-system artifacts: 12 of them
 * failed this way on `./DESIGN.md`, plus `./assets/template.html` in an earlier
 * batch. Reproduced directly against the running daemon:
 *
 *   DESIGN.md              -> 200
 *   ./DESIGN.md            -> 500
 *   assets/template.html   -> 200
 *   ./assets/template.html -> 500
 *
 * `..` is a different animal and must stay rejected: it escapes the project.
 */
describe('project paths with dot segments', () => {
  it('accepts a leading ./ and normalises it away', () => {
    expect(validateProjectPath('./DESIGN.md')).toBe('DESIGN.md');
    expect(validateProjectPath('./assets/template.html')).toBe('assets/template.html');
  });

  it('accepts . segments in the middle, which name the same file', () => {
    expect(validateProjectPath('assets/./styles.css')).toBe('assets/styles.css');
  });

  it('still rejects .. anywhere, which escapes the project', () => {
    expect(() => validateProjectPath('../secret.txt')).toThrow(/invalid file name/u);
    expect(() => validateProjectPath('assets/../../secret.txt')).toThrow(/invalid file name/u);
    expect(() => validateProjectPath('./../secret.txt')).toThrow(/invalid file name/u);
  });

  it('still rejects absolute paths and empty names', () => {
    expect(() => validateProjectPath('/etc/passwd')).toThrow(/invalid file name/u);
    expect(() => validateProjectPath('./')).toThrow(/invalid file name/u);
    expect(() => validateProjectPath('.')).toThrow(/invalid file name/u);
  });

  it('still rejects reserved internal directories', () => {
    expect(() => validateProjectPath('./.file-versions/x.html')).toThrow(/reserved project path/u);
  });
});
