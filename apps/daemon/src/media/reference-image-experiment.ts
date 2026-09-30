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
  if (projectName !== 'eval-OD-EVAL-022' || isContinuation
      || typeof prompt !== 'string' || prompt.trim() !== REFERENCE_CASE_PROMPT) return null;
  if (Array.isArray(requestBody.imagePaths) && requestBody.imagePaths.length > 0) {
    throw new Error('Reference experiment requires an input without existing images.');
  }
  const message = `${prompt}\n\n${REFERENCE_DIRECTION}`;
  if (!INCLUDE_REFERENCE_IMAGE) return { message, currentPrompt: message };

  const source = fileURLToPath(new URL('../../experiments/reference-image-022/reference.jpg', import.meta.url));
  const bytes = fs.readFileSync(source);
  if (createHash('sha256').update(bytes).digest('hex') !== REFERENCE_IMAGE_SHA256) {
    throw new Error('Reference experiment image checksum mismatch.');
  }
  fs.mkdirSync(uploadRoot, { recursive: true });
  // Stable path keeps repeated requests' idempotency fingerprints stable.
  const target = path.join(uploadRoot, `reference-${REFERENCE_IMAGE_SHA256}.jpg`);
  try {
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (fs.lstatSync(target).isSymbolicLink()
        || createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== REFERENCE_IMAGE_SHA256) {
      throw new Error('Reference experiment upload checksum mismatch.');
    }
  }
  return { message, currentPrompt: message, imagePaths: [target] };
}
