import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchLatestStableRelease } from '../app/_lib/github.ts';
import { RELEASE_METADATA_UPSTREAM_URL } from '../app/_lib/release-metadata.ts';

function completeStableMetadata() {
  return {
    channel: 'stable',
    releaseState: 'complete',
    releaseVersion: '0.18.0',
    versionTag: 'open-design-v0.18.0',
    generatedAt: '2026-08-05T17:31:11.878Z',
    platforms: {
      mac: {
        artifacts: {
          dmg: {
            name: 'open-design-0.18.0-mac-arm64.dmg',
            size: 300_329_080,
            url: 'https://releases.open-design.ai/stable/versions/0.18.0/open-design-0.18.0-mac-arm64.dmg',
          },
        },
      },
      macIntel: {
        artifacts: {
          dmg: {
            name: 'open-design-0.18.0-mac-x64.dmg',
            size: 310_378_496,
            url: 'https://releases.open-design.ai/stable/versions/0.18.0/open-design-0.18.0-mac-x64.dmg',
          },
        },
      },
      win: {
        artifacts: {
          installer: {
            name: 'open-design-0.18.0-win-x64-setup.exe',
            size: 326_107_136,
            url: 'https://releases.open-design.ai/stable/versions/0.18.0/open-design-0.18.0-win-x64-setup.exe',
          },
        },
      },
    },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('download build snapshot comes from one complete stable R2 manifest', async () => {
  const requestedUrls: string[] = [];
  const release = await fetchLatestStableRelease(async (input) => {
    requestedUrls.push(String(input));
    return jsonResponse(completeStableMetadata());
  });

  assert.deepEqual(requestedUrls, [RELEASE_METADATA_UPSTREAM_URL]);
  assert.equal(release.versionLabel, 'v0.18.0');
  assert.equal(release.tagName, 'open-design-v0.18.0');
  assert.equal(release.publishedAt, '2026-08-05T17:31:11.878Z');
  assert.match(release.matrix.macArm64Dmg?.url ?? '', /stable\/versions\/0\.18\.0\//);
  assert.match(release.matrix.macX64Dmg?.url ?? '', /stable\/versions\/0\.18\.0\//);
  assert.match(release.matrix.winSetup?.url ?? '', /stable\/versions\/0\.18\.0\//);
});

test('download build rejects a partial stable R2 manifest', async () => {
  await assert.rejects(
    fetchLatestStableRelease(async () => new Response(JSON.stringify({
      channel: 'stable',
      releaseState: 'partial',
      releaseVersion: '0.19.0',
      platforms: {},
    }), { status: 200 })),
    /not complete/,
  );
});

test('download build rejects a complete manifest without the required desktop installers', async () => {
  await assert.rejects(
    fetchLatestStableRelease(async () => new Response(JSON.stringify({
      channel: 'stable',
      releaseState: 'complete',
      releaseVersion: '0.19.0',
      versionTag: 'open-design-v0.19.0',
      platforms: {},
    }), { status: 200 })),
    /required desktop installers/,
  );
});

test('download build rejects installer URLs from a different stable version', async () => {
  const metadata = completeStableMetadata();
  metadata.platforms.mac.artifacts.dmg.url =
    'https://releases.open-design.ai/stable/versions/0.17.0/open-design-0.17.0-mac-arm64.dmg';

  await assert.rejects(
    fetchLatestStableRelease(async () => jsonResponse(metadata)),
    /does not match release version 0\.18\.0/,
  );
});

test('download build rejects a release tag from a different stable version', async () => {
  const metadata = completeStableMetadata();
  metadata.versionTag = 'open-design-v0.17.0';

  await assert.rejects(
    fetchLatestStableRelease(async () => jsonResponse(metadata)),
    /release tag does not match version 0\.18\.0/,
  );
});
