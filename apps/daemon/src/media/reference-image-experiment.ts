import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Evaluation-only branch. The control arm pins the parent commit, which has no
// part of this module: its agent receives the dataset question verbatim. This
// arm adds exactly one frozen image plus one fixed sentence, identical for every
// case and never derived from the image.
export const REFERENCE_NOTE = '用户已从候选参考图中选定此方向，请参考其整体风格与版式方向生成。';

export const REFERENCE_CASES = {
  'eval-OD-EVAL-022': {
    prompt: '为 UI/UX 设计师设计一个高级、编辑感强的个人作品集网站。首页包含个人定位、精选项目、能力、客户评价和联系入口；项目卡片可进入案例详情，详情页展示背景、问题、过程、设计系统和结果。使用强排版、充足留白和克制动效，并适配移动端。',
    sha256: '7a91ed25792ac22241a5cf943cdbb97868b41d8d43e48bfc6e24efd6f68731c5',
    fileName: 'OD-EVAL-022.jpg',
  },
  'eval-OD-EVAL-003': {
    prompt: '为班主任设计一个 PC 端智能工作台首页。使用左侧固定导航和顶部工具栏，中间按卡片组织今日课表、班级考勤、待批作业、成绩概览、家校消息和待办事项。页面要适合高频办公，信息密度中等偏高但不能拥挤，并预留夜间模式入口。',
    sha256: '8ab60e2ecdf4b81f6cfd65e0a7974ab1439a502f81a337d76430ae19a9aa549a',
    fileName: 'OD-EVAL-003.webp',
  },
  'eval-OD-EVAL-028': {
    prompt: '为数字人视频生成工具设计 Electron 桌面客户端的新建项目页。左侧输入主题、选择数字人口播或纯动画、上传照片和声音样本、选择画幅并开启可选动效；右侧实时预览、参数摘要、预计时长与成本。点击开始生成后展示上传、生成和合成三个阶段的进度，以及取消和失败重试。',
    sha256: '209a5ebb3b7b6d0075ede0416003063ebaad1bdfbe5981ef721c361dff6ab3bf',
    fileName: 'OD-EVAL-028.png',
  },
} as const;

/** Inject before input freezing so the image uses the ordinary upload pipeline. */
export function referenceImageExperimentInput(input: {
  projectName?: string | undefined;
  requestBody: Record<string, unknown>;
  uploadRoot: string;
  isContinuation: boolean;
}): { message: string; currentPrompt: string; imagePaths: string[] } | null {
  const { projectName, requestBody, uploadRoot, isContinuation } = input;
  const prompt = Object.hasOwn(requestBody, 'currentPrompt')
    ? requestBody.currentPrompt : requestBody.message;
  const reference = projectName && Object.hasOwn(REFERENCE_CASES, projectName)
    ? REFERENCE_CASES[projectName as keyof typeof REFERENCE_CASES] : null;
  if (!reference || isContinuation
      || typeof prompt !== 'string' || prompt.trim() !== reference.prompt) return null;
  if (Array.isArray(requestBody.imagePaths) && requestBody.imagePaths.length > 0) {
    throw new Error('Reference experiment requires an input without existing images.');
  }
  const message = `${prompt}\n\n${REFERENCE_NOTE}`;

  const source = fileURLToPath(new URL(`../../experiments/reference-images/${reference.fileName}`, import.meta.url));
  const bytes = fs.readFileSync(source);
  if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256) {
    throw new Error('Reference experiment image checksum mismatch.');
  }
  fs.mkdirSync(uploadRoot, { recursive: true });
  // Stable path keeps repeated requests' idempotency fingerprints stable.
  const target = path.join(uploadRoot, `reference-${reference.sha256}${path.extname(reference.fileName)}`);
  try {
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (fs.lstatSync(target).isSymbolicLink()
        || createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== reference.sha256) {
      throw new Error('Reference experiment upload checksum mismatch.');
    }
  }
  return { message, currentPrompt: message, imagePaths: [target] };
}
