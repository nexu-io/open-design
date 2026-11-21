import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inputPath = path.resolve(process.cwd(), process.argv[2] || path.join(root, 'inputs.example.json'));
const outputPath = path.resolve(process.cwd(), process.argv[3] || path.join(root, 'example.html'));

const [inputs, presets, manifest, css, motion] = await Promise.all([
  fs.readFile(inputPath, 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'scene-presets.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'assets/asset-manifest.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'styles.css'), 'utf8'),
  fs.readFile(path.join(root, 'motion-runtime.ts'), 'utf8')
]);

const safeUrl = value => { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Source URL must use HTTP(S)'); return value; };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byAsset = Object.fromEntries(manifest.assets.map(a => [a.id, a]));
const byChapter = Object.fromEntries(inputs.chapters.map(c => [c.id, c]));
const outDir = path.dirname(outputPath);
await fs.mkdir(outDir, { recursive: true });

// Resolve all used assets before writing HTML; exports are self-contained directories.
const resolved = new Map();
const copiedSources = new Map();
const ids = new Set();
for (const chapter of inputs.chapters) {
  if (!/^[a-z0-9-]+$/.test(chapter.id) || ids.has(chapter.id)) throw new Error(`Invalid/duplicate chapter id: ${chapter.id}`);
  ids.add(chapter.id);
  if (!presets[chapter.scene_type] || !chapter.asset_ids?.length) throw new Error(`Invalid scene: ${chapter.id}`);
  for (const id of chapter.fact_ids || []) {
    const fact = inputs.subject.facts.find(f => f.id === id);
    if (!fact || fact.status === 'unverified') throw new Error(`Unverified/unknown fact: ${id}`);
  }
}
if (!['high', 'medium', 'low', 'fallback'].includes(inputs.imagery.motion_tier)) throw new Error('Invalid motion tier');
if (!['placeholder', 'generate', 'documentary', 'bring-your-own'].includes(inputs.imagery.strategy)) throw new Error('Invalid imagery strategy');
for (const id of new Set(inputs.chapters.flatMap(c => c.asset_ids))) {
  const a = byAsset[id];
  if (!a) throw new Error(`Unknown asset: ${id}`);
  const strategy = inputs.imagery.strategy;
  const provided = inputs.imagery.provided_assets?.[id];
  let source;
  if (strategy === 'placeholder' || (!provided && a.derivation === 'vector-overlay')) {
    source = path.join(root, 'assets/placeholders', a.placeholder);
  } else if (provided) {
    source = path.resolve(path.dirname(inputPath), provided);
  } else if (strategy === 'generate') {
    source = path.resolve(path.dirname(inputPath), inputs.imagery.assets_path || 'assets', a.generated);
  } else {
    throw new Error(`Missing provided asset: ${id}`);
  }
  if (strategy === 'documentary' && a.derivation !== 'vector-overlay') {
    const credit = inputs.imagery.documentary_sources?.find(s => s.asset_id === id);
    if (!credit?.source_url || !credit.license || credit.license_status !== 'verified') throw new Error(`Missing verified documentary credit: ${id}`);
  }
  await fs.access(source);
  if (copiedSources.has(source)) { resolved.set(id, copiedSources.get(source)); continue; }
  const relative = `assets/${id}${path.extname(source)}`;
  const destination = path.join(outDir, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (source !== destination) await fs.copyFile(source, destination);
  resolved.set(id, `./${relative}`);
  copiedSources.set(source, `./${relative}`);
}
function assetImg(id, caption = '') {
  const a = byAsset[id];
  const [dx,dy] = a.responsive_focus.desktop;
  const [mx,my] = a.responsive_focus.mobile;
  const hero = id === inputs.chapters[0].asset_ids[0];
  const label = inputs.imagery.strategy === 'placeholder' ? '构图占位 · 非实景' : inputs.imagery.strategy === 'generate' ? 'AI 生成 · 视觉演绎' : '';
  return `<img src="${esc(resolved.get(id))}" alt="${esc(a.derivation === 'vector-overlay' ? '' : inputs.chapters.find(c => c.asset_ids.includes(id))?.copy.title_zh)}" loading="${hero ? 'eager' : 'lazy'}" ${hero ? 'fetchpriority="high"' : ''} decoding="async" style="--focus-desktop:${dx*100}% ${dy*100}%;--focus-mobile:${mx*100}% ${my*100}%" />${label ? `<span class="scene-caption">${esc(label)}</span>` : ''}`;
}
const volumes = ['一','二','三','四','五','六','七','八'];
function copyBlock(c, titleClass='') {
  return `<div class="copy" data-reveal>
    <div class="scene-kicker"><span class="scene-index">卷${volumes[inputs.chapters.indexOf(c)] || esc(c.index)}</span>${esc(c.copy.eyebrow)}</div>
    <${c === inputs.chapters[0] ? 'h1' : 'h2'} class="scene-title ${titleClass}"><span class="zh">${esc(c.copy.title_zh)}</span>${c.copy.title_en ? `<span class="en">${esc(c.copy.title_en)}</span>` : ''}</${c === inputs.chapters[0] ? 'h1' : 'h2'}>
    <p class="scene-body">${esc(c.copy.body)}</p>
    ${c.copy.note ? `<p class="scene-note">${esc(c.copy.note)}</p>` : ''}
  </div>`;
}

function sceneAttrs(c, p) {
  const m = p.motion;
  const slow = ['interior','time'].includes(c.scene_type) ? 'true' : 'false';
  return `id="${esc(c.id)}" class="scene scene--${esc(c.scene_type)}" data-theme="${esc(c === inputs.chapters[0] ? inputs.visual_system.primary_theme : p.theme)}" data-motion-x="${m.x}" data-motion-y="${m.y}" data-scale-from="${m.scale_from}" data-scale-to="${m.scale_to}" data-motion-slow="${slow}"`;
}

function chapterMenu() {
  return `<ol class="hero-chapters">${inputs.chapters.slice(1).map(c => `<li><a href="#${esc(c.id)}"><span>${esc(c.copy.title_zh)}</span><small>${esc(c.index)}</small></a></li>`).join('')}</ol>`;
}
function marks() { return '<span class="cross cross-a" aria-hidden="true">+</span><span class="cross cross-b" aria-hidden="true">+</span>'; }
function renderScene(c) {
  const a = c.asset_ids;
  const attrs = sceneAttrs(c,presets[c.scene_type]);
  if (c.scene_type === 'encounter') return `<section ${attrs} data-pinned><div class="cinema hero-stage"><figure class="scene-media hero-image">${assetImg(a[0])}</figure><div class="hero-shade"></div><div class="hero-title">${copyBlock(c)}<a class="text-link" href="#${esc(inputs.chapters[1]?.id || c.id)}">沿着屋檐，走近一些 <span>↗</span></a></div><div class="hero-index"><span class="micro">CONTENTS / 目次</span>${chapterMenu()}</div><div class="hero-bottom"><span class="micro">木构观记 · ${esc(inputs.subject.name_zh)}</span><p>${esc(inputs.subject.short_description)}</p><span class="scroll-hint">向下探索 <b>↓</b></span></div>${marks()}<div class="scene-meter" aria-hidden="true"><i></i></div></div></section>`;
  if (c.scene_type === 'verticality') return `<section ${attrs} data-pinned><div class="cinema rise-stage"><figure class="scene-media">${assetImg(a[0])}</figure><div class="rise-shade"></div><div class="vertical-copy">${copyBlock(c)}</div><div class="eave-lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="rise-caption micro">视线向上 / FOLLOW THE EAVES</div></div></section>`;
  if (c.scene_type === 'structure') return `<section ${attrs}><div class="frame"><div class="editorial-head">${copyBlock(c)}<span class="large-index" aria-hidden="true">${esc(c.index)}</span></div><div class="atlas"><figure class="scene-media atlas-main" data-reveal>${assetImg(a[0])}<figcaption><span>01 / 檐下</span><span>层叠的节奏</span></figcaption></figure><figure class="scene-media atlas-crop" data-reveal>${assetImg(a[0])}<figcaption><span>02 / 相接</span><span>局部观察 ↗</span></figcaption></figure><div class="atlas-note" data-reveal><span class="micro">ANATOMY OF TIMBER</span><p>层层叠叠，<br>也彼此相依。</p><a class="text-link" href="#${esc(inputs.chapters.find(x=>x.scene_type==='detail')?.id || c.id)}">走近木纹 <span>↗</span></a></div></div></div></section>`;
  if (c.scene_type === 'detail') return `<section ${attrs}><div class="detail-heading frame">${copyBlock(c)}<span class="micro">DETAIL STUDY / 同一母版局部</span></div><div class="detail-window"><div class="detail-track"><figure class="scene-media detail-wide">${assetImg(a[0])}</figure><figure class="scene-media detail-close">${assetImg(a[0])}</figure><div class="detail-end" aria-hidden="true">木<br>有<br>纹</div></div></div><div class="frame detail-foot micro"><span>从构件到纹理</span><span>THE MATERIAL REMEMBERS</span></div></section>`;
  if (c.scene_type === 'interior') return `<section ${attrs} data-pinned><div class="cinema portal-stage"><figure class="scene-media">${assetImg(a[0])}</figure><div class="portal-shade"></div><div class="portal-copy">${copyBlock(c)}</div><span class="portal-label micro">光，停在木的边缘。</span><span class="portal-border" aria-hidden="true"></span></div></section>`;
  if (c.scene_type === 'time') return `<section ${attrs}><div class="frame"><div class="editorial-head">${copyBlock(c)}<p class="micro">整体 / 局部<br>一张图像，两种距离</p></div><div class="compare" style="--split:50%"><figure class="compare-base">${assetImg(a[0])}</figure><figure class="compare-detail">${assetImg(a[1] || a[0])}</figure><span class="compare-tag first">整体</span><span class="compare-tag second">局部</span><span class="compare-divider" aria-hidden="true"><b>↔</b></span></div><label class="compare-control">调整观看距离<input type="range" min="0" max="100" value="50" aria-label="整体与局部图像分界" /><output>50%</output></label></div></section>`;
  if (c.scene_type === 'preservation') return `<section ${attrs}><div class="frame preservation-grid"><div>${copyBlock(c)}<details class="field-note"><summary>图像与记录的边界 <span>+</span></summary><p>本页图像是视觉演绎。正式的建筑记录需要可核验的地点、拍摄时间、来源与授权信息。</p></details><details class="field-note"><summary>继续观看的方法 <span>+</span></summary><p>先看整体轮廓，再观察构件关系，最后停留在材料表面。将观察与事实判断分别记录。</p></details></div><figure class="scene-media survey-media" data-reveal>${assetImg(a[0])}<svg class="survey-lines" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M40 40H560V760H40ZM300 20V780M20 400H580M40 120H560M40 680H560"/></svg><span class="survey-label micro">观察图版 / 非测绘图</span></figure></div></section>`;
  if (c.scene_type === 'afterimage') return `<section ${attrs}><figure class="scene-media closing-image">${assetImg(a[0])}</figure><div class="closing-shade"></div><div class="frame closing-copy">${copyBlock(c)}<a class="text-link" href="#${esc(inputs.chapters[0].id)}">再看一遍 <span>↑</span></a></div><span class="closing-word" aria-hidden="true">木构观记</span></section>`;
  return '';
}

const navigationChapters = inputs.navigation.chapter_ids.map(id => { if (!byChapter[id]) throw new Error(`Unknown navigation chapter: ${id}`); return byChapter[id]; });
const rail = inputs.chapters.map(c => `<a href="#${esc(c.id)}" aria-label="${esc(c.copy.title_zh)}">${esc(c.index)}</a>`).join('');
const credits = (inputs.imagery.documentary_sources || []).map(s => `<li>${esc(s.asset_id)} · ${esc(s.author || '作者未注明')} · ${esc(s.license)} — <a href="${esc(safeUrl(s.source_url))}">图像来源</a></li>`).join('');
const sourceItems = inputs.subject.sources.map(s => `<li>${esc(s.title)}${s.url ? ` — <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noreferrer noopener">source</a>` : ''}${s.note ? `<small>${esc(s.note)}</small>` : ''}</li>`).join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(inputs.subject.name_zh)} — Heritage Motion</title>
<meta name="description" content="${esc(inputs.subject.short_description)}" />
<style>${css}</style>
</head>
<body data-motion-tier="${esc(inputs.imagery.motion_tier)}" data-accent="${esc(inputs.visual_system.accent)}" data-title-language="${esc(inputs.visual_system.title_language)}" data-image-finish="${esc(inputs.visual_system.image_finish)}">
<div class="shell">
  <a class="skip-link" href="#${esc(inputs.chapters[0].id)}">跳到正文</a>
  <header class="nav"><a class="brand" href="#${esc(inputs.chapters[0].id)}"><span class="brand-seal" aria-hidden="true">木</span><span class="brand-zh">木构观记</span><span class="brand-en">A STUDY IN TIMBER</span></a><span class="nav-place">${esc(inputs.subject.name_zh)} / ${esc(inputs.subject.location)}</span><button class="menu-toggle" aria-controls="chapter-menu" aria-expanded="false">目次 <span>＋</span></button></header>
  <div class="page-grid" aria-hidden="true"><i></i><i></i></div>
  <aside class="progress-rail" aria-label="章节进度">${rail}</aside>
  <dialog id="chapter-menu"><div class="menu-head"><span class="micro">木构观记 / 目次</span><button class="menu-close" aria-label="关闭目录">关闭 ×</button></div><nav aria-label="${esc(inputs.navigation.label_zh)}"><ul class="nav-list">${navigationChapters.map(c=>`<li><a href="#${esc(c.id)}"><small>${esc(c.index)}</small><span>${esc(c.copy.title_zh)}</span><em>${esc(c.copy.title_en)}</em><b>↗</b></a></li>`).join('')}</ul></nav></dialog>
  <main>${inputs.chapters.map(renderScene).join('\n')}</main>
  <section class="sources"><div class="frame"><h2>来源与事实边界</h2><ul class="source-list">${sourceItems || '<li>No sources supplied.</li>'}${credits}</ul></div></section>
  <footer class="footer"><div class="frame"><span>${esc(inputs.subject.name_zh)} · ${esc(inputs.subject.name_en)}</span><span>建筑 · 材料 · 时间</span></div></footer>
</div>
<script>${motion}</script>
</body>
</html>`;

await fs.writeFile(outputPath, html.replace(/^[ \t]+$/gm, ''));
console.log(`built: ${outputPath}`);
