import assert from 'node:assert/strict';
import { openAsBlob } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './test-package.mjs';

const directory = path.resolve(process.argv[2]);
const origin = new URL(process.env.FORGEJO_SERVER_URL || 'https://code.powerformer.net');
assert.equal(origin.origin, 'https://code.powerformer.net');
const repo = process.env.FORGEJO_REPOSITORY || 'core/open-motion';
assert.equal(repo, 'core/open-motion');
assert(process.env.FORGEJO_TOKEN, 'A repository-scoped publishing token is required');
const headers = { Authorization: `token ${process.env.FORGEJO_TOKEN}` };
const apiRoot = `${origin.origin}/api/v1/repos/${repo}/releases`;
async function api(url, method = 'GET', data) {
  const response = await fetch(url, { method, headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined, redirect: 'error' });
  if (response.status === 404) return null;
  assert(response.ok, `Release API ${method}: HTTP ${response.status}`);
  return response.json();
}
const names = await readdir(directory);
const manifests = await Promise.all(names.filter(name => /^release-(mac-arm64|win-x64)\.json$/.test(name)).map(async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
assert(manifests.length > 0, 'No platform manifests');
const expected = { both: ['mac-arm64', 'win-x64'], mac: ['mac-arm64'], windows: ['win-x64'] }[process.env.TEST_PACKAGE_PLATFORMS || 'both'];
assert.deepEqual(manifests.map(manifest => manifest.target).sort(), expected, 'All requested platforms must pass before publishing');
const first = manifests[0];
const acceptance = new Map();
for (const manifest of manifests) {
  assert.equal(manifest.version, first.version); assert.equal(manifest.commit, first.commit);
  assert.match(manifest.version, /^\d+\.\d+\.\d+-beta\.\d+\.\d+$/);
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].name, `OpenMotion-Codex-${manifest.version}-${manifest.target}.zip`);
  assert.equal(await readFile(path.join(directory, manifest.files[0].name + '.sha256'), 'utf8'), `${manifest.files[0].sha256}  ${manifest.files[0].name}\n`);
  assert.equal(await sha256(path.join(directory, manifest.files[0].name)), manifest.files[0].sha256, 'Final ZIP must match its manifest');
  let smoke;
  try { smoke = JSON.parse(await readFile(path.join(directory, `smoke-${manifest.target}.json`), 'utf8')); }
  catch (error) {
    // shortcut: no Mac CI runner; internal test packages disclose pending Mac acceptance until one is available.
    if (error.code !== 'ENOENT' || manifest.target !== 'mac-arm64' || process.env.ALLOW_PENDING_MAC !== 'true') throw error;
  }
  if (smoke) {
    assert.equal(smoke.realVideo, 'passed'); assert.equal(smoke.commit, manifest.commit);
    assert.equal(smoke.version, manifest.version); assert.equal(smoke.target, manifest.target);
    assert.equal(smoke.sha256, manifest.files[0].sha256);
  }
  acceptance.set(manifest.target, smoke ? 'passed' : 'pending');
}
const tag = `openmotion-v${first.version}`;
const sizes = await Promise.all(manifests.map(async manifest => {
  const file = manifest.files[0], bytes = (await stat(path.join(directory, file.name))).size;
  return `| ${manifest.target} | ${(bytes / 1048576).toFixed(2)} MiB | ${bytes.toLocaleString('en-US')} |`;
}));
const sizeSummary = `完整插件包已包含 Studio、Node、浏览器、FFmpeg 和生产依赖。ZIP 使用外链分发，附件列表可能显示 0 B；实际文件大小如下。\n\n| 平台 | 实际大小 | 字节数 |\n| --- | ---: | ---: |\n${sizes.join('\n')}\n\n`;
let release = await api(`${apiRoot}/tags/${tag}`);
if (!release) release = await api(apiRoot, 'POST', { tag_name: tag, target_commitish: first.commit, name: `OpenMotion ${first.version} · internal test`, draft: true, prerelease: true,
  body: sizeSummary + `Internal Codex test packages. Commit: ${first.commit}. See release.json and available platform smoke reports. Mac acceptance: ${acceptance.get('mac-arm64') || 'not included'}. macOS arm64 requires 26.0+; Windows x64 requires Windows 11. No stable channel promotion.` });
assert(release && release.tag_name === tag && release.prerelease, 'Never replace a stable release');
const combined = { artifactRetentionDays: 90, schemaVersion: 1, version: first.version, channel: 'prerelease', commit: first.commit, run: first.run, attempt: first.attempt,
  platforms: manifests.map(({ target, minimumOS, runtime }) => ({ target, minimumOS, runtime, nativeAcceptance: acceptance.get(target) })), files: manifests.flatMap(manifest => manifest.files) };
await writeFile(path.join(directory, 'release.json'), JSON.stringify(combined, null, 2) + '\n');
const publishFiles = ['release.json', ...manifests.flatMap(manifest => [manifest.files[0].name, manifest.files[0].name + '.sha256', `release-${manifest.target}.json`, ...(acceptance.get(manifest.target) === 'passed' ? [`smoke-${manifest.target}.json`] : [])])];
for (const name of publishFiles) {
  const filename = path.join(directory, name), existing = release.assets.find(asset => asset.name === name);
  if (existing) {
    let url = new URL(existing.browser_download_url), response;
    for (let redirects = 0; redirects <= 5; redirects++) {
      assert.equal(url.origin, origin.origin, 'Private release files must remain on the code host');
      response = await fetch(url, { headers, redirect: 'manual' });
      if (response.status < 300 || response.status > 399) break;
      const location = response.headers.get('location'); await response.body?.cancel();
      assert(location && redirects < 5, 'Invalid release file redirect');
      url = new URL(location, url);
    }
    assert(response.ok, `Cannot verify existing ${name}`);
    const { createHash } = await import('node:crypto'); const hash = createHash('sha256');
    for await (const chunk of response.body) hash.update(chunk);
    assert.equal(hash.digest('hex'), await sha256(filename), `Existing ${name} differs; publish a new beta number`);
    continue;
  }
  assert(release.draft, 'A published version cannot gain new files');
  const body = new FormData();
  if (name.endsWith('.zip')) {
    const artifact = JSON.parse(await readFile(filename + '.artifact.json', 'utf8'));
    assert.equal(artifact.name, name); assert.equal(artifact.sha256, await sha256(filename));
    assert(/^\d+$/.test(artifact.id), 'Missing raw artifact ID');
    body.append('external_url', `${origin.origin}/api/v1/repos/${repo}/actions/artifacts/${artifact.id}/zip`);
  } else body.append('attachment', await openAsBlob(filename), name);
  const response = await fetch(`${apiRoot}/${release.id}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers, body, redirect: 'error' });
  assert(response.ok, `Upload ${name}: HTTP ${response.status}`);
  const asset = await response.json(); assert.equal(asset.name, name, 'Release must retain the exact package filename'); release.assets.push(asset);
}
if (release.draft) release = await api(`${apiRoot}/${release.id}`, 'PATCH', { draft: false });
console.log(JSON.stringify({ release: release.html_url, version: first.version, commit: first.commit, files: release.assets.map(asset => asset.name), mirror: 'pending integration' }, null, 2));
