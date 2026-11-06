import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nativeProjectConfig, pluginRoot } from './hyperframes.ts';

export const templates = [
  { id: 'product-promo', title: 'Product Promo', label: '产品宣传', description: '从图标开场到多人协作，查看多场景动画与字幕编排。', duration: 20, width: 1920, height: 1080, posterTime: 7 },
  { id: 'nyt-graph', title: 'NYT Graph', label: '数据叙事', description: '报刊风格的动态图表，查看数据、标注与图形的节奏。', duration: 15, width: 1920, height: 1080, posterTime: 9 },
  { id: 'decision-tree', title: 'Decision Tree', label: '流程动画', description: '逐步展开的决策树，查看节点、连线与分支动画。', duration: 10, width: 1920, height: 1080, posterTime: 7 },
].map(template => ({ ...template, poster: `/api/templates/${template.id}/poster`, source: `https://github.com/heygen-com/hyperframes/tree/3baf81f9a92615507f76fe8de33e489034ee77ec/registry/examples/${template.id}` }));

export function findTemplate(id: string) {
  const template = templates.find(item => item.id === id);
  if (!template) throw new Error('模板不存在');
  return template;
}

export async function copyTemplate(id: string, directory: string, runtimeRoot: string) {
  findTemplate(id);
  const source = path.join(pluginRoot, 'template-library', id);
  const manifest = JSON.parse(await readFile(path.join(source, 'registry-item.json'), 'utf8'));
  for (const file of manifest.files) {
    const target = path.join(directory, file.target);
    await mkdir(path.dirname(target), { recursive: true });
    if (target.endsWith('.html')) {
      const relative = path.relative(path.dirname(target), path.join(directory, 'assets/gsap.min.js')).split(path.sep).join('/');
      const html = (await readFile(path.join(source, file.path), 'utf8')).replaceAll('https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js', relative);
      await writeFile(target, html);
    } else await copyFile(path.join(source, file.path), target);
  }
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  await copyFile(path.join(runtimeRoot, 'node_modules/gsap/dist/gsap.min.js'), path.join(directory, 'assets/gsap.min.js'));
  for (const file of ['LICENSE', 'NOTICE.md']) await cp(path.join(pluginRoot, 'template-library', file), path.join(directory, file));
  await writeFile(path.join(directory, 'hyperframes.json'), JSON.stringify(nativeProjectConfig, null, 2));
}
