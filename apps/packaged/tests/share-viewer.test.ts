import { describe, expect, it } from 'vitest';

import { resolvePackagedShareViewerEnv } from '../src/share-viewer.js';
import { buildPackagedDaemonSpawnEnv } from '../src/sidecars.js';
import type { PackagedNamespacePaths } from '../src/paths.js';

function fakePaths(): PackagedNamespacePaths {
  return {
    cacheRoot: '/tmp/od-pkg/cache',
    dataRoot: '/tmp/od-pkg/data',
    desktopLogPath: '/tmp/od-pkg/logs/desktop/latest.log',
    desktopLogsRoot: '/tmp/od-pkg/logs/desktop',
    electronSessionDataRoot: '/tmp/od-pkg/user-data/session',
    electronUserDataRoot: '/tmp/od-pkg/user-data',
    installationRoot: '/tmp/od-pkg/..',
    installerObservationRoot: '/tmp/od-pkg/data/observations/installer',
    logsRoot: '/tmp/od-pkg/logs',
    namespaceRoot: '/tmp/od-pkg',
    resourceRoot: '/tmp/od-pkg/resources',
    runtimeRoot: '/tmp/od-pkg/runtime',
    updateRoot: '/tmp/od-pkg/updates',
  };
}

function spawnEnv(shareViewerLaunchEnv: NodeJS.ProcessEnv = {}) {
  return buildPackagedDaemonSpawnEnv(fakePaths(), {
    appVersion: null,
    daemonCliEntry: null,
    requireDesktopAuth: false,
    shareViewerLaunchEnv,
  });
}

describe('packaged share Viewer origin propagation', () => {
  // AMR reports the share address for every publication, so no packaged
  // channel carries a built-in Viewer origin any more.
  it('hands the daemon no Viewer origin by default so AMR is the single source', () => {
    const env = spawnEnv();
    expect(env).not.toHaveProperty('OD_SHARE_VIEWER_URL');
    expect(env).not.toHaveProperty('OD_SHARE_VIEWER_URLS');
  });

  it('forwards an explicit launch OD_SHARE_VIEWER_URL override trimmed', () => {
    const env = spawnEnv({ OD_SHARE_VIEWER_URL: ' https://viewer.example.test ' });
    expect(env.OD_SHARE_VIEWER_URL).toBe('https://viewer.example.test');
    expect(env).not.toHaveProperty('OD_SHARE_VIEWER_URLS');
  });

  it('forwards an explicit launch OD_SHARE_VIEWER_URLS map unchanged', () => {
    const map = JSON.stringify({ test: 'https://viewer.example.test' });
    const env = spawnEnv({ OD_SHARE_VIEWER_URLS: map });
    expect(env.OD_SHARE_VIEWER_URLS).toBe(map);
    expect(env).not.toHaveProperty('OD_SHARE_VIEWER_URL');
  });

  it('forwards launch values verbatim and leaves validation to the daemon resolver', () => {
    const env = spawnEnv({ OD_SHARE_VIEWER_URL: 'http://viewer.example.test' });
    expect(env.OD_SHARE_VIEWER_URL).toBe('http://viewer.example.test');
  });

  it('forwards both launch values unchanged when both are set', () => {
    const map = JSON.stringify({ prod: 'https://map.example.test' });
    const env = spawnEnv({ OD_SHARE_VIEWER_URL: 'https://single.example.test', OD_SHARE_VIEWER_URLS: map });
    expect(env.OD_SHARE_VIEWER_URL).toBe('https://single.example.test');
    expect(env.OD_SHARE_VIEWER_URLS).toBe(map);
  });

  it('treats blank launch values as unset', () => {
    expect(resolvePackagedShareViewerEnv({ OD_SHARE_VIEWER_URL: '  ', OD_SHARE_VIEWER_URLS: '' })).toEqual({});
  });
});
