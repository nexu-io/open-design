import { stat } from 'node:fs/promises';
import { runHyperframes } from '../hyperframes.ts';

export async function compareVideos(runtimeRoot: string, cwd: string, reference: string, candidate: string, out?: string) {
  for (const filename of [reference, candidate]) {
    if (!(await stat(filename)).isFile()) throw new Error('视频对比仅支持视频文件；请先导出工程，再使用视频路径或 latest-export');
  }
  const result = await runHyperframes(runtimeRoot, cwd, ['diff', reference, candidate, '--json', ...(out ? ['--out', out] : [])], 600_000);
  let parsed: any;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error('Hyperframes diff 失败：' + (result.stderr || result.stdout).slice(-1200)); }
  if (parsed.ok !== true) throw new Error('Hyperframes diff 失败：' + JSON.stringify({ error: parsed.error, fix: parsed.fix }));
  return {
    pass: Boolean(parsed.pass), mode: parsed.mode, window: parsed.window, thresholds: parsed.thresholds, ssim: parsed.ssim,
    cuts: parsed.cuts, duration: parsed.duration, sound: parsed.sound, missingContent: parsed.missing_content?.share,
    worst: (parsed.worst || []).slice(0, 4).map((item: any) => ({ t: item.t, frame: item.frame, ssim: item.ssim, cell: item.cell?.roi, cellSsim: item.cell?.ssim, picture: item.cell?.picture })),
    sheet: parsed.sheet, warnings: parsed.warnings || [],
  };
}
