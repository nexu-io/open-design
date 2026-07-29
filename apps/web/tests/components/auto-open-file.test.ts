import { describe, expect, it } from 'vitest';

import {
  decideAutoOpenAfterWrite,
  selectAutoOpenProducedArtifact,
  selectAutoOpenTurnArtifact,
} from '../../src/components/auto-open-file';

describe('decideAutoOpenAfterWrite', () => {
  it('returns shouldOpen=false when filePath is empty', () => {
    const result = decideAutoOpenAfterWrite('', [{ name: 'index.html' }]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('returns shouldOpen=true when filePath equals a project file path', () => {
    const result = decideAutoOpenAfterWrite('index.html', [
      { name: 'index.html', path: 'index.html' },
      { name: 'styles.css', path: 'styles.css' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'index.html' });
  });

  it('returns shouldOpen=false when filePath has slashes but matches no project path', () => {
    // Regression: this is the "rogue empty tab" case — the agent edited a
    // file outside the project (e.g. an upstream repo's source file) and
    // we must NOT open a placeholder tab for it. filePath has a slash, so
    // the basename fallback is intentionally skipped.
    const result = decideAutoOpenAfterWrite(
      '/home/bryan/projects/open-design/apps/daemon/src/project-watchers.ts',
      [
        { name: 'index.html', path: 'index.html' },
        { name: 'App.jsx', path: 'App.jsx' },
      ],
    );
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('falls back to basename match when filePath is just a basename', () => {
    const result = decideAutoOpenAfterWrite('App.jsx', [
      { name: 'index.html', path: 'index.html' },
      { name: 'App.jsx', path: 'App.jsx' },
      { name: 'styles.css', path: 'styles.css' },
      { name: 'README.md', path: 'README.md' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'App.jsx' });
  });

  it('matches an absolute filePath via path-suffix against a nested project file', () => {
    // Real-world case: the agent passes an absolute file_path; the project
    // file lives at "prototype/App.jsx". The decision must still resolve
    // unambiguously, returning the project-relative file name.
    const result = decideAutoOpenAfterWrite(
      '/home/bryan/projects/open-design/.od/projects/abc/prototype/App.jsx',
      [
        { name: 'index.html', path: 'index.html' },
        { name: 'prototype/App.jsx', path: 'prototype/App.jsx' },
      ],
    );
    expect(result).toEqual({ shouldOpen: true, fileName: 'prototype/App.jsx' });
  });

  it('declines when an absolute filePath could match multiple nested project files (ambiguous)', () => {
    // Two project files share the basename "App.jsx" but live in different
    // subdirs. The agent's filePath ends with "/App.jsx" only, with no
    // disambiguating subdirectory match — refuse rather than open the wrong file.
    const result = decideAutoOpenAfterWrite(
      '/some/external/path/App.jsx',
      [
        { name: 'src/App.jsx', path: 'src/App.jsx' },
        { name: 'lib/App.jsx', path: 'lib/App.jsx' },
      ],
    );
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('declines when filePath has a slash and no project path is a suffix match', () => {
    // Agent edited /upstream/repo/App.jsx; project also has prototype/App.jsx.
    // The previous (basename-only) implementation would have opened the
    // wrong file; the path-suffix check leaves zero matches and the
    // basename fallback is intentionally skipped because filePath has a slash.
    const result = decideAutoOpenAfterWrite('/upstream/repo/App.jsx', [
      { name: 'prototype/App.jsx', path: 'prototype/App.jsx' },
    ]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('still works when ProjectFile entries omit the optional path field', () => {
    // Defensive: ProjectFile.path is optional in the API contract. Fall
    // back to using `name` (which the daemon populates with the full
    // project-relative path) when path is missing.
    const result = decideAutoOpenAfterWrite('index.html', [
      { name: 'index.html' },
      { name: 'styles.css' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'index.html' });
  });

  it('declines a basename fallback when multiple project files share the basename', () => {
    const result = decideAutoOpenAfterWrite('App.jsx', [
      { name: 'src/App.jsx', path: 'src/App.jsx' },
      { name: 'lib/App.jsx', path: 'lib/App.jsx' },
    ]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('declines to auto-open a .jsx module loaded by a sibling HTML entry', () => {
    // icons.jsx is a module of a multi-file React prototype (loaded by
    // "Backups Panel.html" via <script type="text/babel" src>). It has no
    // standalone preview, so auto-opening it strands the user on a dead-end
    // tab. Issue #2744.
    const result = decideAutoOpenAfterWrite(
      'icons.jsx',
      [
        { name: 'icons.jsx', path: 'icons.jsx' },
        { name: 'Backups Panel.html', path: 'Backups Panel.html' },
      ],
      { moduleFileNames: new Set(['icons.jsx']) },
    );
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('still auto-opens the same file when no module set is supplied (back-compat)', () => {
    // Proves the suppression is driven solely by moduleFileNames: the legacy
    // two-arg call path is unchanged, so this test goes red if the guard ever
    // suppresses unconditionally.
    const result = decideAutoOpenAfterWrite('icons.jsx', [
      { name: 'icons.jsx', path: 'icons.jsx' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'icons.jsx' });
  });

  it('still auto-opens a standalone artifact even when other modules exist', () => {
    const result = decideAutoOpenAfterWrite(
      'landing.html',
      [
        { name: 'landing.html', path: 'landing.html' },
        { name: 'icons.jsx', path: 'icons.jsx' },
      ],
      { moduleFileNames: new Set(['icons.jsx']) },
    );
    expect(result).toEqual({ shouldOpen: true, fileName: 'landing.html' });
  });
});

describe('selectAutoOpenProducedArtifact', () => {
  it('selects a newly produced html file for the turn-end auto-open fallback', () => {
    const result = selectAutoOpenProducedArtifact([
      { name: 'notes.txt', path: 'notes.txt', kind: 'text', mtime: 20 },
      { name: 'mutuals-v2.html', path: 'mutuals-v2.html', kind: 'html', mtime: 30 },
    ]);

    expect(result).toBe('mutuals-v2.html');
  });

  it('prefers the newest produced html file when a turn writes multiple html files', () => {
    const result = selectAutoOpenProducedArtifact([
      { name: 'index.html', path: 'index.html', kind: 'html', mtime: 10 },
      { name: 'mutuals-v2.html', path: 'mutuals-v2.html', kind: 'html', mtime: 30 },
    ]);

    expect(result).toBe('mutuals-v2.html');
  });

  it('auto-opens a produced markdown document (plan/report) when no html exists', () => {
    // Plan mode: the turn produces only `plan.md`. It renders inline in the
    // viewer, so it must auto-open rather than leave the viewer empty.
    const result = selectAutoOpenProducedArtifact([
      { name: 'plan.md', path: 'plan.md', kind: 'text', mtime: 30 },
    ]);

    expect(result).toBe('plan.md');
  });

  it('prefers the html page over a markdown note written in the same turn', () => {
    // Even when the markdown file is the most recently written, the primary
    // visual deliverable (html) takes focus.
    const result = selectAutoOpenProducedArtifact([
      { name: 'index.html', path: 'index.html', kind: 'html', mtime: 10 },
      { name: 'README.md', path: 'README.md', kind: 'text', mtime: 30 },
    ]);

    expect(result).toBe('index.html');
  });

  it('leaves a plain .txt file alone (text kind is shared with markdown)', () => {
    // `.md` and `.txt` both arrive as kind: 'text'; only markdown should open.
    const result = selectAutoOpenProducedArtifact([
      { name: 'notes.txt', path: 'notes.txt', kind: 'text', mtime: 30 },
    ]);

    expect(result).toBeNull();
  });

  it('returns null when the produced files are not previewable', () => {
    const result = selectAutoOpenProducedArtifact([
      { name: 'deck.pptx', path: 'deck.pptx', kind: 'presentation', mtime: 30 },
    ]);

    expect(result).toBeNull();
  });

  describe('preferSiteEntry (website-clone turns)', () => {
    it('opens the site entry even when subpages were written after it', () => {
      // A clone run writes the entry first and keeps landing subpages and
      // reports afterwards — the newest-mtime rule would open a subpage.
      const result = selectAutoOpenProducedArtifact(
        [
          { name: 'index.html', path: 'index.html', kind: 'html', mtime: 10 },
          { name: 'about.html', path: 'about.html', kind: 'html', mtime: 30 },
          { name: 'CLONE_REPORT.md', path: 'CLONE_REPORT.md', kind: 'text', mtime: 40 },
        ],
        { preferSiteEntry: true },
      );

      expect(result).toBe('index.html');
    });

    it('prefers the shallowest index.html among nested entries', () => {
      const result = selectAutoOpenProducedArtifact(
        [
          { name: 'zh/index.html', path: 'zh/index.html', kind: 'html', mtime: 30 },
          { name: 'index.html', path: 'index.html', kind: 'html', mtime: 10 },
        ],
        { preferSiteEntry: true },
      );

      expect(result).toBe('index.html');
    });

    it('breaks a same-depth entry tie to the newest mtime', () => {
      const result = selectAutoOpenProducedArtifact(
        [
          { name: 'en/index.html', path: 'en/index.html', kind: 'html', mtime: 10 },
          { name: 'zh/index.html', path: 'zh/index.html', kind: 'html', mtime: 30 },
        ],
        { preferSiteEntry: true },
      );

      expect(result).toBe('zh/index.html');
    });

    it('falls back to the standard newest-html rule when no index.html was produced', () => {
      const result = selectAutoOpenProducedArtifact(
        [
          { name: 'landing.html', path: 'landing.html', kind: 'html', mtime: 10 },
          { name: 'pricing.html', path: 'pricing.html', kind: 'html', mtime: 30 },
        ],
        { preferSiteEntry: true },
      );

      expect(result).toBe('pricing.html');
    });

    it('does not change behavior when the flag is off', () => {
      const result = selectAutoOpenProducedArtifact([
        { name: 'index.html', path: 'index.html', kind: 'html', mtime: 10 },
        { name: 'about.html', path: 'about.html', kind: 'html', mtime: 30 },
      ]);

      expect(result).toBe('about.html');
    });
  });
});

describe('selectAutoOpenTurnArtifact', () => {
  const TURN_START = 1_000_000;

  it('opens a pre-existing HTML file the turn rewrote in place (plan regeneration)', () => {
    // Plan-mode loop: plan → generate → edit plan → regenerate. The second
    // generation rewrites index.html, so the name diff (produced) is empty.
    const result = selectAutoOpenTurnArtifact(
      [],
      [
        { name: 'plan.md', path: 'plan.md', kind: 'text', mtime: TURN_START - 60_000 },
        { name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 5_000 },
      ],
      { turnStartedAt: TURN_START },
    );

    expect(result).toBe('index.html');
  });

  it('still prefers rewritten HTML over a markdown plan touched in the same turn', () => {
    const result = selectAutoOpenTurnArtifact(
      [],
      [
        { name: 'plan.md', path: 'plan.md', kind: 'text', mtime: TURN_START + 9_000 },
        { name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 5_000 },
      ],
      { turnStartedAt: TURN_START },
    );

    expect(result).toBe('index.html');
  });

  it('keeps preferring newly produced files and merges rewritten ones by rank', () => {
    const result = selectAutoOpenTurnArtifact(
      [{ name: 'report.md', path: 'report.md', kind: 'text', mtime: TURN_START + 8_000 }],
      [
        { name: 'report.md', path: 'report.md', kind: 'text', mtime: TURN_START + 8_000 },
        { name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 5_000 },
      ],
      { turnStartedAt: TURN_START },
    );

    expect(result).toBe('index.html');
  });

  it('ignores files untouched since the turn started', () => {
    const result = selectAutoOpenTurnArtifact(
      [],
      [
        { name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START - 90_000 },
        { name: 'notes.txt', path: 'notes.txt', kind: 'text', mtime: TURN_START + 5_000 },
      ],
      { turnStartedAt: TURN_START },
    );

    expect(result).toBeNull();
  });

  it('tolerates filesystem mtime precision right at the turn boundary', () => {
    const result = selectAutoOpenTurnArtifact(
      [],
      [{ name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START - 900 }],
      { turnStartedAt: TURN_START },
    );

    expect(result).toBe('index.html');
  });

  it('excludes user sketches, dotfiles, and directories from turn attribution', () => {
    const result = selectAutoOpenTurnArtifact(
      [],
      [
        { name: 'page.sketch.json', path: 'page.sketch.json', kind: 'text', mtime: TURN_START + 5_000 },
        { name: '.cache/index.html', path: '.cache/index.html', kind: 'html', mtime: TURN_START + 5_000 },
        { name: 'assets', path: 'assets', type: 'dir', mtime: TURN_START + 5_000 },
      ],
      { turnStartedAt: TURN_START },
    );

    expect(result).toBeNull();
  });

  it('falls back to produced-only selection without a turn start stamp', () => {
    const result = selectAutoOpenTurnArtifact(
      [],
      [{ name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 5_000 }],
      {},
    );

    expect(result).toBeNull();
  });

  it('honors preferSiteEntry across rewritten site files', () => {
    const result = selectAutoOpenTurnArtifact(
      [],
      [
        { name: 'about.html', path: 'about.html', kind: 'html', mtime: TURN_START + 9_000 },
        { name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 5_000 },
      ],
      { turnStartedAt: TURN_START, preferSiteEntry: true },
    );

    expect(result).toBe('index.html');
  });

  describe('agentTouchedFileNames (write-event protocols)', () => {
    it('does not steal focus toward a user-autosaved plan on a text-only turn', () => {
      // Plan mode: the user edits plan.md in the split editor (autosave on)
      // while the agent answers a clarification in text only. plan.md's mtime
      // lands inside the turn window from the user's own keystrokes — with
      // the agent's touched set known and empty of plan.md, it must not win.
      const result = selectAutoOpenTurnArtifact(
        [],
        [{ name: 'plan.md', path: 'plan.md', kind: 'text', mtime: TURN_START + 5_000 }],
        { turnStartedAt: TURN_START, agentTouchedFileNames: new Set(['notes.md']) },
      );

      expect(result).toBeNull();
    });

    it('keeps the rewritten HTML the agent actually touched and drops the user edit', () => {
      const result = selectAutoOpenTurnArtifact(
        [],
        [
          { name: 'plan.md', path: 'plan.md', kind: 'text', mtime: TURN_START + 9_000 },
          { name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 5_000 },
        ],
        { turnStartedAt: TURN_START, agentTouchedFileNames: new Set(['index.html']) },
      );

      expect(result).toBe('index.html');
    });

    it('falls back to the pure time window when the touched set is empty (no-event protocols)', () => {
      // codex/gemini/opencode/ACP agents emit no Write tool events, so the
      // touched set is empty — the mtime window is the only signal and must
      // keep attributing the in-place rewrite.
      const result = selectAutoOpenTurnArtifact(
        [],
        [{ name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 5_000 }],
        { turnStartedAt: TURN_START, agentTouchedFileNames: new Set() },
      );

      expect(result).toBe('index.html');
    });

    it('does not restrict newly produced files by the touched set', () => {
      // The produced list is a file-NAME diff — those files are new this
      // turn and already attributed; the touched restriction only applies to
      // pre-existing files entering via the mtime window.
      const result = selectAutoOpenTurnArtifact(
        [{ name: 'report.md', path: 'report.md', kind: 'text', mtime: TURN_START + 5_000 }],
        [{ name: 'report.md', path: 'report.md', kind: 'text', mtime: TURN_START + 5_000 }],
        { turnStartedAt: TURN_START, agentTouchedFileNames: new Set(['index.html']) },
      );

      expect(result).toBe('report.md');
    });
  });

  describe('turnEndedAt (window upper bound)', () => {
    const TURN_END = TURN_START + 30_000;

    it('ignores a file the user edited after the turn ended', () => {
      // Reload/reattach recovery runs long after the turn: the user's
      // post-turn plan.md edit must not be attributed to the agent.
      const result = selectAutoOpenTurnArtifact(
        [],
        [{ name: 'plan.md', path: 'plan.md', kind: 'text', mtime: TURN_END + 120_000 }],
        { turnStartedAt: TURN_START, turnEndedAt: TURN_END },
      );

      expect(result).toBeNull();
    });

    it('keeps a write that settles just after the terminal status (grace)', () => {
      const result = selectAutoOpenTurnArtifact(
        [],
        [{ name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_END + 30_000 }],
        { turnStartedAt: TURN_START, turnEndedAt: TURN_END },
      );

      expect(result).toBe('index.html');
    });

    it('keeps the window open-ended when no end stamp is available', () => {
      const result = selectAutoOpenTurnArtifact(
        [],
        [{ name: 'index.html', path: 'index.html', kind: 'html', mtime: TURN_START + 900_000 }],
        { turnStartedAt: TURN_START },
      );

      expect(result).toBe('index.html');
    });
  });
});
