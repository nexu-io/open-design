import { describe, expect, it } from 'vitest';
import {
  projectPoweredPreviewHostname,
  projectPoweredPreviewOriginDecision,
} from '../../src/http/powered-preview-origin.js';

const port = 17456;
const hostname = projectPoweredPreviewHostname('project-a');
const host = `${hostname}:${port}`;
const origin = `http://${host}`;
const path = '/api/projects/project-a/powered/nested/worker.js';
const request = {
  method: 'GET',
  path,
  headers: { host, referer: `${origin}/api/projects/project-a/powered/index.html`, 'sec-fetch-site': 'same-origin' },
};

describe('project powered preview origins', () => {
  it('uses the same stable SHA256 hostname as the browser', () => {
    expect(hostname).toBe('od-0e3ffbf31db2e5b45f9fe42abf9ae60d.localhost');
    expect(projectPoweredPreviewHostname('project-b')).not.toBe(hostname);
  });

  it('permits navigation from the app and same-project worker/resource reads', () => {
    expect(projectPoweredPreviewOriginDecision(request, port)).toBe('allow');
    expect(projectPoweredPreviewOriginDecision({ ...request, headers: { host, origin } }, port)).toBe('allow');
    expect(projectPoweredPreviewOriginDecision({
      ...request,
      headers: { host, referer: 'http://127.0.0.1:3000/', 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'iframe' },
    }, port)).toBe('allow');
  });

  it.each([
    { method: 'POST', path },
    { method: 'OPTIONS', path },
    { method: 'GET', path: '/api/projects/project-b/powered/index.html' },
    { method: 'GET', path: '/api/projects/project-a/raw/index.html' },
    { method: 'GET', path: '/api/projects' },
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/live-artifacts/artifact/preview' },
    { method: 'GET', path: '/api/library/clipper-probe' },
    { method: 'GET', path: '/api/projects/%zz/powered/index.html' },
    { method: 'GET', path: '/artifacts/private.png' },
    { method: 'GET', path: '/frames/index.html' },
    { method: 'GET', path: '/projects/project-a/powered/index.html' },
    { method: 'GET', path: '/' },
  ])('rejects $method $path on the reserved project host', (route) => {
    expect(projectPoweredPreviewOriginDecision({ ...request, ...route }, port)).toBe('reject');
  });

  it('rejects malformed project hosts, a wrong port, and unresolved server identity', () => {
    expect(projectPoweredPreviewOriginDecision({ ...request, headers: { host: `od-unknown.localhost:${port}` } }, port)).toBe('reject');
    expect(projectPoweredPreviewOriginDecision(request, port + 1)).toBe('reject');
    expect(projectPoweredPreviewOriginDecision(request, null)).toBe('reject');
  });

  it.each([
    { origin: 'null' },
    { origin: 'https://foreign.example' },
    { origin: 'http://127.0.0.1:17456' },
    { origin: `http://${projectPoweredPreviewHostname('project-b')}:${port}` },
    { referer: `http://${projectPoweredPreviewHostname('project-b')}:${port}/api/projects/project-b/powered/index.html` },
    { referer: 'https://foreign.example/', 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'script' },
    { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'empty' },
  ])('rejects wrong-origin subresources %#', (source) => {
    expect(projectPoweredPreviewOriginDecision({ ...request, headers: { host, ...source } }, port)).toBe('reject');
  });

  it('rejects preview API reads through the normal daemon host with or without Origin', () => {
    expect(projectPoweredPreviewOriginDecision({ method: 'GET', path: '/api/projects', headers: { host: `127.0.0.1:${port}`, origin } }, port)).toBe('reject');
    expect(projectPoweredPreviewOriginDecision({ ...request, path: '/api/projects', headers: { ...request.headers, host: `127.0.0.1:${port}` } }, port)).toBe('reject');
  });

  it('leaves the normal and legacy loopback origins to their existing guard', () => {
    expect(projectPoweredPreviewOriginDecision({ ...request, headers: { host: `127.0.0.1:${port}` } }, port)).toBeNull();
    expect(projectPoweredPreviewOriginDecision({ ...request, headers: { host: `localhost:${port}`, referer: `http://localhost:${port}/api/projects/project-a/powered/index.html` } }, port)).toBeNull();
  });
});
