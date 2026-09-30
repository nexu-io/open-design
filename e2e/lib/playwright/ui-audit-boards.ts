/* Render screenshot-backed Current boards only; run from e2e:
 * with-env pnpm exec tsx lib/playwright/ui-audit-boards.ts
 * No browser/service is started. Never use design images as actual frames.
 */
import { readFile, writeFile, mkdir, copyFile, cp, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const audit = resolve(root, '.tmp/ui-audit');
const boards = resolve(audit, 'output/boards');
const captures = resolve(audit, 'output/captures/actual');
const source = resolve(audit, 'captures/actual');
const index = await readFile(resolve(audit, 'inventory.md'), 'utf8');
const section = index.split('## 当前有效状态')[1]?.split('## 作废')[0] ?? '';
const states = section.split('\n').filter(line => /^\| [A-Z][A-Z0-9-]* \|/.test(line)).map(line => {
  const [id, name, side, design, entry] = line.split('|').slice(1).map(cell => cell.trim());
  return { id: id ?? '', name: name ?? '', side: side ?? '', design: design ?? '', entry: entry ?? '' };
});
const names = ['map','publish','open','comment','owner','update','dialogs'];
const groups = ['Chain-0','Chain-1','Chain-2','Chain-3','Chain-4','Chain-5','Chain-6'];
const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const available = new Map<string, { screenshot: string; secondaryScreenshot?: string; provenance: string; styles: string }>();
await mkdir(boards, { recursive: true }); await mkdir(captures, { recursive: true });
for (const state of states) {
  try {
    const bytes = await readFile(resolve(source, `${state.id}.png`));
    if (bytes.length < 100 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') continue;
    const data = JSON.parse(await readFile(resolve(source, `${state.id}.json`), 'utf8')) as Record<string, unknown>;
    if (data.id !== state.id || !data.source || !['actual-ui','actual-mock','actual-real'].includes(String(data.source))) continue;
    // Error-code E2/E3 inversion is the audited discrepancy itself. For every
    // other state, an observed fallback screen is evidence of unreachability,
    // not a valid visual frame of the requested state.
    if (data.observedState !== state.id && !['E2','E3'].includes(state.id)) continue;
    const elements = Array.isArray(data.elements) ? data.elements as Array<Record<string, unknown>> : [];
    const styles = elements.slice(0,6).map(el => {
      const s = (el.style ?? {}) as Record<string,unknown>;
      return `${String(el.tag ?? '')} ${String(el.text ?? '').slice(0,20)}: ${s.color ?? ''} ${s.fontSize ?? ''} ${s.width ?? ''}×${s.height ?? ''} r${s.borderRadius ?? ''}`;
    }).join('；');
    await copyFile(resolve(source, `${state.id}.png`), resolve(captures, `${state.id}.png`));
    available.set(state.id, { screenshot: `../captures/actual/${state.id}.png`, provenance: String(data.source), styles });
  } catch { /* Missing or unverifiable actual capture is excluded, never synthesized. */ }
}
// A prior accepted frame can later be disproved (C2 hover is one example).
// Remove only stale copied state PNGs; retain the original screenshot as issue evidence.
// Cross-end states require two independently captured Playwright frames. A lone
// OD or Vela image never certifies a cross-end state; both remain mock evidence.
for (const id of ['O1','O2','O3','O5','O6','O7','O8']) {
  try {
    let styles = 'OD / vela 双端独立截图；见各自 JSON';
    const halves = await Promise.all((['OD','vela'] as const).map(async side => {
      const half = `${id}-${side}`;
      const bytes = await readFile(resolve(source, `${half}.png`));
      const data = JSON.parse(await readFile(resolve(source, `${half}.json`), 'utf8')) as Record<string,unknown>;
      if (bytes.length < 100 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a'
          || data.id !== half || data.observedState !== half || data.source !== 'actual-mock'
          || typeof data.text !== 'string' || !data.text.trim()) throw new Error(`Invalid cross-end half: ${half}`);
      return { half, data };
    }));
    if (id === 'O1') {
      const od = halves[0]!.data, vela = halves[1]!.data;
      if (od.mockWorkspaceType !== 'team' || typeof od.authorKey !== 'string' || !/^[a-f0-9]{64}$/.test(od.authorKey)
          || od.authorKey !== vela.authorKey || vela.memberId !== 'mem-other-team-member'
          || !String(od.text).includes('来自团队成员的评论') || !String(vela.text).includes('来自团队成员的评论')) throw new Error('O1 member author halves do not match');
      styles = '团队身份与作者键双端一致；两端均为独立 GET 假数据，非真实投递';
    }
    if (id === 'O5') {
      const od = halves[0]!.data, vela = halves[1]!.data;
      const odColors = od.avatarColors, velaColors = vela.avatarColors;
      if (typeof od.authorKey !== 'string' || !/^[a-f0-9]{64}$/.test(od.authorKey) || od.authorKey !== vela.authorKey
          || !Array.isArray(odColors) || odColors.length !== 2 || odColors[0] !== odColors[1]
          || !Array.isArray(velaColors) || velaColors.length !== 2 || velaColors[0] !== velaColors[1]
          || odColors[0] !== velaColors[0] || vela.pinColor !== velaColors[0]
          || !Array.isArray(od.pinColors) || od.pinColors.length !== 2
          || od.pinColors.some(color => color !== 'rgb(217, 106, 70)')) throw new Error('O5 author/pin colors did not match');
      styles = `同键头像 ${odColors[0]}；OD 图钉 ${od.pinColors[0]}；分享页图钉 ${vela.pinColor}`;
    }
    if (id === 'O6') {
      const od = halves[0]!.data, vela = halves[1]!.data;
      if (typeof od.ownerComment !== 'string' || od.ownerComment !== vela.ownerComment
          || !String(od.text).includes(od.ownerComment) || !String(vela.text).includes(od.ownerComment)
          || vela.isMine !== true || typeof od.mockProvenance !== 'string'
          || typeof vela.mockProvenance !== 'string') throw new Error('O6 static owner comment witnesses differ');
      styles = 'Owner 本地/分享页双端各自 GET 模拟；未验证分享页发出→客户端回流';
    }
    if (id === 'O7') {
      const od = halves[0]!.data, vela = halves[1]!.data;
      if (typeof od.frozenNow !== 'string' || od.frozenNow !== vela.frozenNow
          || typeof od.commentCreatedAt !== 'string' || od.commentCreatedAt !== vela.commentCreatedAt
          || od.displayedTime !== '昨天' || vela.displayedTime !== '2 小时前') throw new Error('O7 frozen-time witnesses differ');
      styles = `同一时间与评论：OD ${od.displayedTime}；vela ${vela.displayedTime}（UI-029）`;
    }
    if (id === 'O8') {
      const od = halves[0]!.data, vela = halves[1]!.data;
      if (!Array.isArray(od.keys) || od.keys.length !== 30 || od.keys.some(key => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))
          || JSON.stringify(od.keys) !== JSON.stringify(vela.keys)
          || !Array.isArray(od.palette) || od.palette.length !== 30
          || !Array.isArray(vela.palette) || vela.palette.length !== 30
          || new Set(od.palette.map(item => item.color)).size !== 30
          || JSON.stringify(od.palette) !== JSON.stringify(vela.palette)
          || od.apiInputOrder !== 'ascending' || vela.apiInputOrder !== 'descending'
          || JSON.stringify(od.displayedIndexes) !== JSON.stringify(Array.from({length:30},(_,index)=>29-index))
          || JSON.stringify(vela.displayedIndexes) !== JSON.stringify(od.displayedIndexes)) throw new Error('O8 30-color parity or input/display order witnesses differ');
      styles = 'API 输入顺序相反；双端 UI 都显示 29→0；逐 authorKey 对应 30 个一致且互异的实际 CSS 色值';
    }
    await Promise.all(halves.map(({half}) => copyFile(resolve(source, `${half}.png`), resolve(captures, `${half}.png`))));
    available.set(id, { screenshot: `../captures/actual/${halves[0]!.half}.png`, secondaryScreenshot: `../captures/actual/${halves[1]!.half}.png`, provenance: 'paired-mocks', styles });
  } catch (error) { console.warn(`${id}: paired screenshot excluded: ${String(error)}`); }
}
const knownIds = new Set(states.map(state => state.id));
for (const name of await readdir(captures)) {
  const id = name.endsWith('.png') ? name.slice(0, -4) : '';
  const pair = id.match(/^(O1|O2|O3|O5|O6|O7|O8)-(?:OD|vela)$/)?.[1];
  if ((knownIds.has(id) && !available.has(id)) || (pair && !available.has(pair))) await unlink(resolve(captures, name));
}
const head = await readFile(resolve(audit, 'input/board-head.tpl'), 'utf8');
await copyFile(resolve(audit, 'input/boards/Chain-1-publish/support.js'), resolve(boards, 'support.js'));
await cp(resolve(audit, 'input/boards/Chain-1-publish/vendor'), resolve(boards, 'vendor'), { recursive:true });
for (let i=0;i<names.length;i++) {
  const group = i === 0 ? states : states.filter(s => s.design.startsWith(groups[i] ?? 'NO MATCH') || (i===4 && s.design.startsWith('研发补（Chain-4')) || (i===2 && s.design.startsWith('研发补（Chain-2')) || (i===3 && s.design.startsWith('研发补（Chain-3')) || (i===5 && s.design.startsWith('研发补（Chain-5')) || (i===6 && s.design.startsWith('研发补（Chain-6')) || (i===1 && s.design.startsWith('研发补（Chain-1')));
  const present = group.filter(s => available.has(s.id));
  if (i !== 0 && !present.length) continue;
  const cards = i === 0 ? group.map(s => `<tr><td class="k">${escape(s.id)}</td><td>${escape(s.name)}</td><td>${escape(s.side)}</td><td>${available.has(s.id) ? `<a href="Current-${i === 0 ? groupIndex(s.design) : i}-${names[groupIndex(s.design)]}.dc.html#${escape(s.id)}">现状帧</a>` : '—'}</td></tr>`).join('') : present.map(s => {
    const a = available.get(s.id)!;
    const paired = a.secondaryScreenshot ? `<img src="${escape(a.secondaryScreenshot)}" alt="${escape(s.name)} · vela Playwright 实际截图" />` : '';
    return `<article class="frame" id="${escape(s.id)}"><div class="meta"><strong>${escape(s.id)}</strong> ${escape(s.name)} <span>${escape(s.side)}</span></div><img src="${escape(a.screenshot)}" alt="${escape(s.name)} · ${paired ? 'OD ' : ''}Playwright 实际截图" />${paired}<p>进入条件：${escape(s.entry)}</p><p>数据来源：${a.provenance === 'paired-mocks' ? 'OD / vela 各自接口假数据；非同一生产事件' : a.provenance === 'actual-mock' ? '接口假数据' : '真实流程'}</p><p>关键样式：${escape(a.styles || '样式 JSON 待补齐')}</p></article>`;
  }).join('');
  const body = i === 0 ? `<table class="tbl"><thead><tr><th>编号</th><th>名称</th><th>端</th><th>现状画板</th></tr></thead><tbody>${cards}</tbody></table>` : `<div class="grid">${cards}</div>`;
  const html = `${head}\n<style>.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.frame{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;min-width:0}.frame img{display:block;width:100%;height:auto;border:1px solid #ddd}.frame p{font:13px/1.6 system-ui;color:#444}.meta{display:flex;gap:10px;align-items:center;margin-bottom:12px;font:15px system-ui}.meta strong{font:700 14px monospace}.meta span{color:#888}</style>\n<div class="board" style="width:3200px;min-height:1200px"><p class="kicker">实际 UI · Playwright 截图</p><h1 class="title">Current-${i} · ${names[i]}</h1>${body}</div></x-dc><script data-dc-script data-props='{"$preview":{"width":3200,"height":1200}}'>class Component extends DCLogic { renderVals(){return {}} }</script></body></html>`;
  await writeFile(resolve(boards, `Current-${i}-${names[i]}.dc.html`), html);
}
function groupIndex(design:string):number {const match=design.match(/Chain-(\d)/); return match ? Math.min(6, Number(match[1])) : 4;}
console.log(JSON.stringify({ actualFrames: available.size, boards: (await readdir(boards)).filter(x=>x.endsWith('.dc.html')) }));
