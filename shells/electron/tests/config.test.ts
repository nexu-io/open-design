import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PACKAGED_NAMESPACE_BASE_ROOT_ENV,
  PACKAGED_STANDALONE_METADATA_URL_ENV,
  resolveDefaultPackagedNodeCommandRelative,
  resolvePackagedAmrProfile,
  resolvePackagedNamespaceBaseRoot,
  resolvePackagedStandaloneMetadataUrl,
  resolvePackagedStandaloneReleaseVersion,
} from '../src/config.js';

describe('resolveDefaultPackagedNodeCommandRelative', () => {
  it('uses the native Node executable name without changing the shared resource layout', () => {
    expect(resolveDefaultPackagedNodeCommandRelative('win32')).toBe(join('open-design', 'bin', 'node.exe'));
    expect(resolveDefaultPackagedNodeCommandRelative('darwin')).toBe(join('open-design', 'bin', 'node'));
  });
});

describe('resolvePackagedNamespaceBaseRoot', () => {
  it('lets a historical handoff preserve the already-resolved namespace base root', () => {
    const inheritedRoot = join('C:', 'tools-pack', 'runtime', 'namespaces');
    const bakedRoot = join('C:', 'Users', 'Nexu', 'AppData', 'Roaming', 'Open Design', 'namespaces');

    expect(resolvePackagedNamespaceBaseRoot(bakedRoot, join('C:', 'fallback'), {
      [PACKAGED_NAMESPACE_BASE_ROOT_ENV]: inheritedRoot,
    })).toBe(resolve(inheritedRoot));
  });

  it('falls back to the payload config and then Electron userData', () => {
    const bakedRoot = join('C:', 'packaged', 'namespaces');
    const userDataRoot = join('C:', 'user-data');

    expect(resolvePackagedNamespaceBaseRoot(bakedRoot, userDataRoot, {})).toBe(resolve(bakedRoot));
    expect(resolvePackagedNamespaceBaseRoot(undefined, userDataRoot, {})).toBe(
      join(userDataRoot, 'namespaces'),
    );
  });
});

describe('resolvePackagedAmrProfile', () => {
  it('accepts a whitespace-trimmed feature-test profile', () => {
    expect(resolvePackagedAmrProfile(' feature-test ')).toBe('feature-test');
  });

  it('maps empty values to null', () => {
    expect(resolvePackagedAmrProfile(undefined)).toBeNull();
    expect(resolvePackagedAmrProfile('   ')).toBeNull();
  });

  it('rejects unsupported profiles', () => {
    expect(() => resolvePackagedAmrProfile('staging')).toThrow(
      'unsupported packaged AMR profile; expected prod, test, feature-test, or local: staging',
    );
  });
});

describe('resolvePackagedStandaloneMetadataUrl', () => {
  it('keeps an outer Shell updater override from replacing the configured Closure feed', () => {
    expect(resolvePackagedStandaloneMetadataUrl('https://releases.example/beta/latest/metadata.json', {
      OD_UPDATE_METADATA_URL: 'http://127.0.0.1:43199/metadata.json',
    })).toBe('https://releases.example/beta/latest/metadata.json');
  });

  it('allows public immutable acceptance to override the Closure feed explicitly', () => {
    expect(resolvePackagedStandaloneMetadataUrl('https://releases.example/beta/latest/metadata.json', {
      [PACKAGED_STANDALONE_METADATA_URL_ENV]: ' https://releases.example/beta/versions/0.19.0-beta.32/metadata.json ',
    })).toBe('https://releases.example/beta/versions/0.19.0-beta.32/metadata.json');
  });
});

describe('resolvePackagedStandaloneReleaseVersion', () => {
  it('keeps an explicitly pinned release without requesting metadata', async () => {
    let requested = false;
    const fetchImpl = (async () => {
      requested = true;
      throw new Error('unexpected request');
    }) as typeof fetch;

    await expect(resolvePackagedStandaloneReleaseVersion(
      ' 0.19.1-beta.6 ',
      'https://releases.example/beta/latest/metadata.json',
      fetchImpl,
    )).resolves.toBe('0.19.1-beta.6');
    expect(requested).toBe(false);
  });

  it('resolves an unbound reusable Shell from public release metadata', async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://releases.example/beta/latest/metadata.json');
      return new Response(JSON.stringify({ releaseVersion: '0.19.1-beta.7' }), { status: 200 });
    }) as typeof fetch;

    await expect(resolvePackagedStandaloneReleaseVersion(
      null,
      'https://releases.example/beta/latest/metadata.json',
      fetchImpl,
    )).resolves.toBe('0.19.1-beta.7');
  });

  it('fails closed when neither a pin nor usable metadata exists', async () => {
    await expect(resolvePackagedStandaloneReleaseVersion(null, null)).rejects.toThrow(
      'Standalone release version and metadata URL are unavailable',
    );
    const fetchImpl = (async () => new Response(JSON.stringify({ releaseVersion: 7 }), { status: 200 })) as typeof fetch;
    await expect(resolvePackagedStandaloneReleaseVersion(
      null,
      'https://releases.example/beta/latest/metadata.json',
      fetchImpl,
    )).rejects.toThrow('Standalone release metadata does not declare releaseVersion');
  });
});
