// Plan G4 — Phase 2B router contract for the marketplace routes.

import { describe, expect, it } from 'vitest';
import { buildPath, parseRoute, type Route } from '../src/router';

describe('router /marketplace', () => {
  it('parses /marketplace as the catalog grid route', () => {
    expect(parseRoute('/marketplace')).toEqual({ kind: 'marketplace' });
    expect(parseRoute('/marketplace/')).toEqual({ kind: 'marketplace' });
  });

  it('parses /marketplace/<pluginId> as a detail route', () => {
    expect(parseRoute('/marketplace/sample-plugin')).toEqual({
      kind: 'marketplace-detail',
      pluginId: 'sample-plugin',
    });
  });

  it('parses /plugins as the entry-shell plugins tab', () => {
    expect(parseRoute('/plugins')).toEqual({ kind: 'home', view: 'plugins' });
    expect(parseRoute('/plugins/')).toEqual({ kind: 'home', view: 'plugins' });
  });

  it('parses /plugins/<pluginId> as the same detail route (alias)', () => {
    expect(parseRoute('/plugins/sample-plugin')).toEqual({
      kind: 'marketplace-detail',
      pluginId: 'sample-plugin',
    });
  });

  it('round-trips through buildPath', () => {
    for (const route of [
      { kind: 'marketplace' } as Route,
      { kind: 'marketplace-detail', pluginId: 'sample-plugin' } as Route,
    ]) {
      expect(parseRoute(buildPath(route))).toEqual(route);
    }
  });

  it('does not break the home / project routes', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home', view: 'home' });
    expect(parseRoute('/projects/abc')).toEqual({
      kind: 'project',
      projectId: 'abc',
      conversationId: null,
      fileName: null,
    });
  });
});

describe('router entry sub-views', () => {
  it('parses /projects (no id) as the projects entry view', () => {
    expect(parseRoute('/projects')).toEqual({ kind: 'home', view: 'projects' });
    expect(parseRoute('/projects/')).toEqual({ kind: 'home', view: 'projects' });
  });

  it('parses /design-systems as the design-systems entry view', () => {
    expect(parseRoute('/design-systems')).toEqual({ kind: 'home', view: 'design-systems' });
  });

  it('parses /automations as the automations entry view', () => {
    expect(parseRoute('/automations')).toEqual({ kind: 'home', view: 'tasks' });
  });

  it('keeps /tasks as an alias for older links', () => {
    expect(parseRoute('/tasks')).toEqual({ kind: 'home', view: 'tasks' });
  });

  it('still parses /projects/<id> as a project detail route', () => {
    expect(parseRoute('/projects/abc')).toEqual({
      kind: 'project',
      projectId: 'abc',
      conversationId: null,
      fileName: null,
    });
  });

  it('round-trips entry sub-views through buildPath', () => {
    for (const route of [
      { kind: 'home', view: 'home' } as Route,
      { kind: 'home', view: 'projects' } as Route,
      { kind: 'home', view: 'tasks' } as Route,
      { kind: 'home', view: 'plugins' } as Route,
      { kind: 'home', view: 'design-systems' } as Route,
      { kind: 'home', view: 'integrations' } as Route,
    ]) {
      expect(parseRoute(buildPath(route))).toEqual(route);
    }
  });
});
