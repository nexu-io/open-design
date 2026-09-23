import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Evaluation-only branch. The control and image arms pin separate commits;
// this switch is the only behavioral difference between those commits.
export const INCLUDE_REFERENCE_IMAGE = true;
export const REFERENCE_IMAGE_SHA256 = '7a91ed25792ac22241a5cf943cdbb97868b41d8d43e48bfc6e24efd6f68731c5';
export const REFERENCE_CASE_PROMPT = '为 UI/UX 设计师设计一个高级、编辑感强的个人作品集网站。首页包含个人定位、精选项目、能力、客户评价和联系入口；项目卡片可进入案例详情，详情页展示背景、问题、过程、设计系统和结果。使用强排版、充足留白和克制动效，并适配移动端。';
export const REFERENCE_DIRECTION = '视觉方向：暖白配色、衬线标题、宽松留白与有序作品网格，营造高级、克制的编辑式作品集风格。功能与内容以原题要求为准。';

export const REFERENCE_CASES = {
  'eval-OD-EVAL-022': {
    prompt: REFERENCE_CASE_PROMPT,
    direction: REFERENCE_DIRECTION,
    sha256: REFERENCE_IMAGE_SHA256,
    fileName: 'reference.jpg',
  },
  'eval-OD-EVAL-003': {
    prompt: '为班主任设计一个 PC 端智能工作台首页。使用左侧固定导航和顶部工具栏，中间按卡片组织今日课表、班级考勤、待批作业、成绩概览、家校消息和待办事项。页面要适合高频办公，信息密度中等偏高但不能拥挤，并预留夜间模式入口。',
    direction: '视觉方向：浅色教师工作台，左侧导航、今日课表、消息、成绩和考勤趋势分区明确，保持中高信息密度与清楚层级。功能与内容以原题要求为准。',
    sha256: '8ab60e2ecdf4b81f6cfd65e0a7974ab1439a502f81a337d76430ae19a9aa549a',
    fileName: 'reference-003.webp',
  },
  'eval-OD-EVAL-028': {
    prompt: '为数字人视频生成工具设计 Electron 桌面客户端的新建项目页。左侧输入主题、选择数字人口播或纯动画、上传照片和声音样本、选择画幅并开启可选动效；右侧实时预览、参数摘要、预计时长与成本。点击开始生成后展示上传、生成和合成三个阶段的进度，以及取消和失败重试。',
    direction: '视觉方向：简洁的数字人视频创建表单，照片、文稿或声音、动效和输出规格分区清晰。按原题补全模式选择、实时预览、成本与生成进度。',
    sha256: '7be926dd9f4dbe95d2f2976919f5c8cb3d9b18bcf69983f029bb01a18435545d',
    fileName: 'reference-028.png',
  },
} as const;

/** Inject before input freezing so images use the ordinary upload pipeline. */
export function referenceImageExperimentInput(input: {
  projectName?: string | undefined;
  requestBody: Record<string, unknown>;
  uploadRoot: string;
  isContinuation: boolean;
}): { message: string; currentPrompt: string; imagePaths?: string[] } | null {
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
  const message = `${prompt}\n\n${reference.direction}`;
  if (!INCLUDE_REFERENCE_IMAGE) return { message, currentPrompt: message };

  const source = fileURLToPath(new URL(`../../experiments/reference-image-022/${reference.fileName}`, import.meta.url));
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
