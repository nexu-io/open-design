import { describe, expect, it } from 'vitest';
import {
  APP_VERSION_FALLBACK,
  isPackagedRuntime,
  resolveAppVersionInfo,
} from '../src/app-version.js';

describe('app version helpers', () => {
  it('resolves version info from package metadata', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '1.2.3' },
      env: {},
      resourcesPath: undefined,
      execPath: '/usr/local/bin/node',
      platform: 'linux',
      arch: 'x64',
    })).toEqual({
      version: '1.2.3',
      channel: 'development',
      packaged: false,
      platform: 'linux',
      arch: 'x64',
    });
  });

  it('uses a safe fallback when package metadata is missing', () => {
    expect(resolveAppVersionInfo({ packageMetadata: null, env: {} }).version).toBe(APP_VERSION_FALLBACK);
  });

  it('detects packaged runtimes without sidecar protocol knowledge', () => {
    expect(isPackagedRuntime({ resourcesPath: '/Applications/Open Design.app/Contents/Resources' })).toBe(true);
    expect(isPackagedRuntime({
      execPath: '/Applications/Open Design.app/Contents/Resources/open-design/bin/node',
      platform: 'darwin',
    })).toBe(true);
    expect(isPackagedRuntime({
      execPath: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Open Design\\resources\\open-design\\bin\\node.exe',
      platform: 'win32',
    })).toBe(true);
    expect(isPackagedRuntime({
      execPath: '/opt/Open Design/resources/open-design/bin/node',
      platform: 'linux',
    })).toBe(true);
    expect(isPackagedRuntime({ execPath: '/usr/local/bin/node', platform: 'linux' })).toBe(false);
  });

  it('honors an explicit release channel', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '1.2.3' },
      env: { OD_RELEASE_CHANNEL: 'beta' },
    }).channel).toBe('beta');
  });

  it('infers prerelease channel from semver metadata', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.1.0-beta.6' },
      env: {},
    }).channel).toBe('beta');
  });
});
