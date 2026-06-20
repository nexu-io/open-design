import { describe, expect, it } from 'vitest';

import {
  isTextSnapshotPath,
  scoreDesignFile,
  shouldSkipRepoPath,
} from '../../src/tools-connectors-cli.js';

describe('shouldSkipRepoPath', () => {
  it('skips editor / CI / agent-tooling directories', () => {
    expect(shouldSkipRepoPath('.vscode/settings.json')).toBe(true);
    expect(shouldSkipRepoPath('.zed/tasks.json')).toBe(true);
    expect(shouldSkipRepoPath('.zenflow/tasks/cleanup/spec.md')).toBe(true);
    expect(shouldSkipRepoPath('.idea/workspace.xml')).toBe(true);
    expect(shouldSkipRepoPath('.github/workflows/ci.yml')).toBe(true);
  });

  it('keeps real source directories', () => {
    expect(shouldSkipRepoPath('sources/stackme/theme/colorsystem.swift')).toBe(false);
    expect(shouldSkipRepoPath('stackme/views/projectlist.swift')).toBe(false);
  });
});

describe('scoreDesignFile (non-web source)', () => {
  it('ranks Swift token source far above tooling config files', () => {
    const colorSystem = scoreDesignFile('Sources/StackMe/Theme/ColorSystem.swift');
    const typography = scoreDesignFile('Sources/StackMe/Theme/Typography.swift');
    const view = scoreDesignFile('Sources/StackMe/Views/ProjectList.swift');
    const tooling = scoreDesignFile('.zenflow/tasks/cleanup/spec.md');

    // Tooling dirs are skipped outright.
    expect(tooling).toBe(-1);
    // Token source is high-signal; plain source still beats the skipped config.
    expect(colorSystem).toBeGreaterThan(view);
    expect(typography).toBeGreaterThan(view);
    expect(view).toBeGreaterThan(0);
    expect(view).toBeGreaterThan(tooling);
  });
});

describe('isTextSnapshotPath', () => {
  it('writes native source snapshots, not just web files', () => {
    // Without this a selected Swift file was dropped at write time, so the
    // import produced zero snapshots and publishing stayed blocked.
    expect(isTextSnapshotPath('utilities/colorsystem.swift')).toBe(true);
    expect(isTextSnapshotPath('app/main.kt')).toBe(true);
    expect(isTextSnapshotPath('src/theme.css')).toBe(true);
    expect(isTextSnapshotPath('assets/logo.png')).toBe(false);
  });
});
