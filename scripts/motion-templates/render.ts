import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { agentPrompt, loadCatalog, orderedTemplates, repoRoot, type Locale, type MotionReference } from './catalog.ts';

const check = process.argv.includes('--check');
const catalog = await loadCatalog();
const items = orderedTemplates(catalog);
const directory = path.join(repoRoot, 'docs/motion-templates');
const html = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replace(/\s+/g, ' ').trim();
const visibleCount = 21;

function excerpt(value: string, maxUnits: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  let units = 0;
  let result = '';
  for (const character of normalized) {
    units += character.codePointAt(0)! > 255 ? 2 : 1;
    if (units > maxUnits) return `${result.trimEnd()}…`;
    result += character;
  }
  return result;
}

function cardContent(item: MotionReference, locale: Locale): string {
  const metadata = [item.brand, item.code].filter(Boolean).join(' · ');
  return [
    '<td width="33%" valign="top">',
    `<a href="${item.previewUrl}"><img src="${item.coverUrl}" alt="${html(item.title[locale])}" width="100%" loading="lazy"></a><br>`,
    `<b><a href="${item.pageUrl[locale]}" title="${html(item.title[locale])}">${html(excerpt(item.title[locale], 50))}</a></b><br>`,
    `<sub>${html(metadata)}</sub><br>`,
    html(excerpt(item.summary[locale], 110)),
    '</td>',
  ].join('\n');
}

function cardActions(item: MotionReference, locale: Locale): string {
  const zh = locale === 'zh-CN';
  return [
    '<td width="33%" valign="top">',
    '<sub>',
    '',
    '```markdown',
    agentPrompt(item, locale, 'card'),
    '```',
    '',
    '</sub>',
    `<sub><a href="${item.previewUrl}">${zh ? '视频' : 'Video'}</a> · <a href="${item.pageUrl[locale]}">${zh ? '完整页面' : 'Details'}</a> · <a href="${item.packageUrl[locale]}">${zh ? '↓ motion.md 包' : '↓ motion.md'}</a></sub>`,
    '</td>',
  ].join('\n');
}

function grid(entries: MotionReference[], locale: Locale): string {
  const rows: string[] = [];
  for (let offset = 0; offset < entries.length; offset += 3) {
    if (offset > 0) rows.push('');
    rows.push('<table>');
    const row = entries.slice(offset, offset + 3);
    for (const renderCell of [cardContent, cardActions]) {
      // Single-row groups keep GitHub's striped table background distinct from code blocks.
      rows.push('<tbody>', '<tr>', ...row.map(item => renderCell(item, locale)));
      for (let index = row.length; index < 3; index += 1) rows.push('<td width="33%" valign="top"></td>');
      rows.push('</tr>', '</tbody>');
    }
    rows.push('</table>');
  }
  return rows.join('\n');
}

function gallery(locale: Locale): string {
  const zh = locale === 'zh-CN';
  return [
    `# ${zh ? 'OpenMotion · 用 Agent 创作你的产品视频' : 'OpenMotion · Product videos with your agent'}`,
    '',
    zh ? '[English](README.md) · [官网模板库](https://open-design.ai/zh/templates/) · [返回 OpenDesign](../../README.md)' : '[简体中文](README.zh-CN.md) · [Browse on the website](https://open-design.ai/templates/) · [Back to OpenDesign](../../README.md)',
    '',
    zh ? '**为你的下一次产品发布，找到合适的动效。**' : '**Find the motion for your next product launch.**',
    '',
    zh ? '发布新产品、演示新功能、讲述品牌故事，或分享阶段成果——先围绕这次要讲的事情选择参考，再让 Agent 结合你的文案、品牌、截图与录屏，制作属于自己的视频。' : 'Launch a product, demonstrate a feature, tell a brand story, or share a milestone. Choose a reference for the message you need to communicate, then let your agent adapt it with your copy, brand, screenshots, and footage.',
    '',
    `## ${zh ? '从参考到你的成片' : 'From reference to your video'}`,
    '',
    zh ? '1. **选一个参考。** 点击封面观看完整视频，或打开完整页面查看编排、配色与动效拆解。\n2. **直接复制给 Agent。** 点击卡片内指令块右上角的复制图标，粘贴给 Codex 或其他已接入的 Agent，补充这次的文案、品牌与附件。\n3. **预览、修改并复用。** 让 Agent 按说明制作，检查内容与动效，继续修改生成的工程，再导出 HTML 和 MP4。' : '1. **Choose a reference.** Select a cover to watch the full video, or open the template page to inspect its sequence, palette, and motion notes.\n2. **Copy straight into your agent.** Use the copy icon on a card’s text block, paste into Codex or another connected agent, and add your brief, brand, and assets.\n3. **Review, refine, and reuse.** Have your agent build from the guide, check the content and motion, refine the generated project, then export HTML and MP4.',
    '',
    zh ? '首次使用请先完成 [OpenMotion 安装](https://releases.open-design.ai/open-motion/install.md)，之后即可直接复制卡片指令。你也可以下载 motion.md 说明包交给 Agent，作为制作可编辑工程的参考。' : 'Install [OpenMotion](https://releases.open-design.ai/open-motion/install.md) once, then copy the card briefs directly. You can also download a motion.md package for your agent to use as a guide when building an editable project.',
    '',
    `## ${zh ? '模板精选' : 'Selected references'}`,
    '',
    zh ? '**围绕 AI100 产品打造的动效模板库。** 每条提供参考视频、动效拆解与 motion.md 说明包，帮助你和 Agent 理解风格、节奏与内容替换方式。选一个参考，复制指令，用自己的品牌与素材开始创作，并继续编辑、复用生成的工程。' : '**A motion template library built around AI100 products.** Each reference includes a video, motion notes, and a motion.md package to help you and your agent understand its style, pacing, and content changes. Pick a reference, copy the brief, and create with your own brand and assets, then keep editing and reusing the project.',
    '',
    zh ? '如果这些模板给了你灵感，或帮你完成了创作，欢迎给 [OpenDesign 点个 Star ⭐](https://github.com/nexu-io/open-design)。感谢你的支持。' : 'If these templates sparked an idea or helped you create something, consider [starring OpenDesign ⭐](https://github.com/nexu-io/open-design). Thanks for your support.',
    '',
    grid(items.slice(0, visibleCount), locale),
    '',
    '<details>',
    `<summary><b>${zh ? '展开浏览更多精选模板' : 'Explore more selected templates'}</b></summary>`,
    '',
    grid(items.slice(visibleCount), locale),
    '',
    '</details>',
    '',
    zh ? '如果还没找到合适的模板，欢迎[告诉我们你需要的类型、使用场景或参考案例](https://github.com/nexu-io/open-design/discussions/categories/ideas)，帮助团队持续补充模板库。' : 'Still looking for the right template? [Share the type, use case, or reference you have in mind](https://github.com/nexu-io/open-design/discussions/categories/ideas) to help the team keep growing the library.',
    '',
    `## ${zh ? '批量下载说明包' : 'Download the guide collection'}`,
    '',
    zh ? '需要建立自己的参考库时，可以一次获取全部 motion.md 说明包和同顺序的使用指令。' : 'Build your own reference library by downloading every motion.md package together with an ordered catalog and agent briefs.',
    '',
    '<details>',
    `<summary>${zh ? '查看批量下载方法' : 'Show batch download instructions'}</summary>`,
    '',
    zh ? '克隆本仓库后，在仓库根目录使用 Node.js 24 执行：' : 'Clone this repository and run the following from its root with Node.js 24:',
    '',
    '```sh',
    `node scripts/motion-templates/download.ts --locale ${locale} --output .tmp/motion-guides-${locale}`,
    '```',
    '',
    zh ? '脚本获取原始说明包、同序目录和逐条 Agent 指令，按发布地址的 SHA-256 校验文件。重复运行会复用已校验的文件；下载不需要模型账号，也不触发生成。视频预览通过每张卡片的链接单独观看。' : 'The script downloads original guide packages, an ordered catalog, and per-reference agent briefs. It verifies published SHA-256 hashes and reuses verified files on later runs. Downloading requires no model account and starts no generation; watch reference videos through the individual card links.',
    '',
    '[catalog.json](catalog.json) · [download.ts](../../scripts/motion-templates/download.ts)',
    '',
    '</details>',
    '',
    `## ${zh ? '来源与维护' : 'Sources and maintenance'}`,
    '',
    zh ? '目录数据保留参考作品的来源信息。合集提供参考视频和动效说明，便于你与 Agent 理解制作方法，并结合自己的素材创作。' : 'Reference source information is preserved in the catalog. The collection pairs reference videos with adaptation notes so you and your agent can understand the approach and create with your own assets.',
    '',
    '<details>',
    `<summary>${zh ? '目录版本与维护方式' : 'Catalog version and maintenance'}</summary>`,
    '',
    zh ? `条目与下载地址来自[正式 Motion 目录](${catalog.source.url})，版本 ${catalog.source.version}，核对日期 ${catalog.source.checkedOn}。精选顺序与真实视频封面保存在 [catalog.json](catalog.json)。` : `Entries and package links come from the [published Motion catalog](${catalog.source.url}), version ${catalog.source.version}, checked ${catalog.source.checkedOn}. [catalog.json](catalog.json) stores the selected order and reference frames.`,
    '',
    zh ? '更新目录后执行 `node scripts/motion-templates/render.ts` 生成中英文 README；加 `--check` 验证生成结果。此目录中的推荐顺序独立于产品内模板库。' : 'After updating the catalog, run `node scripts/motion-templates/render.ts` to generate both READMEs; add `--check` to verify them. The selected order here is independent of the in-product library.',
    '',
    '</details>',
    '',
  ].join('\n');
}

async function output(filename: string, content: string) {
  if (check) {
    if (await readFile(filename, 'utf8') !== content) throw new Error(`Generated output differs: ${path.relative(repoRoot, filename)}`);
  } else await writeFile(filename, content);
}

const start = '<!-- motion-template-library:start -->';
const end = '<!-- motion-template-library:end -->';
for (const locale of ['en', 'zh-CN'] as const) {
  const zh = locale === 'zh-CN';
  await output(path.join(directory, zh ? 'README.zh-CN.md' : 'README.md'), gallery(locale));
  const filename = path.join(repoRoot, zh ? 'docs/i18n/README.zh-CN.md' : 'README.md');
  const existing = await readFile(filename, 'utf8');
  const link = zh ? '../motion-templates/README.zh-CN.md' : 'docs/motion-templates/README.md';
  const section = `${start}\n## ${zh ? '用 OpenMotion 制作产品视频' : 'Product videos with OpenMotion'}\n\n${zh ? `围绕产品发布、功能演示、品牌故事或阶段成果，找到适合这次传播的动效参考。浏览精选动效参考与制作说明，直接复制指令交给 Agent，再换成自己的文案、品牌与素材。` : `Find a visual starting point for a product launch, feature demo, brand story, or milestone. Browse selected motion references and adaptation guides, copy a brief into your agent, and bring your own message, brand, and assets.`}\n\n${zh ? '从参考到自己的成片，继续编辑生成的工程，让它成为下一次产品更新与传播的起点。' : 'Review and refine the generated project, then reuse it for your next release, campaign, or update.'}\n\n[${zh ? '浏览动效参考，开始创作 →' : 'Explore motion references and start creating →'}](${link})\n${end}`;
  let next: string;
  if (existing.includes(start)) {
    const from = existing.indexOf(start);
    const to = existing.indexOf(end, from);
    if (to < 0) throw new Error(`Missing catalog marker: ${filename}`);
    next = existing.slice(0, from) + section + existing.slice(to + end.length);
  } else {
    const boundary = existing.indexOf('## Platform Compatibility');
    const localizedBoundary = existing.indexOf('## 平台兼容性');
    const index = boundary >= 0 ? boundary : localizedBoundary;
    if (index < 0) throw new Error(`Cannot find README insertion point: ${filename}`);
    next = existing.slice(0, index) + section + '\n\n---\n\n' + existing.slice(index);
  }
  await output(filename, next);
}
process.stdout.write(`${check ? 'Verified' : 'Generated'} ${items.length} references; first 40 match the featured selection.\n`);
