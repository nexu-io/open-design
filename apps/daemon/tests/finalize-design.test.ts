// @ts-nocheck
// Tests for `apps/daemon/src/finalize-design.ts` — fills in across phases
// D-I. Phase C scaffold sets up the file shape only; real test bodies
// land in subsequent commits.
//
// Per memory `project_open_design_493_merged.md`: this file uses
// `import fs from 'node:fs'` (default import) so `vi.spyOn(fs, '<fn>')`
// can redefine properties on the underlying CJS exports object. ESM
// namespace import (`import * as fs from 'node:fs'`) gives a frozen
// Module Namespace Object that `vi.spyOn` cannot mutate.

import { describe, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
} from '../src/finalize-design.js';

// Touch the imports so the unused-import linter stays quiet on the scaffold.
void fs;
void os;
void path;
void finalizeDesignPackage;
void FinalizePackageLockedError;
void FinalizeUpstreamError;

describe.skip('finalizeDesignPackage (phase C scaffold — bodies in phases D-I)', () => {
  it('placeholder', () => {
    /* phases D-I add real cases here */
  });
});
