import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandHomePrefix, resolveProjectRelativePath } from '../src/home-expansion.js';

describe('expandHomePrefix', () => {
  // Pin homedir once: os.homedir() reads HOME/USERPROFILE eagerly, so any
  // future env-mutation test added next to these cases would otherwise drift.
  const home = os.homedir();

  it('expands a bare tilde to the user home directory', () => {
    expect(expandHomePrefix('~')).toBe(home);
  });

  it('expands ~/sub to a joined absolute path under home', () => {
    expect(expandHomePrefix('~/projects/open-design')).toBe(path.join(home, 'projects', 'open-design'));
  });

  it('expands $HOME bare to the user home directory', () => {
    expect(expandHomePrefix('$HOME')).toBe(home);
  });

  it('expands $HOME/sub to a joined path under home', () => {
    expect(expandHomePrefix('$HOME/.open-design')).toBe(path.join(home, '.open-design'));
  });

  it('expands the ${HOME} braced form bare and prefixed', () => {
    // The braced form is what shells emit when interpolation needs to be
    // disambiguated from a longer identifier, so launchers may produce it.
    expect(expandHomePrefix('${HOME}')).toBe(home);
    expect(expandHomePrefix('${HOME}/data')).toBe(path.join(home, 'data'));
  });

  it('accepts backslash separators so Windows-style launchers expand identically', () => {
    // The docblock on expandHomePrefix calls this out explicitly: forward and
    // back slashes are both accepted at the prefix boundary; the output is
    // rebuilt with path.join so the platform separator decides the result.
    expect(expandHomePrefix('~\\sub')).toBe(path.join(home, 'sub'));
    expect(expandHomePrefix('$HOME\\sub')).toBe(path.join(home, 'sub'));
    expect(expandHomePrefix('${HOME}\\sub')).toBe(path.join(home, 'sub'));
  });

  it('returns non-home inputs unchanged (absolute, relative, other $VAR)', () => {
    // Anything outside the documented shorthand set must pass through; the
    // resolver layer above will handle absolute vs relative semantics.
    expect(expandHomePrefix('/etc/passwd')).toBe('/etc/passwd');
    expect(expandHomePrefix('./relative/path')).toBe('./relative/path');
    expect(expandHomePrefix('plain')).toBe('plain');
    expect(expandHomePrefix('$OTHER/path')).toBe('$OTHER/path');
  });
});

describe('resolveProjectRelativePath', () => {
  const home = os.homedir();
  const projectRoot = path.resolve('/var/lib/od-daemon');

  it('anchors a relative path to the supplied project root', () => {
    expect(resolveProjectRelativePath('artifacts/cache', projectRoot)).toBe(
      path.resolve(projectRoot, 'artifacts/cache'),
    );
  });

  it('returns absolute inputs unchanged', () => {
    expect(resolveProjectRelativePath('/srv/data', projectRoot)).toBe('/srv/data');
  });

  it('expands ~ and joins the remainder under home before absolute-vs-relative dispatch', () => {
    // The expansion runs first, so '~/data' resolves to an absolute path
    // under home and the projectRoot anchor never applies.
    expect(resolveProjectRelativePath('~/data', projectRoot)).toBe(path.join(home, 'data'));
  });
});
