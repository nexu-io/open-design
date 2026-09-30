import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Evaluation-only branch. The control arm pins the parent commit, which has no
// part of this module: its agent receives the dataset question verbatim. This
// arm adds exactly one frozen image plus one fixed sentence, identical for every
// case and never derived from the image.
export const REFERENCE_NOTE = '用户已从候选参考图中选定此方向，请参考其整体风格与版式方向生成，不要照搬图中的文字、品牌名和具体内容。';

export const REFERENCE_CASES = {
  'eval-OD-EVAL-002': {
    prompt: '设计一个资产概览看板。首屏展示总资产、可用资金、冻结资金和股票市值四个 KPI；下方左侧展示持仓股票及盈亏金额、盈亏比例，右侧展示主要指数和订阅股票涨跌分布。使用专业金融后台风格，突出关键数字，不需要多页面。',
    sha256: '0bd36d2dda3d29f86588c23bb6f9bc58bdf280639920f0e81f1d1bba764a3d6f',
    fileName: 'OD-EVAL-002.jpg',
  },
  'eval-OD-EVAL-003': {
    prompt: '为班主任设计一个 PC 端智能工作台首页。使用左侧固定导航和顶部工具栏，中间按卡片组织今日课表、班级考勤、待批作业、成绩概览、家校消息和待办事项。页面要适合高频办公，信息密度中等偏高但不能拥挤，并预留夜间模式入口。',
    sha256: '8ab60e2ecdf4b81f6cfd65e0a7974ab1439a502f81a337d76430ae19a9aa549a',
    fileName: 'OD-EVAL-003.webp',
  },
  'eval-OD-EVAL-005': {
    prompt: '为卫星网络管理系统设计桌面端高保真可点击原型，主题为终端参数批量配置。终端列表支持多选；选中终端后可进入两种配置方式：独立批量参数页和三步向导。每个参数左侧都有是否覆盖的复选框，只有勾选字段才写入，未勾选字段保持原值；需要包含参数校验、差异预览、确认提交、部分失败和结果明细。',
    sha256: 'd77bd22dcb8d7ec0eef10840cb0fa29c74d53b54a61ee05f8dea431a35ab60cd',
    fileName: 'OD-EVAL-005.png',
  },
  'eval-OD-EVAL-008': {
    prompt: '设计一个 iOS 卡牌图鉴页面。顶部有返回按钮；中间展示 2:3 比例的卡牌大图和首次获得时间；下方是按属性与稀有度筛选的卡牌库。已获得卡牌显示缩略图，未获得卡牌显示问号；点击未获得卡牌时，大图区域显示未获得状态和角色剪影。',
    sha256: 'c0a610ccc0415cb2980668826e458239bb3968f4930e04d97bd81e25257819fb',
    fileName: 'OD-EVAL-008.png',
  },
  'eval-OD-EVAL-010': {
    prompt: '设计一个移动点餐应用原型。首屏选择堂食或自提；主点餐页包含分类、商品列表和购物袋；用户可添加商品、修改数量并进入结算；底部导航包含点餐和我的订单。订单页区分全部、待支付和已完成，订单详情展示商品、金额和履约方式。',
    sha256: '3a2d54e140ba82592157e0e0bee97c44bda7449203b482f6de3b2a31f4799d3c',
    fileName: 'OD-EVAL-010.png',
  },
  'eval-OD-EVAL-011': {
    prompt: '设计一个面向中老年人的用药与健康管理 App。首次使用时采集身高、体重、年龄、既往症、用药、用餐和睡眠信息；首页按时间线展示今日需服用的药物，用户确认服药后记录时间；还需要药品管理、提醒设置、漏服处理、健康趋势和家属查看入口。界面文字清晰、操作步骤少，并覆盖空数据、提醒失败和重复确认状态。',
    sha256: '34f27bee38c3d725f32e60c5579313958d4601a24413955d2d7902f9e8b50f35',
    fileName: 'OD-EVAL-011.png',
  },
  'eval-OD-EVAL-014': {
    prompt: '设计一个大学课表查询页面。用户可切换教务、学院和教师三种查看角色；主体为周一至周日、每天 10 节课的周课表，课程卡片展示课程名、班级、教师、教室和周次，点击后打开详情。提供周次切换、今日定位和无课状态。',
    sha256: '6e7947f4366fbf513e3336259f3e7c77aae7690fc3089730952e048d64ea6b1a',
    fileName: 'OD-EVAL-014.webp',
  },
  'eval-OD-EVAL-015': {
    prompt: '设计一个支持桌面和移动端的杂志风社交信息流。保留顶部导航和左侧分类，主内容区每篇帖子以大幅图片、标题、摘要、作者和互动数据呈现；支持在信息流与个人主页之间跳转，个人主页包含简介、关注按钮和作品网格。移动端改为单列并保留核心操作。',
    sha256: '4efe0d7950569c3a49d6c422e7e311f65070c089408cb7cd01807908602ad5fc',
    fileName: 'OD-EVAL-015.png',
  },
  'eval-OD-EVAL-017': {
    prompt: '设计一个面向欧洲中小建筑公司的多角色施工管理 SaaS。角色包括公司管理员、项目经理和现场人员；核心流程覆盖项目总览、任务计划、图纸与文件、现场日志、问题整改、工时、供应商和成本。任务可以指派、更新状态、上传现场照片并关联图纸位置；项目经理可查看跨项目风险和逾期情况。',
    sha256: '6f996b4bf5578d92b3457c5b41c9f8e0883132c2be232fcf989da94374863439',
    fileName: 'OD-EVAL-017.png',
  },
  'eval-OD-EVAL-020': {
    prompt: '设计一个本地火锅店官网首页。首屏展示门店名称、主打菜品和立即订座按钮；下方依次展示招牌菜、环境照片、营业时间、门店地址、联系电话和页脚。整体大气、有食欲感，移动端优先，订座按钮点击后打开包含日期、时间和人数的简短表单。',
    sha256: '9955a9b6221ca9cb454152c2e1e1b97c4de000496446661d22b59012dd349e27',
    fileName: 'OD-EVAL-020.png',
  },
  'eval-OD-EVAL-022': {
    prompt: '为 UI/UX 设计师设计一个高级、编辑感强的个人作品集网站。首页包含个人定位、精选项目、能力、客户评价和联系入口；项目卡片可进入案例详情，详情页展示背景、问题、过程、设计系统和结果。使用强排版、充足留白和克制动效，并适配移动端。',
    sha256: '8edb14c7131beec40cb19c191146806b7dae89a5909544e008bf3ae0dce9e8ee',
    fileName: 'OD-EVAL-022.png',
  },
  'eval-OD-EVAL-024': {
    prompt: '为一家现代软件工作室设计电影感单页官网。页面包含打字机式预加载、带主 CTA 的 Hero、滚动驱动的软件界面展示：图片从下方上升、缩放并在深色宣言区固定；随后展示服务、案例、方法、客户评价和联系表单。必须兼容移动端，并为低性能设备和开启减少动态效果的用户提供静态降级。',
    sha256: '7e07c7141a3ac0cbf5417150ffe57e3df9ef0332910e5cceea6bde1bccf47aec',
    fileName: 'OD-EVAL-024.png',
  },
  'eval-OD-EVAL-025': {
    prompt: '为一款隐私优先的 macOS 语音转文字应用设计设置页。左侧为设置分类，右侧包含麦克风权限、快捷键、转写语言、保存位置、开机启动和隐私说明。权限未开启时显示系统引导，修改设置后即时保存并给出轻量反馈。',
    sha256: '7f368383cfbc279ae6d0aa7d1cbc21dd9f1f2233067831fc1d7eb80186f64f60',
    fileName: 'OD-EVAL-025.png',
  },
  'eval-OD-EVAL-028': {
    prompt: '为数字人视频生成工具设计 Electron 桌面客户端的新建项目页。左侧输入主题、选择数字人口播或纯动画、上传照片和声音样本、选择画幅并开启可选动效；右侧实时预览、参数摘要、预计时长与成本。点击开始生成后展示上传、生成和合成三个阶段的进度，以及取消和失败重试。',
    sha256: '209a5ebb3b7b6d0075ede0416003063ebaad1bdfbe5981ef721c361dff6ab3bf',
    fileName: 'OD-EVAL-028.png',
  },
  'eval-OD-EVAL-029': {
    prompt: '设计一个仅面向 Windows 的桌面便签应用。支持宫格与列表视图、创建和自动保存便签、置顶、搜索、标签、颜色主题、透明度和始终置顶窗口；数据本地离线保存。需要包含多窗口便签、托盘菜单、全局快捷键、首次使用引导、误删恢复和存储异常提示，整体轻量快速。',
    sha256: '6c40a74e373f91fcc767e445b296d18e3cab175057003d42c0bb9f2d67edddd9',
    fileName: 'OD-EVAL-029.png',
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
