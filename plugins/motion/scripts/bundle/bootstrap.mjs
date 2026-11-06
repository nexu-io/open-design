import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const windows = process.platform === 'win32';
if (metadata.target !== (windows ? 'win-x64' : 'mac-arm64') || process.arch !== (windows ? 'x64' : 'arm64')) throw new Error('此测试包与当前系统/CPU 不匹配');
if (!windows && Number(os.release().split('.')[0]) < 25) throw new Error('当前固定 FFmpeg 测试运行时要求 macOS 26.0 或以上');
if (windows && Number(os.release().split('.')[2]) < 22000) throw new Error('此测试包要求 Windows 11 或以上');
const media = path.join(root, 'runtime/media/bin'), node = path.join(root, windows ? 'runtime/node' : 'runtime/node/bin');
const suffix = windows ? '.exe' : '';
const values = {
  HYPERFRAMES_BROWSER_PATH: path.join(root, 'runtime/browser', windows ? 'chrome-headless-shell-win64/chrome-headless-shell.exe' : 'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  HYPERFRAMES_FFMPEG_PATH: path.join(media, 'ffmpeg' + suffix),
  HYPERFRAMES_FFPROBE_PATH: path.join(media, 'ffprobe' + suffix),
};
for (const [key, filename] of Object.entries(values)) {
  if (windows && filename.length >= 260) throw new Error('安装路径过长，Windows 无法启动渲染工具。请将完整包放到较短的用户应用目录后重新安装。');
  fs.accessSync(filename, fs.constants.X_OK); process.env[key] = filename;
}
process.env.FFMPEG_PATH = values.HYPERFRAMES_FFMPEG_PATH;
process.env.FFPROBE_PATH = values.HYPERFRAMES_FFPROBE_PATH;
const system = windows ? [path.join(process.env.SystemRoot, 'System32'), path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0')] : [];
process.env.PATH = [node, media, ...system, process.env.PATH || ''].join(path.delimiter);
process.env.HYPERFRAMES_NO_TELEMETRY = '1';
process.env.HYPERFRAMES_NO_UPDATE_CHECK = '1';
process.env.HYPERFRAMES_NO_AUTO_INSTALL = '1';
process.env.MOTION_DATA_DIR ||= path.join(os.homedir(), 'OpenMotion-test-data');
