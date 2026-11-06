import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { executable, extractArchive, nativeComponents, obtainAsset, readJSON, relativePath, runFile, withLock } from './runtime-assets.mjs';

export async function nativeConfiguration(root) {
  const config = await readJSON(path.join(root, '.npm-install.json'));
  if (!config) return null;
  assert.equal(config.schemaVersion, 1, 'Unsupported npm installation');
  const found = Object.entries(config.runtime.targets).find(([, value]) => value.platform === process.platform && value.arch === process.arch);
  assert(found, `No pinned native runtime for ${process.platform}-${process.arch}`);
  const [target, info] = found;
  assert(/^[a-z0-9-]+$/.test(target), 'Invalid native target');
  const components = nativeComponents(info);
  for (const component of components) assert(/^[a-f0-9]{64}$/.test(info[component]?.sha256), 'Require a pinned native SHA256');
  assert(path.isAbsolute(config.cacheDirectory), 'Native cache must be absolute');
  const cache = path.join(config.cacheDirectory, target), suffix = process.platform === 'win32' ? '.exe' : '';
  const media = info.media && relativePath(path.join(cache, 'media-' + info.media.sha256), info.media.directory);
  const mediaTool = name => media ? path.join(media, 'bin', name + suffix) : relativePath(path.join(cache, name + '-' + info[name].sha256), info[name].executable);
  const browser = relativePath(path.join(cache, 'browser-' + info.browser.sha256), info.browser.executable);
  return { config, info, cache, components, paths: {
    HYPERFRAMES_FFMPEG_PATH: mediaTool('ffmpeg'),
    HYPERFRAMES_FFPROBE_PATH: mediaTool('ffprobe'),
    HYPERFRAMES_BROWSER_PATH: browser,
  } };
}

export async function configureNativeEnvironment(root) {
  const native = await nativeConfiguration(root);
  if (!native) return null;
  process.env.HYPERFRAMES_FFMPEG_PATH ||= process.env.FFMPEG_PATH || native.paths.HYPERFRAMES_FFMPEG_PATH;
  process.env.HYPERFRAMES_FFPROBE_PATH ||= process.env.FFPROBE_PATH || native.paths.HYPERFRAMES_FFPROBE_PATH;
  process.env.HYPERFRAMES_BROWSER_PATH ||= process.env.MOTION_BROWSER_PATH || native.paths.HYPERFRAMES_BROWSER_PATH;
  return native;
}

export async function ensureNativeRuntime(root) {
  const native = await configureNativeEnvironment(root);
  if (!native) return;
  const { config, info, cache, components, paths } = native;
  const overrides = Object.fromEntries(Object.entries(paths).filter(([key, value]) => process.env[key] !== value));
  for (const key of Object.keys(overrides)) await executable(process.env[key]);
  const componentKeys = { browser: ['HYPERFRAMES_BROWSER_PATH'], media: ['HYPERFRAMES_FFMPEG_PATH', 'HYPERFRAMES_FFPROBE_PATH'], ffmpeg: ['HYPERFRAMES_FFMPEG_PATH'], ffprobe: ['HYPERFRAMES_FFPROBE_PATH'] };
  for (const component of components) {
    const keys = componentKeys[component];
    if (keys.every(key => Object.hasOwn(overrides, key))) continue;
    const asset = info[component];
    assert(/^[a-f0-9]{64}$/.test(asset.sha256), 'Require a pinned native SHA256');
    if (process.platform === 'darwin') assert(Number(os.release().split('.')[0]) >= 25, 'Pinned native downloads require macOS 26 or later; supply compatible media and browser paths on older systems.');
    if (process.platform === 'win32') assert(Number(os.release().split('.')[2]) >= 22000, 'Pinned native runtime requires Windows 11 or later');
    const destination = path.join(cache, component + '-' + asset.sha256);
    const ready = async () => {
      if ((await readJSON(path.join(destination, 'ready.json')))?.sha256 !== asset.sha256) return false;
      try { for (const key of keys) await executable(paths[key]); return true; } catch { return false; }
    };
    if (await ready()) continue;
    await withLock(destination + '.lock', async () => {
      if (await ready()) return;
      console.error(`OpenMotion: downloading pinned ${component}; this first use needs network access.`);
      const archive = path.join(config.cacheDirectory, 'downloads', asset.sha256 + (new URL(asset.url).pathname.endsWith('.zip') ? '.zip' : '.tar.gz'));
      await obtainAsset(asset, archive, config.allowLocalAssets === true);
      await mkdir(cache, { recursive: true });
      const temporary = await mkdtemp(path.join(cache, component + '-'));
      try {
        await extractArchive(archive, temporary);
        for (const key of keys) {
          const filename = path.join(temporary, path.relative(destination, paths[key]));
          if (process.platform === 'win32') assert(filename.length < 260, 'Native tool path is too long; choose a shorter --home directory');
          await executable(filename);
          await runFile(filename, [component === 'browser' ? '--version' : '-version']);
        }
        await writeFile(path.join(temporary, 'ready.json'), JSON.stringify({ sha256: asset.sha256 }));
        await rm(destination, { recursive: true, force: true });
        await rename(temporary, destination);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    });
  }
  for (const [key] of Object.entries(overrides)) await runFile(process.env[key], [key.includes('BROWSER') ? '--version' : '-version']);
}
