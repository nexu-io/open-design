/**
 * The direct-edit prompt path is only safe when there is something to edit.
 * These tests pin the guard that keeps "add a pricing section" on the normal
 * build workflow in an empty project.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { projectHasEditableArtifact } from '../../src/artifacts/project-artifact-presence.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-artifact-presence-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('projectHasEditableArtifact', () => {
  it('finds an HTML artifact at the project root', () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
    expect(projectHasEditableArtifact(root)).toBe(true);
  });

  it('finds an artifact nested one level down', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'screens'));
    fs.writeFileSync(path.join(root, 'screens', 'checkout.html'), '<html></html>');
    expect(projectHasEditableArtifact(root)).toBe(true);
  });

  it('answers false for an empty project', () => {
    expect(projectHasEditableArtifact(makeRoot())).toBe(false);
  });

  it('ignores dependency and build directories', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.html'), '<html></html>');
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist', 'out.html'), '<html></html>');
    expect(projectHasEditableArtifact(root)).toBe(false);
  });

  it('ignores hidden working directories', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, '.od-skills', 'seed'), { recursive: true });
    fs.writeFileSync(path.join(root, '.od-skills', 'seed', 'template.html'), '<html></html>');
    expect(projectHasEditableArtifact(root)).toBe(false);
  });

  it('answers false for a missing root instead of throwing', () => {
    expect(projectHasEditableArtifact(path.join(os.tmpdir(), 'od-missing-root-xyz'))).toBe(false);
    expect(projectHasEditableArtifact('')).toBe(false);
  });
});
