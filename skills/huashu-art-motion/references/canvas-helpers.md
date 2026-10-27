# 可复用 Canvas 工具代码

按下面顺序按需复制到宿主允许的 HTML 或工程中。保留 MIT 署名。只包含通用绘画、时序与镜头函数，不包含作者人物、字体、样片或独立渲染服务。先加载 util；其余只加载实际用到的模块。

## util.js

来源：https://github.com/alchaincyf/huashu-art-motion/blob/d861767d180008d27675819932070a670a3ae43f/scripts/engine/lib/util.js

```javascript
// 通用工具（最先加载，转场库与引擎共用）
(() => {
// ---------- 工具 ----------
window.U = {
  TAU: Math.PI * 2,
  clamp: (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
  lerp: (a, b, p) => a + (b - a) * p,
  // smoothstep：x 在 [a,b] 内平滑地从 0 走到 1（开场写出、渐显、段内节奏都用它）
  ss: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
  // 把 p 的 [a,b] 段线性拉成 0..1（转场里分阶段用）
  seg: (p, a, b) => Math.max(0, Math.min(1, (p - a) / (b - a))),
  // 步进帧率：把连续时间量化成 fps 步——「一顿一顿」是很多风格的味道本身：
  // 橡皮管卡通 12fps（一拍二）、皮影杆操 10fps、哈林跳舞小人 8fps 硬切、手绘线条沸腾 8–12fps、胶片层 24fps。
  stepTime: (t, fps) => Math.floor(t * fps) / fps,
  ease: {
    linear: p => p,
    inOut: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
    out: p => 1 - Math.pow(1 - p, 3),
    in: p => p * p * p,
    outBack: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  },
  // 种子随机：mulberry32
  rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  hash(i, j = 0) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  // 点列 → Path2D（折线）
  poly(pts, closed = true) { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); if (closed) p.closePath(); return p; },
};

// ---------- 画布尺寸 ----------
// 默认 1920×1080。竖屏片段（clip.html，spec.width/height）和竖屏整片（index.html?w=1080&h=1920，或 eras.js 里写 window.FILM_SIZE = [1080, 1920]）
// 启动时调一次 U.setStage(w, h)。用到屏幕尺寸的库（PAINT / BRUSH / RENDER / POST / KIT / TOON / CAM / UI / CH / DG / CL / MD、transitions.js、engine.js）
// 用 U.onStage 登记，尺寸一改全部跟着改；登记时立刻按当前尺寸回调一次，后加载的库也拿得到。
// 35 种艺术风格场景（scenes/）是按 1920×1080 画的，竖屏只保证解说语法、转场和引擎本身。
const stageHooks = [];
window.STAGE = { W: 1920, H: 1080 };
U.onStage = f => { stageHooks.push(f); f(window.STAGE.W, window.STAGE.H); };
U.setStage = (w, h) => { w = Math.round(+w); h = Math.round(+h); if (!(w > 0 && h > 0)) throw new Error(`U.setStage：尺寸不对 ${w}×${h}`); window.STAGE = { W: w, H: h }; stageHooks.forEach(f => f(w, h)); };

// ---------- 字形检查 ----------
// 字体文件缺某个字时浏览器会静默回退到系统字体：measureText 不报错、宽度也对，换台机器就变样（迁移测试 B、D：全角字母、▶、「戏」「蓝」都踩过）。
// 做法：启动时（engine boot，字体加载完）把 FONT_FACES 里每个字体文件的 cmap 表读出来（WOFF1 用 DecompressionStream 解 zlib），查表判断有没有这个字。
// 不用 measureText 对比回退字体：macOS 上 Chromium 的逐字回退以首选字体为基准挑系统字体，两种写法会落到不同字体上，缺字也测不出来（实测误判）。
// font 可以是 family 名（'LXGWWenKai-500'）或 CSS 字体串（'80px "LXGWWenKai-500"'）。family 不在 FONT_FACES 里 → 当作全缺。
const famOf = font => { const m = /"([^"]+)"/.exec(font) || /'([^']+)'/.exec(font); return m ? m[1] : String(font).replace(/^(italic\s+|bold\s+|\d+\s+)*[\d.]+px\s+/, '').trim(); };
const CMAPS = {};
const inflate = async (buf) => new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
async function readCmap(url) {
  const ab = await (await fetch(url)).arrayBuffer(), dv = new DataView(ab), sig = dv.getUint32(0);
  let tab = null;
  if (sig === 0x774F4646) {                                            // 'wOFF'
    const n = dv.getUint16(12);
    for (let i = 0; i < n; i++) { const o = 44 + i * 20; if (dv.getUint32(o) !== 0x636D6170) continue;   // 'cmap'
      const off = dv.getUint32(o + 4), comp = dv.getUint32(o + 8), orig = dv.getUint32(o + 12), raw = new Uint8Array(ab, off, comp);
      tab = comp < orig ? await inflate(raw) : raw.slice(); }
  } else {                                                             // 裸 TTF/OTF
    const n = dv.getUint16(4);
    for (let i = 0; i < n; i++) { const o = 12 + i * 16; if (dv.getUint32(o) === 0x636D6170) tab = new Uint8Array(ab, dv.getUint32(o + 8), dv.getUint32(o + 12)).slice(); }
  }
  if (!tab) throw new Error('没有 cmap 表');
  const t = new DataView(tab.buffer, tab.byteOffset, tab.byteLength), set = new Set(), nt = t.getUint16(2);
  for (let i = 0; i < nt; i++) {
    const so = t.getUint32(4 + i * 8 + 4), fmt = t.getUint16(so);
    if (fmt === 4) { const segX2 = t.getUint16(so + 6), ends = so + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ros = deltas + segX2;
      for (let k = 0; k < segX2 / 2; k++) { const e = t.getUint16(ends + k * 2), s = t.getUint16(starts + k * 2), d = t.getInt16(deltas + k * 2), ro = t.getUint16(ros + k * 2);
        for (let ch = s; ch <= e && ch !== 0xFFFF; ch++) { let g; if (!ro) g = (ch + d) & 0xFFFF; else { g = t.getUint16(ros + k * 2 + ro + (ch - s) * 2); if (g) g = (g + d) & 0xFFFF; } if (g) set.add(ch); } } }
    else if (fmt === 12 || fmt === 13) { const ng = t.getUint32(so + 12); for (let k = 0; k < ng; k++) { const o = so + 16 + k * 12, s = t.getUint32(o), e = t.getUint32(o + 4), g = t.getUint32(o + 8);
      for (let ch = s; ch <= e; ch++) if (fmt === 13 ? g : g + ch - s) set.add(ch); } }
    else if (fmt === 0) { for (let ch = 0; ch < 256; ch++) if (t.getUint8(so + 6 + ch)) set.add(ch); }
    else if (fmt === 6) { const first = t.getUint16(so + 6), cnt = t.getUint16(so + 8); for (let k = 0; k < cnt; k++) if (t.getUint16(so + 10 + k * 2)) set.add(first + k); }
  }
  return set;
}
// 引擎 boot 里调用一次（字体加载之后）。读失败的字体记 console.error，不阻断启动。
U.loadCmaps = async (faces = window.FONT_FACES || []) => {
  await Promise.all(faces.map(async f => { try { CMAPS[f.family] = await readCmap(f.url); } catch (e) { console.error(`读不了字体 ${f.family} 的 cmap：${e}`); } }));
};
U.missingGlyphs = (font, text) => {
  const fam = famOf(font), cm = CMAPS[fam];
  const chars = [...new Set([...String(text)])].filter(ch => !/\s/.test(ch));
  if (!cm) return chars;
  return chars.filter(ch => !cm.has(ch.codePointAt(0)));
};
// 缺字就 console.error（qa.py / render.py 会把页面 console.error 当失败）。返回 true = 全都有。
U.assertGlyphs = (font, text, where = '') => {
  const fam = famOf(font), miss = U.missingGlyphs(font, text);
  if (miss.length) console.error(!CMAPS[fam] ? `字体「${fam}」没注册或没读到 cmap（lib/fonts.js 的 FONT_FACES）${where ? '（' + where + '）' : ''}`
    : `缺字形：字体「${fam}」里没有「${miss.join('')}」${where ? '（' + where + '）' : ''}——会静默回退系统字体。用 scripts/font_subset.py 补进子集，或改用路径自画。`);
  return miss.length === 0;
};
U.fontFamily = famOf;

})();
```

## paint.js

来源：https://github.com/alchaincyf/huashu-art-motion/blob/d861767d180008d27675819932070a670a3ae43f/scripts/engine/lib/paint.js

```javascript
// 纯代码绘画工具库：噪声、纹理、手绘线、风格渲染器（笔触/色点/马赛克/网点/像素/切面）、共享编舞。
// 约定：所有随机都用种子；「抖动线条」按 boilFps 换种子（手绘动画的 boiling line），其余保持帧间稳定。
(() => {
let W = 1920, H = 1080; U.onStage((w, h) => { W = w; H = h; });   // 画布尺寸跟 U.setStage 走（默认 1920×1080）
const P = window.PAINT = {};
const { clamp, lerp, ease, rng } = U;

// ---------- 画布 ----------
P.canvas = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const CACHE = {};
P.cached = (key, w, h, fn) => { if (!CACHE[key]) { const c = P.canvas(w, h); fn(c.getContext('2d'), c); CACHE[key] = c; } return CACHE[key]; };
P.scratch = (key) => { if (!CACHE['s_' + key]) CACHE['s_' + key] = P.canvas(); return CACHE['s_' + key]; };

// ---------- 噪声 ----------
const perm = new Uint8Array(512); { const r = rng(1337); const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y) => { const u = (h & 1) ? x : -x, v = (h & 2) ? y : -y; return (h & 4) ? u + v * 0.5 : u * 0.5 + v; };
P.noise = (x, y) => {                                   // Perlin 2D，约 [-1,1]
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y), a = perm[X] + Y, b = perm[X + 1] + Y;
  return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u), lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
};
P.fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * P.noise(x * f, y * f); a *= 0.5; f *= 2; } return s; };

// ---------- 颜色 ----------
P.hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
P.rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
P.mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
P.jitter = (c, r, amt) => [c[0] + (r() - .5) * amt, c[1] + (r() - .5) * amt, c[2] + (r() - .5) * amt];

// ---------- 纹理（缓存） ----------
// 纸/墙/岩石：底色 + 多层噪声斑驳 + 细颗粒
P.texture = (key, base, opt = {}) => P.cached('tex_' + key, W, H, (g) => {
  const { scale = 0.004, amt = 26, grain = 14, dark = null, seed = 1 } = opt;
  const img = g.createImageData(W, H), d = img.data, b = P.hex(base), r = rng(seed);
  const dk = dark ? P.hex(dark) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = P.fbm(x * scale + seed, y * scale, 5), gr = (r() - .5) * grain;
    const i = (y * W + x) * 4;
    let c = b;
    if (dk) c = P.mix(b, dk, clamp(n * 1.2 + 0.25));
    d[i] = c[0] + n * amt + gr; d[i + 1] = c[1] + n * amt + gr; d[i + 2] = c[2] + n * amt * 0.8 + gr; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});
// 颗粒噪点叠层（扁平插画的 grain、旧印刷）：透明底上的随机点
P.grain = (key, density = 0.08, col = [0, 0, 0], alpha = 0.18) => P.cached('grain_' + key, W, H, (g) => {
  const img = g.createImageData(W, H), d = img.data, r = rng(key.length * 97 + 3);
  for (let i = 0; i < W * H; i++) if (r() < density) { d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255 * alpha * (0.4 + r() * 0.6); }
  g.putImageData(img, 0, 0);
});
// 龟裂纹（古典油画）：随机游走的细裂线网
P.craquelure = (key, alpha = 0.35) => P.cached('crack_' + key, W, H, (g) => {
  const r = rng(77); g.strokeStyle = `rgba(40,25,10,${alpha})`; g.lineWidth = 0.8;
  for (let k = 0; k < 900; k++) {
    let x = r() * W, y = r() * H, a = r() * Math.PI * 2; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6 + r() * 10; s++) { a += (r() - .5) * 1.6; x += Math.cos(a) * (6 + r() * 14); y += Math.sin(a) * (6 + r() * 14); g.lineTo(x, y); }
    g.stroke();
  }
});

// ---------- 手绘线 ----------
// 把折线/曲线采样后加噪声抖动；boil = 当前时间换种子的频率（0 = 不抖）
P.boilSeed = (t, fps = 12) => Math.floor(t * fps);
P.roughPath = (c, pts, { amp = 2, seed = 1, closed = false, step = 6 } = {}) => {
  const r = rng(seed);
  // 先按 step 重采样
  const out = [];
  const N = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) { const q = k / n; out.push([lerp(a[0], b[0], q) + (r() - .5) * amp, lerp(a[1], b[1], q) + (r() - .5) * amp]); }
  }
  if (!closed) out.push([pts[pts.length - 1][0] + (r() - .5) * amp, pts[pts.length - 1][1] + (r() - .5) * amp]);
  c.beginPath(); out.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); if (closed) c.closePath();
};
// 三次贝塞尔采样成点列（便于 roughPath / 变形）
P.bez = (p0, p1, p2, p3, n = 24) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } return o; };
// SVG path 字符串 → Path2D（写复杂轮廓最省事）
P.path = (d) => new Path2D(d);

// ---------- 风格渲染器（对一张底稿 canvas 做「重画」） ----------
// 1) 流场笔触（梵高/印象派）：在抖动网格上取底稿颜色，沿 angle(x,y,t) 画短笔触，带深色描边
//    cap：宽笔（width ≥ 30）密排时圆头会连成一排排「人头/鹅卵石」（迁移测试 D 蓝色时期），改 'butt'。
//    boil：只给母题区域沸腾，静止区（地板、道具、角色）boil=0 种子固定——全屏 8fps 换种子读成满屏闪烁（迁移测试 C 莫奈）。
P.strokes = (dst, src, { cell = 12, len = 22, width = 7, angle, seed = 1, t = 0, boil = 8, outline = 0.35, outlineCol = [20, 25, 60], outlineMix = 0.55, jitterCol = 18, mask, alphaMask = false, palette, cap = 'round' } = {}) => {
  const sd = src.getContext('2d').getImageData(0, 0, W, H).data;
  const r = rng(seed * 1000 + P.boilSeed(t, boil));
  dst.lineCap = cap;
  for (let y = 0; y < H + cell; y += cell) for (let x = 0; x < W + cell; x += cell) {
    const px = x + (r() - .5) * cell, py = y + (r() - .5) * cell;
    const ix = clamp(px | 0, 0, W - 1), iy = clamp(py | 0, 0, H - 1), i = (iy * W + ix) * 4;
    if (mask && !mask(px, py)) continue;
    if (alphaMask && sd[i + 3] < 200) continue;
    let col = [sd[i], sd[i + 1], sd[i + 2]];
    const pc = palette ? palette(px, py, col, r) : null; if (pc) col = pc;       // 区域色板：从色组里抽一个颜色
    const a = angle ? angle(px, py, t) : 0, l = len * (0.7 + r() * 0.6);
    const dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2;
    if (outline > 0) { dst.strokeStyle = P.rgb(P.mix(col, outlineCol, outlineMix), outline); dst.lineWidth = width + 2.5; dst.beginPath(); dst.moveTo(px - dx, py - dy); dst.lineTo(px + dx, py + dy); dst.stroke(); }
    dst.strokeStyle = P.rgb(pc ? col : P.jitter(col, r, jitterCol)); dst.lineWidth = width;
    dst.beginPath(); dst.moveTo(px - dx, py - dy); dst.lineTo(px + dx, py + dy); dst.stroke();
  }
};
// 色组工具：给一组 hex 和权重，返回按随机数抽色的函数（配 strokes 的 palette 用）；mixBase 把底稿色混进来保留明暗
P.swatch = (hexes, mixBase = 0.35) => { const cs = hexes.map(P.hex); return (col, r) => { const k = cs[(r() * cs.length) | 0]; return P.mix(k, col, mixBase); }; };
// 2) 色点（印象派）：椭圆短点，颜色带冷暖偏移、大小不一。注意这不是点彩——修拉的点彩是「等大点＋纯色板视觉混色」，用 P.pointillism（lib/render.js）
P.dabs = (dst, src, { cell = 10, size = 9, seed = 2, t = 0, boil = 8, angle = -0.6, shift = 22 } = {}) => {
  const sd = src.getContext('2d').getImageData(0, 0, W, H).data, r = rng(seed * 1000 + P.boilSeed(t, boil));
  for (let y = 0; y < H + cell; y += cell) for (let x = 0; x < W + cell; x += cell) {
    const px = x + (r() - .5) * cell * 1.2, py = y + (r() - .5) * cell * 1.2;
    const i = (clamp(py | 0, 0, H - 1) * W + clamp(px | 0, 0, W - 1)) * 4;
    const warm = r() < 0.5 ? [shift, shift * 0.5, -shift] : [-shift * 0.6, 0, shift];
    dst.fillStyle = `rgb(${sd[i] + warm[0]},${sd[i + 1] + warm[1]},${sd[i + 2] + warm[2]})`;
    dst.beginPath(); dst.ellipse(px, py, size * (0.8 + r() * 0.6), size * 0.45, angle + (r() - .5) * 0.5, 0, Math.PI * 2); dst.fill();
  }
};
// 3) 马赛克：带缝隙的小石块，颜色取中心，略有抖动与倒角
P.mosaic = (dst, src, { tile = 14, grout = '#3b352e', seed = 3, jitter = 0.25 } = {}) => {
  const sd = src.getContext('2d').getImageData(0, 0, W, H).data, r = rng(seed);
  dst.fillStyle = grout; dst.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += tile) { const off = (y / tile) % 2 ? tile * 0.5 * jitter : 0; for (let x = -tile; x < W; x += tile) {
    const cx = x + off + tile / 2, cy = y + tile / 2, i = (clamp(cy | 0, 0, H - 1) * W + clamp(cx | 0, 0, W - 1)) * 4;
    const c = P.jitter([sd[i], sd[i + 1], sd[i + 2]], r, 14), s = tile * (0.82 + r() * 0.1);
    dst.fillStyle = P.rgb(c); dst.fillRect(cx - s / 2 + (r() - .5) * 1.5, cy - s / 2 + (r() - .5) * 1.5, s, s);
    dst.fillStyle = 'rgba(255,255,255,.12)'; dst.fillRect(cx - s / 2, cy - s / 2, s, 2);
  } }
};
// 4) 网点（本戴点）：颜色取中心，半径随暗度
P.halftone = (dst, src, { cell = 14, paper = '#f4ecd8', seed = 4 } = {}) => {
  const sd = src.getContext('2d').getImageData(0, 0, W, H).data;
  dst.fillStyle = paper; dst.fillRect(0, 0, W, H);
  for (let y = 0; y < H + cell; y += cell) for (let x = 0; x < W + cell; x += cell) {
    const cx = x + ((y / cell) % 2) * cell / 2, i = (clamp(y | 0, 0, H - 1) * W + clamp(cx | 0, 0, W - 1)) * 4;
    const L = (sd[i] * .3 + sd[i + 1] * .59 + sd[i + 2] * .11) / 255;
    dst.fillStyle = `rgb(${sd[i]},${sd[i + 1]},${sd[i + 2]})`;
    dst.beginPath(); dst.arc(cx, y, cell * 0.72 * (0.3 + (1 - L) * 0.9), 0, Math.PI * 2); dst.fill();
  }
};
// 5) 像素：最近邻降采样，可选调色板量化
P.pixelate = (dst, src, { size = 8, palette } = {}) => {
  const w = Math.ceil(W / size), h = Math.ceil(H / size), s = P.scratch('px'), g = s.getContext('2d');
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
  if (palette) { const pal = palette.map(P.hex), im = g.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { let best = 0, bd = 1e9; for (let k = 0; k < pal.length; k++) { const q = pal[k], dd = (d[i] - q[0]) ** 2 + (d[i + 1] - q[1]) ** 2 + (d[i + 2] - q[2]) ** 2; if (dd < bd) { bd = dd; best = k; } } d[i] = pal[best][0]; d[i + 1] = pal[best][1]; d[i + 2] = pal[best][2]; }
    g.putImageData(im, 0, 0); }
  dst.imageSmoothingEnabled = false; dst.drawImage(s, 0, 0, w, h, 0, 0, w * size, h * size); dst.imageSmoothingEnabled = true;
};
// 6) 立体主义切面：抖动三角网，每块取「偏移视角」的颜色做线性渐变，描暗边
P.facets = (dst, src, { nx = 22, ny = 13, seed = 5, t = 0, shiftAmt = 26, edge = 'rgba(40,30,20,.45)' } = {}) => {
  const sd = src.getContext('2d').getImageData(0, 0, W, H).data, r = rng(seed);
  const pts = []; for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const e = i === 0 || j === 0 || i === nx || j === ny; pts.push([i / nx * W + (e ? 0 : (r() - .5) * W / nx * .9), j / ny * H + (e ? 0 : (r() - .5) * H / ny * .9)]); }
  const col = (x, y) => { const i = (clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)) * 4; return [sd[i], sd[i + 1], sd[i + 2]]; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = pts[j * (nx + 1) + i], b = pts[j * (nx + 1) + i + 1], c2 = pts[(j + 1) * (nx + 1) + i], d2 = pts[(j + 1) * (nx + 1) + i + 1];
    for (const tri of (r() < .5 ? [[a, b, d2], [a, d2, c2]] : [[a, b, c2], [b, d2, c2]])) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const sh = Math.sin(t * 3 + cx * 0.01) * shiftAmt * r();
      const c0 = col(cx + sh, cy), c1 = P.mix(c0, [60, 45, 30], 0.35);
      const g = dst.createLinearGradient(tri[0][0], tri[0][1], tri[2][0], tri[2][1]); g.addColorStop(0, P.rgb(P.mix(c0, [255, 250, 235], 0.12))); g.addColorStop(1, P.rgb(c1));
      dst.fillStyle = g; dst.beginPath(); tri.forEach((p, k) => k ? dst.lineTo(p[0], p[1]) : dst.moveTo(p[0], p[1])); dst.closePath(); dst.fill();
      dst.strokeStyle = edge; dst.lineWidth = 1.5; dst.stroke();
    }
  }
};

// ---------- 共享编舞：16 个时代用同一套动作曲线，各自用自己的画法画出来 ----------
// lt = 本段局部时间（秒）。返回 0..1 或角度，时代代码按需取用。
// 端杯循环（全片时间）：2.4s 一轮——0.9s 举到嘴边、停 0.7s 喝、0.8s 放回
P.cupCycle = (t, period = 2.4) => { const q = ((t % period) + period) % period;
  if (q < 0.9) return 0.5 - 0.5 * Math.cos(q / 0.9 * Math.PI); if (q < 1.6) return 1; return 0.5 + 0.5 * Math.cos((q - 1.6) / 0.8 * Math.PI); };
P.choreo = (lt, t) => ({
  cupG: P.cupCycle(t),                                         // 按全片时间的端杯（跨段连续：速通片换段时姿势不重置）
  cup: 0.5 - 0.5 * Math.cos(Math.min(1, lt / 0.9) * Math.PI),   // 端杯：0=在桌上 1=在嘴边（约 0.9s 举起）
  sip: Math.max(0, Math.sin(lt * 6)) * 0.15,                    // 喝时头部微仰
  tail: Math.sin(t * 5.2) * 0.35 + Math.sin(t * 11) * 0.08,      // 猫尾摆（弧度）
  blink: (t % 2.3) > 2.18 ? 1 : 0,                              // 眨眼
  ear: Math.max(0, Math.sin(t * 9)) > 0.97 ? 1 : 0,
  breathe: Math.sin(t * 4) * 0.012,
  steam: t,                                                     // 热气用全局时间
});

// ---------- 通用元素 ----------
// 热气：几条随时间上行的正弦曲线（风格化的 S 形可传 width/color）
P.steam = (c, t, x, y, { h = 80, n = 3, color = 'rgba(255,255,255,.8)', width = 4, spread = 16, wobble = 10, seed = 1 } = {}) => {
  c.save(); c.lineCap = 'round'; c.lineWidth = width;
  for (let k = 0; k < n; k++) {
    const ox = (k - (n - 1) / 2) * spread, ph = t * 3 + k * 2.1 + seed;
    const g = c.createLinearGradient(0, y, 0, y - h); g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)'); c.strokeStyle = g;
    c.beginPath(); for (let s = 0; s <= 20; s++) { const q = s / 20; const xx = x + ox + Math.sin(ph - q * 5) * wobble * q, yy = y - q * h; s ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
  }
  c.restore();
};
// 粒子：给定种子与时间，返回确定的粒子位置（飘落/上浮）
P.particles = (n, seed, t, { x0 = 0, x1 = W, y0 = -40, y1 = H + 40, speed = 80, drift = 30, life = 6 } = {}) => {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) { const bx = lerp(x0, x1, r()), ph = r() * life, sp = speed * (0.6 + r() * 0.8), q = ((t + ph) % life) / life;
    out.push({ x: bx + Math.sin((t + ph) * 1.7 + i) * drift, y: lerp(y0, y1, q), a: r() * Math.PI * 2 + t * (r() - .5) * 3, s: 0.6 + r() * 0.8, q, i }); }
  return out;
};
})();
```

## kit.js (geometry only)

只保留 densify、resample、ribbon 几何函数；去掉示范人物与 RIG 依赖。

```javascript
// 跨场景共用的小工具：点列加密/等弧长重采样、可变线宽路径 ribbon、整幅行/列扭曲、手绘不规则圆、全片连续编舞、近侧手臂补盖、角标。
// 渲染器在 lib/brush.js（笔与水）、lib/render.js（网点/点彩/赛璐珞/光影/皮影）、lib/post.js（VHS/胶片/泛光/纹理叠角色）。
(() => {
let W = 1920, H = 1080; U.onStage((w, h) => { W = w; H = h; });   // 画布尺寸跟 U.setStage 走（默认 1920×1080）
const { clamp, lerp, rng } = U;
const K = window.KIT = {};

// Catmull-Rom 加密点列（开放）
K.densify = (pts, per = 6) => {
  const out = [], n = pts.length, P_ = i => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P_(i - 1), p1 = P_(i), p2 = P_(i + 1), p3 = P_(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(pts[n - 1]); return out;
};
// 按弧长等距重采样（让噪声、飞白、行波的频率与笔画长短无关）
K.resample = (pts, step = 4) => {
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let d = step - acc;
    while (d <= L) { const q = d / L; out.push([a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]); d += step; } acc = L - (d - step); }
  out.push(pts[pts.length - 1]); return out;
};
// 可变线宽路径：点列两侧按 w(q) 偏移成闭合多边形（书法线、飘带、表现主义长笔）
K.ribbon = (pts, w) => {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const hw = (typeof w === 'function' ? w(i / (n - 1), i) : w) / 2;
    L.push([pts[i][0] - dy * hw, pts[i][1] + dx * hw]); R.push([pts[i][0] + dy * hw, pts[i][1] - dx * hw]);
  }
  const p = new Path2D(); L.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]));
  for (let i = n - 1; i >= 0; i--) p.lineTo(R[i][0], R[i][1]); p.closePath(); return p;
};
})();
```

## brush.js

来源：https://github.com/alchaincyf/huashu-art-motion/blob/d861767d180008d27675819932070a670a3ae43f/scripts/engine/lib/brush.js

```javascript
// 笔与水：毛笔飞白、两头尖单笔、墨晕晕染、长弯流线笔、水彩洗染、厚涂鬃毛笔、剪刀折线。全部挂在 PAINT（P）上。
// 来源：迁移测试 A（水墨/蒙克）、B（吉卜力）、C（马蒂斯）、D（伦勃朗）。确定性：所有随机都走种子。
//   P.brush(c, pts, opt)            毛笔：笔压起收＋湿笔芯＋逐根笔毛飞白，可按 reveal 写出（水墨、书法、白描衣纹）
//   P.leaf(c, x, y, ang, L, w)      两头尖的单笔（竹叶、兰叶、鸟翅、虾尾）
//   P.inkWash(c, key, grow, fn, o)  墨晕：形状先画到 scratch，再「外晕＋本体」两遍模糊 multiply 到纸上，grow 0→1 是洇开
//   P.flowSeeds / P.flowLines       长弯流线笔：种子沿随时间扭动的方向场积分成 200–300px 的长笔（蒙克，不是梵高的短笔）
//   P.deform / P.watercolor         水彩洗染：中点位移变形多边形 × 多层低 α multiply ＋ 每层淡描边＝水痕边（吉卜力背景）
//   P.rectPts / P.ellipsePts        洗染常用的多边形点列
//   P.impasto(c, pts, w, col, hi)   厚涂鬃毛笔：一笔＝若干平行细鬃（伦勃朗高光、梵高厚涂补笔）
//   P.cut(pts, seed, step, amp)     剪刀折线：沿轮廓每 step px 取点＋抖动、直线相连（马蒂斯剪纸、剪影、木刻）
(() => {
let W = 1920, H = 1080; U.onStage((w, h) => { W = w; H = h; });   // 画布尺寸跟 U.setStage 走（默认 1920×1080）
const P = window.PAINT;
const { clamp, lerp, rng, ss } = U;

// ---------- 毛笔 ----------
// pts 控制点（会 Catmull-Rom 加密再按 4px 等弧长重采样——不重采样的话飞白噪声频率随笔画长短变）
// w 最大宽；tone 墨色透明度（焦 .9／浓 .8／重 .6／淡 .35／清 .15）；dry 0..1 飞白程度（越到笔尾越干）；reveal 0..1 写出比例
// head/tail 起笔/收笔占比；bristles 笔毛数；col 墨色 [r,g,b]；per 加密倍数
// 坑：笔毛必须每根一条连续 path（butt 头）；按小段单独 stroke＋round 头，接头处会叠出一节节深点，像竹节/麻绳。
P.brush = (c, pts, { w = 10, tone = 0.85, dry = 0.45, seed = 1, reveal = 1, bristles = 8, col = [16, 14, 12], head = 0.12, tail = 0.4, per = 5 } = {}) => {
  if (reveal <= 0) return;
  const D = KIT.resample(KIT.densify(pts, per), 4), n = D.length, m = Math.max(2, Math.ceil(n * clamp(reveal)));
  const r = rng(seed * 7919);
  const prof = q => ss(0, head, q) * (1 - 0.7 * ss(1 - tail, 1, q)) * (0.85 + 0.15 * P.noise(seed * 3.3, q * 6)) + 0.08;
  c.save(); c.lineCap = 'butt'; c.lineJoin = 'round';
  const N = [];
  for (let i = 0; i < n; i++) { const A = D[Math.max(0, i - 1)], B = D[Math.min(n - 1, i + 1)]; let dx = B[0] - A[0], dy = B[1] - A[1]; const d = Math.hypot(dx, dy) || 1; N.push([-dy / d, dx / d]); }
  const core = q => w * prof(q) * (1 - dry * 0.85 * Math.pow(q, 0.8));
  // 湿的笔芯：整笔都有，越往后越细越淡（墨在用完）
  c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${tone * 0.72})`; c.fill(KIT.ribbon(D.slice(0, m), (q, i) => core(i / (n - 1))));
  // 笔毛：每根一条连续线，按噪声断开（飞白＝笔毛之间露出的纸），越到笔尾断得越多
  for (let k = 0; k < bristles; k++) {
    const off = (k / (bristles - 1) - 0.5) * 0.95, bw = w / bristles * (0.9 + r() * 0.9), ph = r() * 50;
    c.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${tone * (0.45 + r() * 0.35)})`; c.lineWidth = Math.max(0.7, bw);
    c.beginPath(); let on = false;
    for (let i = 0; i < m; i++) {
      const q = i / (n - 1), dryness = dry * Math.pow(q, 1.2);
      const vis = P.noise(k * 1.9 + ph, i * 0.09) * 0.5 + 0.5 > dryness * 0.95 + 0.05;
      const o = off * w * prof(q), x = D[i][0] + N[i][0] * o, y = D[i][1] + N[i][1] * o;
      if (vis) { on ? c.lineTo(x, y) : c.moveTo(x, y); on = true; } else on = false;
    }
    c.stroke();
  }
  c.restore();
};
// 两头尖的单笔（个字竹叶、兰叶描、鸟翅）：沿 ang 方向长 L，最宽 wmax，微弯
P.leaf = (c, x, y, ang, L, wmax, tone = 0.88, col = [16, 14, 12]) => {
  if (!Array.isArray(col)) col = [16, 14, 12];
  const pts = []; for (let i = 0; i <= 10; i++) { const q = i / 10, bend = Math.sin(q * Math.PI) * 0.08 * L; pts.push([x + Math.cos(ang) * L * q - Math.sin(ang) * bend, y + Math.sin(ang) * L * q + Math.cos(ang) * bend]); }
  c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${tone})`; c.fill(KIT.ribbon(pts, q => wmax * Math.pow(Math.sin(Math.PI * Math.min(1, q * 1.1)), 0.7) + 0.6));
};

// ---------- 墨晕 / 晕染层 ----------
// fn(g) 在 scratch 上画形状（实色即可）；grow 0..1 控制洇开：外晕 blur 随 grow 变宽，本体 blur 随 grow 收紧。
// halo 外晕模糊半径、haloA 外晕透明度、blur 本体模糊、alpha 整体透明度。返回 scratch（可再拿来做留白挖洞）。
// 坑：multiply 是透明的，背后的墨线会透过晕染（窗台线透过猫耳）。先在剪影里补一层纸色（clip 后 drawImage 纸）再上晕染＝「先留出这块地方」。
P.inkWash = (c, key, grow, fn, { blur = 2, halo = 10, haloA = 0.22, alpha = 1 } = {}) => {
  const S = P.scratch('inkw_' + key), g = S.getContext('2d'); g.reset(); fn(g);
  c.save(); c.globalCompositeOperation = 'multiply';
  if (grow > 0) {
    c.globalAlpha = haloA * alpha * grow; c.filter = `blur(${(halo * (0.4 + grow)).toFixed(2)}px)`; c.drawImage(S, 0, 0);
    c.globalAlpha = alpha * ss(0, 0.6, grow); c.filter = `blur(${(blur * (1.6 - grow * 0.6)).toFixed(2)}px)`; c.drawImage(S, 0, 0);
  }
  c.filter = 'none'; c.restore();
  return S;
};

// ---------- 长弯流线笔（蒙克《呐喊》式表现主义） ----------
// 种子：cell 抖动网格，每个种子带两个随机数 [x, y, r1, r2]
P.flowSeeds = (cell = 24, seed = 5) => { const r = rng(seed), o = []; for (let y = -10; y < H + 10; y += cell) for (let x = -10; x < W + 10; x += cell) o.push([x + (r() - .5) * cell, y + (r() - .5) * cell, r(), r()]); return o; };
// 每个种子：region(x,y,t) 判区 → 取该区参数 params[reg] = [steps, step, width, alpha] → 沿 angle(x,y,t,reg) 积分；越出本区就停（区域边界干净）。
// color(reg, sx, sy, r1, t) 返回 [r,g,b]。不描边、半透明叠色——蒙克是薄涂长笔；照搬梵高的深色描边会变成一节节毛毛虫短笔。
// 底下先铺同色系平涂，笔缝里露出的是同色而不是黑。长度：steps 26–42、step 6–8，一根笔走 200–300px。
P.flowLines = (c, seeds, { t = 0, region, angle, color, params, extraSteps = 8 }) => {
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [sx, sy, r1, r2] of seeds) {
    const reg = region(sx, sy, t); const pr = params[reg]; if (!pr) continue; const [steps, step, width, alpha] = pr;
    const col = color(reg, sx, sy, r1, t);
    let x = sx, y = sy; c.beginPath(); c.moveTo(x, y);
    const n = steps + ((r2 * extraSteps) | 0);
    for (let i = 0; i < n; i++) { const a = angle(x, y, t, reg); x += Math.cos(a) * step; y += Math.sin(a) * step; if (region(x, y, t) !== reg) break; c.lineTo(x, y); }
    c.strokeStyle = P.rgb(col, alpha); c.lineWidth = width * (0.7 + r2 * 0.6); c.stroke();
  }
};

// ---------- 水彩洗染（吉卜力式背景美术） ----------
// 中点位移：每轮在每条边中点沿法向推一个近似高斯量（3 个均匀数相加），幅度与边长成比例，每轮 amp×0.6
P.deform = (pts, depth, amp, r) => {
  let out = pts;
  for (let d = 0; d < depth; d++) {
    const n = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const g = (r() + r() + r() - 1.5) * amp * Math.min(1, len / 80), nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
      n.push(a, [(a[0] + b[0]) / 2 + nx * g, (a[1] + b[1]) / 2 + ny * g]);
    }
    out = n; amp *= 0.6;
  }
  return out;
};
const fillPts = (g, pts) => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); };
// 一次洗染：基形 deform 3 轮；每层再 deform 2 轮、低 α 填（multiply = 透明颜料叠色）、α=edge 描 1.6px 同色边（颜料在边缘沉积 = 水痕边）。
// fill 可传渐变；不透明的白（窗框、云、桌布）用 blend:'source-over'、alpha .9。
// 常用：大墙 layers5 α.4 amp12；色晕 layers3 α.045 amp40；木板 layers3 α.5 amp3 edge.14。
// 坑：暗部用大幅变形多边形（amp 60），别用矩形拼——矩形接缝处会出硬边。色晕 α 别超 .05×3 层，否则房间像发霉的羊皮纸。
P.watercolor = (g, pts, color, { layers = 7, alpha = 0.13, amp = 10, seed = 1, edge = 0.1, blend = 'multiply', fill } = {}) => {
  const r = rng(seed * 7919 + 13), base = P.deform(pts, 3, amp, r);
  g.save(); g.globalCompositeOperation = blend; g.lineJoin = 'round';
  for (let k = 0; k < layers; k++) {
    const q = P.deform(base, 2, amp * 0.55, r);
    fillPts(g, q); g.globalAlpha = alpha; g.fillStyle = fill || color; g.fill();
    if (edge) { g.globalAlpha = edge; g.strokeStyle = color; g.lineWidth = 1.6; g.stroke(); }
  }
  g.restore();
};
P.rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
P.ellipsePts = (cx, cy, rx, ry, n = 18) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * rx, cy + Math.sin(i / n * Math.PI * 2) * ry]);

// ---------- 厚涂鬃毛笔 ----------
// 一笔 = round(w/1.3) 条平行细鬃（亮度各自 ±17 抖、两端随机缩 0–25%）＋下侧一条淡投影＋上侧零星亮点 → 读成「被刷开的一坨厚颜料」。
// 只用在受光处（金发、领口、瓷器、珍珠、白毛）。坑：画成「暗影＋主笔＋亮脊」三条整齐的线会读成白色贴纸/创可贴。
P.impasto = (c, pts, w, col, hi) => {
  const base = col.startsWith('#') ? P.hex(col) : [240, 230, 210];
  const A = pts[0], B = pts[pts.length - 1], ang = Math.atan2(B[1] - A[1], B[0] - A[0]), nx = -Math.sin(ang), ny = Math.cos(ang);
  const r = rng((A[0] * 13 + A[1] * 7) | 0), nb = Math.max(3, Math.round(w / 1.3));
  c.save(); c.lineCap = 'round';
  c.strokeStyle = 'rgba(40,18,6,.28)'; c.lineWidth = w * 0.9; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0] + nx * w * 0.45 + 1, p[1] + ny * w * 0.45 + 1.5) : c.moveTo(p[0] + nx * w * 0.45 + 1, p[1] + ny * w * 0.45 + 1.5)); c.stroke();
  for (let k = 0; k < nb; k++) {
    const o = (k / (nb - 1) - 0.5) * w, s0 = r() * 0.25, s1 = 1 - r() * 0.25, sh = (r() - 0.5) * 34 + (k < nb / 2 ? 14 : -10);
    c.strokeStyle = P.rgb([base[0] + sh, base[1] + sh, base[2] + sh * 0.8], 0.55 + r() * 0.4); c.lineWidth = 1.4 + r() * 1.2; c.beginPath();
    const n = pts.length - 1; for (let i = 0; i <= 8; i++) { const q = lerp(s0, s1, i / 8), j = Math.min(n - 1, Math.floor(q * n)), f = q * n - j, x = lerp(pts[j][0], pts[j + 1][0], f) + nx * o, y = lerp(pts[j][1], pts[j + 1][1], f) + ny * o; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
  c.fillStyle = hi || 'rgba(255,250,232,.7)'; for (let k = 0; k < 2 + w / 3; k++) { const q = r(), x = lerp(A[0], B[0], q) - nx * w * 0.3, y = lerp(A[1], B[1], q) - ny * w * 0.3; c.beginPath(); c.arc(x, y, 0.9 + r(), 0, Math.PI * 2); c.fill(); }
  c.restore();
};

// ---------- 剪刀折线 ----------
// 把一圈（闭合）点列按 step 重采样，每点加 ±amp 种子抖动，直线相连 → 手剪纸的边。RIG 部件可用 path.pts 喂进来重剪。
P.cut = (pts, seed, step = 18, amp = 2.5) => {
  const r = rng(seed), out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) { const q = k / n; out.push([lerp(a[0], b[0], q) + (r() - 0.5) * amp * 2, lerp(a[1], b[1], q) + (r() - 0.5) * amp * 2]); }
  }
  return U.poly(out);
};
})();
```

## render.js

来源：https://github.com/alchaincyf/huashu-art-motion/blob/d861767d180008d27675819932070a670a3ae43f/scripts/engine/lib/render.js

```javascript
// 渲染器与光影：网点、点彩、赛璐珞、漫画阴影、体积、长影子、双版本光影、光照图、皮影皮件、手剪位移。全部挂在 PAINT（P）上。
// 来源：迁移测试 B（构成主义/达利/霍珀/吉卜力）、C（Kirby/修拉/马蒂斯）、D（伦勃朗/皮影/新海诚）。
//   P.halftoneGray(c, src, bx,by,bw,bh, cell, col, gain, ang)  灰度照片网点：45° 网格、点径 ∝ √暗度、全部点并成一条 path 一次填（照片拼贴）
//   P.shadeDots(c, path, bx,by,bw,bh, cell, col, f)           路径内按函数 f(x,y)∈0..1 落网点（网点阴影）
//   P.dotPattern(c, key, pitch, r, col, bg, angleDeg)          本戴点 createPattern，带网屏角（四色印刷 C15° M75° Y0° K45°）
//   P.pointillism(c, src, opt)                                 修拉点彩＝视觉混色：等大点、纯色板两两并置逼近目标色（P.dabs 是印象派，不是点彩）
//   P.clipBeside(c, path, dx, dy)                              clip 到「path 减去平移后的自身」——赛璐珞阴影带、Kirby 黑块、亮边的公共底
//   P.cel(c, p, base, shade, rim, opt)                         赛璐珞两调＋边缘光（新海诚、吉卜力角色）
//   P.kirbyShade(g, path, opt)                                 Kirby 黑块阴影（spotted blacks）＋羽化排线（feathering）
//   P.vol(c, path, x0,y0,x1,y1, a, b, occl, blur)              体积填色：线性渐变＋路径内模糊暗边（学院派，无勾线）
//   P.castShadow(c, layers, opt)                               剪切仿射长影子：剪影投到地面（达利的长影子、黄昏）
//   P.litClip(c, polys, drawLit)                               双版本光影裁切：背光版先画好，光斑多边形里画受光版（霍珀的硬光块）
//   P.pool / P.lightMap / P.applyLight                         光照图整幅相乘：环境光打底＋lighter 叠光池＋multiply（伦勃朗、烛光、夜景）
//   P.carve / P.piece / P.stamp                                皮影：皮件填色→镂空刻纹→补皮边→描边；印到幕布 = 软影＋multiply（剪影/镂空类风格）
//   P.roughen(layer, box, opt)                                 整层低频像素位移：RIG 角色的边也像手剪的（马蒂斯）
//   P.glowStroke(c, col, w, blur)                              霓虹灯管：对当前路径用 shadowBlur 描辉光（再描一道近白细芯线就是灯管）
(() => {
const TAU = Math.PI * 2;
let W = 1920, H = 1080; U.onStage((w, h) => { W = w; H = h; });   // 画布尺寸跟 U.setStage 走（默认 1920×1080）
const P = window.PAINT;
const { clamp, lerp, rng } = U;

// ---------- 网点 ----------
P.halftoneGray = (c, src, bx, by, bw, bh, cell, col, gain = 0.78, ang = Math.PI / 4) => {
  bx |= 0; by |= 0; bw |= 0; bh |= 0;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(bx, by, bw, bh).data;
  const ca = Math.cos(ang), sa = Math.sin(ang), cx = bx + bw / 2, cy = by + bh / 2, R = Math.hypot(bw, bh) / 2;
  c.beginPath();
  for (let v = -R; v <= R; v += cell) for (let u = -R; u <= R; u += cell) {
    const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca, ix = (x - bx) | 0, iy = (y - by) | 0;
    if (ix < 0 || iy < 0 || ix >= bw || iy >= bh) continue;
    const i = (iy * bw + ix) * 4; if (d[i + 3] < 128) continue;
    const L = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) / 255, r = cell * gain * Math.sqrt(Math.max(0, 1 - L));
    if (r < 0.45) continue; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
  }
  c.fillStyle = col; c.fill();
};
P.shadeDots = (c, path, bx, by, bw, bh, cell, col, f) => {
  c.save(); c.clip(path); c.beginPath();
  for (let y = by; y < by + bh; y += cell) for (let x = bx + ((((y - by) / cell) | 0) % 2) * cell / 2; x < bx + bw; x += cell) {
    const r = cell * 0.62 * f(x, y); if (r < 0.5) continue; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
  }
  c.fillStyle = col; c.fill(); c.restore();
};
P.dotPattern = (c, key, pitch, r, col, bg, angleDeg = 45) => {
  const tile = P.cached('dotpat_' + key, pitch, pitch, g => { if (bg) { g.fillStyle = bg; g.fillRect(0, 0, pitch, pitch); } g.fillStyle = col;
    [[0, 0], [pitch, 0], [0, pitch], [pitch, pitch]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }); });
  const p = c.createPattern(tile, 'repeat');
  p.setTransform(new DOMMatrix().rotate(angleDeg));
  return p;
};

// ---------- 点彩（修拉：视觉混色） ----------
// 固定六角网格、点等大（pitch 10、rad 4.5、位置 ±1.2px 静态抖）；每个点从纯色板 pal 里挑一对 (i,j)：
//   目标色投影到 Pj→Pi 上得连续比例 w（clamp .2–.8），距离加 0.004·|Pi−Pj|² 惩罚（别用黑白点混出灰），格子哈希 < w 选 i 否则 j。
// 取色前给目标色加 ±colorJitter 哈希抖动——配对色分界变成交错的点，不出竖向色带（两个坑都踩过：偏好纯色→色带；连续比例→整列切换）。
// compRate 的点换成补色 comp[idx]；光渗：和 (+14,+6) 处亮度差 >45 时，亮侧放 white 点、暗侧放 dark 点。
// shimmer(x,y) 为真的区域按 fps 重掷哈希（水面波光）；flicker 比例的点按 fps 换成配对色（空气在颤，太低会被判「基本定格」）。
// 色板要带淡色（和白混过的色），否则亮墙被拆成白＋肤色＋零星蓝点，像雪花噪声。约 2.4 万点、每色一条 Path2D 一次 fill，每帧约 100ms。
const pointCache = new WeakMap();
P.pointillism = (c, src, { pal, comp = {}, pitch = 10, rad = 4.5, posJitter = 2.4, colorJitter = 40, compRate = 0.08, flicker = 0.07, fps = 6, t = 0, shimmer, white = 12, dark = 0, bleed = 45 } = {}) => {
  const PAL = pal.map(v => typeof v === 'string' ? P.hex(v) : v);
  let cache = pointCache.get(pal); if (!cache) { cache = new Map(); pointCache.set(pal, cache); }
  const pick = (r, g, b) => {
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
    let v = cache.get(key); if (v) return v;
    let best = 1e18, bi = 0, bj = 0, bw = 1;
    for (let i = 0; i < PAL.length; i++) for (let j = i + 1; j < PAL.length; j++) {
      const pi = PAL[i], pj = PAL[j], ex = pi[0] - pj[0], ey = pi[1] - pj[1], ez = pi[2] - pj[2];
      const w = clamp(((r - pj[0]) * ex + (g - pj[1]) * ey + (b - pj[2]) * ez) / (ex * ex + ey * ey + ez * ez + 1e-6), 0.2, 0.8);
      const dr = pj[0] + w * ex - r, dg = pj[1] + w * ey - g, db = pj[2] + w * ez - b;
      const d = dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.8 + ex * ex * 0.004 + ey * ey * 0.004 + ez * ez * 0.004;
      if (d < best) { best = d; bi = i; bj = j; bw = w; }
    }
    v = [bi, bj, bw]; cache.set(key, v); return v;
  };
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const L = (x, y) => { const i = (clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)) * 4; return sd[i] * 0.3 + sd[i + 1] * 0.59 + sd[i + 2] * 0.11; };
  const paths = PAL.map(() => new Path2D()), st = Math.floor(t * fps), ROWH = pitch * 0.866, hj = posJitter / 2;
  for (let j = 0, y = 0; y < H + ROWH; j++, y += ROWH) for (let i = 0, x = (j % 2) * pitch / 2; x < W + pitch; i++, x += pitch) {
    const jx = (U.hash(i, j * 7 + 1) - 0.5) * 2 * hj, jy = (U.hash(i * 3, j + 5) - 0.5) * 2 * hj, px = x + jx, py = y + jy;
    const k = (clamp(py | 0, 0, H - 1) * W + clamp(px | 0, 0, W - 1)) * 4;
    const dj = (U.hash(i * 7 + 3, j * 11) - 0.5) * colorJitter;
    const [a, bb, w] = pick(clamp(sd[k] + dj, 0, 255), clamp(sd[k + 1] + dj * 0.8, 0, 255), clamp(sd[k + 2] - dj * 0.6, 0, 255));
    const hseed = shimmer && shimmer(px, py) ? U.hash(i + st * 977, j) : U.hash(i, j);
    let idx = hseed < w ? a : bb;
    const h2 = U.hash(i * 5 + 2, j * 3 + 9);
    if (h2 < compRate && comp[idx] != null) idx = comp[idx];
    else if (U.hash(i * 13 + st * 31, j * 17) < flicker) idx = (U.hash(i, j + st) < w) ? bb : a;
    else { const dl = L(px, py) - L(px + 14, py + 6); if (Math.abs(dl) > bleed && h2 < 0.45) idx = dl > 0 ? white : dark; }
    paths[idx].moveTo(px + rad, py); paths[idx].arc(px, py, rad, 0, TAU);
  }
  paths.forEach((p, k) => { c.fillStyle = P.rgb(PAL[k]); c.fill(p); });
};

// ---------- 赛璐珞 / 漫画阴影 ----------
let BIG; U.onStage((w, h) => { BIG = new Path2D(); BIG.rect(-60, -60, w + 120, h + 120); });   // 比画布四边各大 60px 的矩形，跟画布尺寸走
// clip 到 path ∩ ¬translate(path, dx, dy)：沿 (dx,dy) 方向的那一侧之外留下一条带（光从 -(dx,dy) 来时就是背光侧的阴影带）
P.clipBeside = (c, path, dx, dy) => { const m = new Path2D(); m.addPath(BIG); m.addPath(path, new DOMMatrix().translate(dx, dy)); c.clip(path); c.clip(m, 'evenodd'); };
// 底色 → 背光侧硬阴影带（宽 sd，光方向 (lx,ly) 指向光源的反方向：lx=-1 光从左来、阴影在右）→ 受光侧亮边（宽 rw）→ 细描线。
// 按部件顺序逐个 cel，遮挡天然正确，不需要 visibleLines。逆光（窗下的猫）：lx/ly 取反并另加 lighter 暖色亮边。
P.cel = (c, p, base, shade, rim, { sd = 22, rw = 7, line = '#6a4632', lw = 2.2, lx = -1, ly = -0.55 } = {}) => {
  if (!p) return;
  c.fillStyle = base; c.fill(p);
  if (shade) { c.save(); P.clipBeside(c, p, lx * sd, ly * sd); c.fillStyle = shade; c.fill(p); c.restore(); }
  if (rim) { c.save(); P.clipBeside(c, p, -lx * rw, -ly * rw); c.fillStyle = rim; c.fill(p); c.restore(); }
  if (lw) { c.strokeStyle = line; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(p); }
};
// Kirby：light 指向光源（默认左上），黑块 = path ∩ ¬shift(d1)，羽化带 = path ∩ ¬shift(d2) 里沿光方向的平行线（间距 gap）
P.kirbyShade = (g, path, { d1 = 14, d2 = 30, gap = 9, light = [-0.86, -0.5], ink = '#141212', lw = 2.6 } = {}) => {
  g.save(); P.clipBeside(g, path, light[0] * d2, light[1] * d2);
  g.strokeStyle = ink; g.lineWidth = lw; g.lineCap = 'butt'; g.beginPath();
  const a = Math.atan2(light[1], light[0]), nx = -Math.sin(a), ny = Math.cos(a);
  for (let k = -260; k < 260; k++) { const ox = 960 + nx * k * gap, oy = 540 + ny * k * gap; g.moveTo(ox - light[0] * 1400, oy - light[1] * 1400); g.lineTo(ox + light[0] * 1400, oy + light[1] * 1400); }
  g.stroke(); g.restore();
  g.save(); P.clipBeside(g, path, light[0] * d1, light[1] * d1); g.fillStyle = ink; g.fillRect(0, 0, W, H); g.restore();
};

// ---------- 体积 / 影子 / 光 ----------
P.vol = (c, path, x0, y0, x1, y1, a, b, occl = 'rgba(40,20,10,.45)', blur = 14) => {
  const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b);
  c.fillStyle = g; c.fill(path);
  if (occl) { c.save(); c.clip(path); c.shadowColor = occl; c.shadowBlur = blur; c.strokeStyle = occl; c.lineWidth = blur * 0.6; c.stroke(path); c.restore(); }
};
// layers: [[yg, g => { 在 g 上用黑色画这一组物体的剪影 }], ...]，yg 是这组物体的着地线。
// 剪切仿射 y' = yg − ky·(yg − y)、x' = x − kx·(y' 方向的高度)，影子往右后方躺（太阳在左前方低空）；kx 变大 = 影子变长（黄昏）。
// 所有剪影先画进一张离屏（纯黑）再整体以 alpha 叠，重叠处不会加深；clipY 以下才是地面。坑：ky>0 往观众方向投会被画框底边吃掉。
P.castShadow = (c, layers, { kx = 1, ky = 0.22, clipY = 0, alpha = 0.55, blur = 1.5, key = 'castShadow' } = {}) => {
  const S = P.scratch(key), g = S.getContext('2d'); g.reset(); g.clearRect(0, 0, W, H); g.fillStyle = '#000'; g.strokeStyle = '#000';
  for (const [yg, fn] of layers) { g.setTransform(1, 0, -kx, ky, kx * yg, yg * (1 - ky)); fn(g); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  c.save(); c.beginPath(); c.rect(0, clipY, W, H); c.clip(); c.globalAlpha = alpha; if (blur) c.filter = `blur(${blur}px)`; c.drawImage(S, 0, 0); c.restore();
};
// 双版本光影裁切：先把整幅画成背光版，再 clip 到光斑多边形（可多个、可每帧平移）画受光版 → 光影边缘是硬的、能整体移动。
// 人物同理：drawLit 里用受光色再画一遍。人在墙上的投影＝剪影平移后 source-in 背光版，再画回光斑里。
P.litClip = (c, polys, drawLit) => {
  c.save(); c.beginPath(); polys.forEach(pp => { pp.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); }); c.clip(); drawLit(c); c.restore();
};
// 光池：径向渐变的一团光（col 为 'r,g,b' 字符串）
P.pool = (g, x, y, r, col, a) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(0.45, `rgba(${col},${a * 0.55})`); rg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
// 光照图：ambient 打底（环境光，伦勃朗约 rgb(30,21,13) = 0.13），fn(g) 里用 P.pool 叠光池（已是 lighter），返回画布
P.lightMap = (key, ambient, fn) => {
  const S = P.scratch('light_' + key), g = S.getContext('2d'); g.reset();
  g.fillStyle = ambient; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter'; fn(g); g.globalCompositeOperation = 'source-over';
  return S;
};
// 整幅乘光：亮态底稿 × 光照图。所有明暗法、烛光、夜景都这么做——比逐个物体画明暗统一得多。
P.applyLight = (c, map) => { c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(map, 0, 0); c.restore(); };

// ---------- 皮影 / 镂空 ----------
// 刻纹库（在 clip 内用 destination-out 画）：dots 鱼子纹、flowers 团花、clouds 云纹、lattice 方格、lines 刻线
P.carve = {
  dots(g, x0, y0, x1, y1, s = 18, r = 3.2) { for (let y = y0; y < y1; y += s) for (let x = x0 + ((y / s | 0) % 2) * s / 2; x < x1; x += s) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } },
  flowers(g, x0, y0, x1, y1, s = 46, r = 5) { for (let y = y0; y < y1; y += s) for (let x = x0 + ((y / s | 0) % 2) * s / 2; x < x1; x += s) { for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5, r, r * 0.6, a, 0, 7); g.fill(); } } },
  clouds(g, x0, y0, x1, y1, s = 40) { g.lineWidth = 3.4; g.lineCap = 'round'; for (let y = y0; y < y1; y += s) for (let x = x0 + ((y / s | 0) % 2) * s / 2; x < x1; x += s) { g.beginPath(); for (let a = 0; a < 7; a += 0.3) { const rr = 2 + a * 1.9; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); } },
  lattice(g, x0, y0, x1, y1, s = 26, w = 12) { for (let y = y0; y < y1; y += s) for (let x = x0; x < x1; x += s) g.fillRect(x + (s - w) / 2, y + (s - w) / 2, w, w); },
  lines(g, segs, w = 3.2) { g.lineWidth = w; g.lineCap = 'round'; segs.forEach(sg => { g.beginPath(); sg.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke(); }); },
};
// 一块皮件：填色 → carve(g) 在 clip 内镂空 → 补 edge 宽的同色皮边（刻纹不刻穿外轮廓）→ 深色描边。
// 白色部位（猫的白胸白爪）直接整块镂空只留皮边——所有剪影/镂空类风格都适用。
P.piece = (g, path, col, carve, { edge = 5, line = '#3a160a', lw = 2.6 } = {}) => {
  g.save(); g.fillStyle = col; g.fill(path);
  if (carve) { g.save(); g.clip(path); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.strokeStyle = '#000'; carve(g); g.restore(); }
  g.strokeStyle = col; g.lineWidth = edge * 2; g.lineJoin = 'round'; g.save(); g.clip(path); g.stroke(path); g.restore();
  g.strokeStyle = line; g.lineWidth = lw; g.stroke(path); g.restore();
};
// 把一层皮件印到幕布上：先 multiply 一层偏移软影（皮件没贴紧幕布的虚影），再 multiply 本体（透光 = 幕布色 × 皮色，重叠处自然变深）
P.stamp = (c, layer, { dx = 7, dy = 5, shadow = 0.28, blur = 6 } = {}) => {
  c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = shadow; c.filter = `blur(${blur}px)`; c.drawImage(layer, dx, dy); c.restore();
  c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(layer, 0, 0); c.restore();
};

// ---------- 霓虹 ----------
P.glowStroke = (c, col, w, blur) => { c.shadowColor = col; c.shadowBlur = blur; c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.shadowBlur = 0; };

// ---------- 手剪位移 ----------
// 对 layer 的 box=[x0,y0,x1,y1] 区域做静态低频位移（fbm 频率 freq、幅度 amp px）：RIG 角色不给剪刀折线时，整层边缘也像手剪的。约 15ms。
const fields = {};
P.roughen = (layer, box, { freq = 0.028, amp = 9, key = 'rough' } = {}) => {
  const [X0, Y0, X1, Y1] = box, w = X1 - X0, h = Y1 - Y0, fk = `${key}|${box}|${freq}|${amp}`;
  const f = fields[fk] || (fields[fk] = (() => { const o = { dx: new Int8Array(w * h), dy: new Int8Array(w * h) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const gx = (x + X0) * freq, gy = (y + Y0) * freq; o.dx[y * w + x] = Math.round(P.fbm(gx, gy, 2) * amp); o.dy[y * w + x] = Math.round(P.fbm(gx + 40, gy + 17, 2) * amp); } return o; })());
  const g = layer.getContext('2d', { willReadFrequently: true });
  const src = g.getImageData(X0, Y0, w, h), out = g.createImageData(w, h), s = src.data, o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x, sx = clamp(x + f.dx[k], 0, w - 1), sy = clamp(y + f.dy[k], 0, h - 1), j = (sy * w + sx) * 4, i = k * 4;
    o[i] = s[j]; o[i + 1] = s[j + 1]; o[i + 2] = s[j + 2]; o[i + 3] = s[j + 3]; }
  g.putImageData(out, X0, Y0);
};
})();
```

## post.js

来源：https://github.com/alchaincyf/huashu-art-motion/blob/d861767d180008d27675819932070a670a3ae43f/scripts/engine/lib/post.js

```javascript
// 后期：整幅叠在画面上的「媒介层」。全部挂在 PAINT（P）上。
// 来源：迁移测试 B（蒸汽波 VHS、吉卜力角色水彩肌理）、D（橡皮管胶片、新海诚泛光/光晕）、A（敦煌褪色）。
//   P.rgbSplit(c, S, opt)               RGB 三通道分离错位：multiply 取单通道 → lighter 合成到黑底（VHS、故障、3D 眼镜）
//   P.vhs(c, S, t, lt, opt)             VHS 全套：通道分离＋跟踪噪声带下滚撕裂＋扫描线＋OSD＋暗角（先把整幅画进离屏 S）
//   P.scanlines(c, a1, a2)              4px 扫描线 pattern
//   P.film(c, t, opt)                   老胶片层：24fps 闪烁、跨格存活的竖划痕、灰尘毛发、颗粒抖动、圆角片门（1930 卡通、默片）
//   P.gateWeave(c, t, fn, amp)          抖片：fn 里画的内容整体按 24fps 微抖
//   P.bloom(c, opt)                     泛光：整帧缩小糊化后 screen 回叠（新海诚、CG）
//   P.lensFlare(c, sun, t, opt)         镜头光晕：太阳核＋慢转星芒＋横向拉丝＋沿 太阳→画心 的六边形光斑
//   P.textureInside(c, shapeLayer, drawTex, opt)  纹理只「乘」在角色上：纹理层 destination-in 角色剪影 → multiply 叠回
//   P.fade(c, opt)                      褪色/单色化：saturation 混合去色＋multiply 染色（壁画褪色、胶片单色）
//   P.vignette(c, opt)                  径向暗角
(() => {
let W = 1920, H = 1080; U.onStage((w, h) => { W = w; H = h; });   // 画布尺寸跟 U.setStage 走（默认 1920×1080）
const P = window.PAINT;
const { rng } = U;

// ---------- 通道分离 / VHS ----------
P.rgbSplit = (c, S, { r = [-3, 0], g = [0, 0], b = [3, 1], key = 'rgbSplit' } = {}) => {
  const T = P.scratch(key), tg = T.getContext('2d');
  c.save(); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'lighter';
  [['#ff0000', r], ['#00ff00', g], ['#0000ff', b]].forEach(([col, [dx, dy]]) => {
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, W, H); tg.drawImage(S, 0, 0);
    tg.globalCompositeOperation = 'multiply'; tg.fillStyle = col; tg.fillRect(0, 0, W, H);
    c.drawImage(T, dx, dy);
  });
  c.restore();
};
P.scanlines = (c, a1 = 0.28, a2 = 0.12) => {
  const tile = P.cached(`scan_${a1}_${a2}`, 4, 4, g => { g.fillStyle = `rgba(0,0,0,${a1})`; g.fillRect(0, 0, 4, 1); g.fillStyle = `rgba(0,0,0,${a2})`; g.fillRect(0, 2, 4, 1); });
  c.save(); c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(0, 0, W, H); c.restore();
};
// osd: false 关掉；或 {label:'PLAY', date:'SEP. 04 2011', clock:'23:59', font:'PressStart2P-400'}（▶ 自己画：像素字体里没有这个字形）
P.vhs = (c, S, t, lt, { osd = {}, band = 70, bandSpeed = 520, vignette = 'rgba(10,0,25,.55)' } = {}) => {
  const f = Math.floor(t * 60), jit = U.hash(f >> 2, 9) < 0.12 ? 1 : 0;
  const ca = 3 + jit * 6 + Math.sin(t * 7) * 1.5;                          // 色差错位量（偶发加大）
  P.rgbSplit(c, S, { r: [-ca, 0], g: [0, 0], b: [ca, 1], key: 'vhsSplit' });
  // 跟踪噪声带：从上往下滚，带内每 6px 横向撕裂＋白噪声线
  const by = ((lt * bandSpeed + 200) % (H + 160)) - 80, bh = band, r = rng(f * 7 + 1);
  for (let y = by; y < by + bh; y += 6) { const dx = (r() - 0.5) * 60 * Math.sin((y - by) / bh * Math.PI); c.drawImage(S, 0, y, W, 6, dx, y, W, 6); }
  c.save(); c.globalAlpha = 0.5; for (let i = 0; i < 90; i++) { c.fillStyle = r() < 0.5 ? '#ffffff' : '#bbbbbb'; c.fillRect(r() * W, by + r() * bh, 20 + r() * 120, 1.5); } c.restore();
  P.scanlines(c);
  if (osd) {
    const font = osd.font || 'PressStart2P-400';
    c.save(); c.font = `34px "${font}"`; c.fillStyle = '#ffffff'; c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowOffsetX = 3; c.shadowOffsetY = 3;
    if ((f >> 4) % 2 === 0 || lt < 0.2) { c.fillText(osd.label || 'PLAY', 60, 92); c.beginPath(); c.moveTo(232, 60); c.lineTo(262, 77); c.lineTo(232, 94); c.closePath(); c.fill(); }
    c.font = `26px "${font}"`; c.fillText(osd.date || 'SEP. 04 2011', 60, 1020); c.fillText((osd.clock || '23:59') + ':' + String(30 + Math.floor(lt)).padStart(2, '0') + ':' + String(Math.floor(lt * 30) % 30).padStart(2, '0'), 60, 1056);
    c.restore();
  }
  if (vignette) P.vignette(c, { inner: 500, outer: 1150, col: vignette });
};

// ---------- 胶片 ----------
P.film = (c, t, { fps = 24, flicker = [0.02, 0.07, 0.06], scratches = 3, dust = 14, grain = 'film', grainDensity = 0.18, gate = true, ink = '20,16,10', light = '255,252,240' } = {}) => {
  const fq = Math.floor(t * fps), r = rng(fq * 7919 + 11);
  c.fillStyle = `rgba(255,250,235,${flicker[0] + r() * flicker[1]})`; c.fillRect(0, 0, W, H);
  c.fillStyle = `rgba(${ink},${r() * flicker[2]})`; c.fillRect(0, 0, W, H);
  // 竖划痕：用 floor(t*6) 当寿命，一条划痕能活好几格
  const r6 = rng(Math.floor(t * 6) * 131 + 5);
  for (let k = 0; k < scratches; k++) { const x = r6() * W + (r() - 0.5) * 6; c.strokeStyle = r6() < 0.5 ? `rgba(${light},.55)` : `rgba(${ink},.5)`; c.lineWidth = 1 + r6() * 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 12, H); c.stroke(); }
  for (let k = 0; k < dust; k++) { c.fillStyle = r() < 0.6 ? `rgba(${ink},.7)` : `rgba(${light},.8)`; c.beginPath(); c.arc(r() * W, r() * H, 1 + r() * 3.5, 0, 7); c.fill(); }
  if (r() < 0.5) { c.strokeStyle = `rgba(${ink},.6)`; c.lineWidth = 1.6; const x = r() * W, y = r() * H; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 30, y - 20, x + 10, y + 40, x + 50, y + 30); c.stroke(); }
  if (grain) c.drawImage(P.grain(grain, grainDensity, ink.split(',').map(Number), 0.25), (r() - 0.5) * 40, (r() - 0.5) * 40);
  if (gate) c.drawImage(P.cached('film_gate', W, H, (g) => {
    const vg = g.createRadialGradient(960, 540, 420, 960, 540, 1150); vg.addColorStop(0, 'rgba(10,8,5,0)'); vg.addColorStop(0.7, 'rgba(10,8,5,.18)'); vg.addColorStop(1, 'rgba(10,8,5,.85)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0c0a07'; g.beginPath(); g.rect(0, 0, W, H); g.roundRect(18, 14, W - 36, H - 28, 60); g.fill('evenodd');
  }), 0, 0);
};
P.gateWeave = (c, t, fn, amp = [3, 4], fps = 24) => { const r = rng(Math.floor(t * fps) * 31 + 7); c.save(); c.translate((r() - 0.5) * amp[0], (r() - 0.5) * amp[1]); fn(); c.restore(); };

// ---------- 光 ----------
P.bloom = (c, { scale = 4, blur = 6, brightness = 1.1, alpha = 0.28, key = 'bloom' } = {}) => {
  const w = W / scale, h = H / scale, bl = P.scratch(key), g = bl.getContext('2d'); g.reset();
  g.filter = `blur(${blur}px) brightness(${brightness})`; g.drawImage(c.canvas, 0, 0, w, h);
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = alpha; c.drawImage(bl, 0, 0, w, h, 0, 0, W, H); c.restore();
};
// 坑：太阳要放在玻璃里面、核半径 ≤130，否则光晕溢到墙上像墙上挂了盏灯；横丝别超过 ~840px，否则像 bug 线。
P.lensFlare = (c, sun, t, { core = 130, rays = 10, streak = 840, ghosts = [[0.45, 34, '120,255,200', 0.09], [0.75, 18, '255,180,120', 0.12], [1.25, 56, '140,170,255', 0.06], [1.6, 24, '255,140,220', 0.09], [2.0, 90, '120,220,255', 0.04]] } = {}) => {
  c.save(); c.globalCompositeOperation = 'lighter';
  const sg = c.createRadialGradient(...sun, 0, ...sun, core); sg.addColorStop(0, 'rgba(255,255,250,.95)'); sg.addColorStop(0.18, 'rgba(255,248,220,.55)'); sg.addColorStop(1, 'rgba(255,230,180,0)'); c.fillStyle = sg; c.beginPath(); c.arc(...sun, core, 0, 7); c.fill();
  for (let k = 0; k < rays; k++) { const a = k / rays * Math.PI * 2 + t * 0.25, L = (k % 2 ? 90 : 170) * (0.9 + 0.1 * Math.sin(t * 5 + k)); c.strokeStyle = 'rgba(255,250,235,.28)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(...sun); c.lineTo(sun[0] + Math.cos(a) * L, sun[1] + Math.sin(a) * L); c.stroke(); }
  const hz = c.createLinearGradient(sun[0] - streak / 2, 0, sun[0] + streak / 2, 0); hz.addColorStop(0, 'rgba(120,200,255,0)'); hz.addColorStop(0.5, 'rgba(200,235,255,.35)'); hz.addColorStop(1, 'rgba(120,200,255,0)'); c.fillStyle = hz; c.fillRect(sun[0] - streak / 2, sun[1] - 2, streak, 4);
  const cxp = 960 + Math.sin(t * 0.7) * 20, cyp = 540;
  ghosts.forEach(([k, r, col, a]) => {
    const x = sun[0] + (cxp - sun[0]) * k, y = sun[1] + (cyp - sun[1]) * k; c.fillStyle = `rgba(${col},${a})`; c.beginPath(); for (let i = 0; i < 6; i++) { const aa = i / 6 * Math.PI * 2 + 0.3; i ? c.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r) : c.moveTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); } c.closePath(); c.fill(); });
  c.restore();
};

// ---------- 纹理叠在角色上 ----------
// shapeLayer：只画了角色的离屏（透明底）；drawTex(g) 往纹理层上画纸纹/颗粒/色晕。
// 坑：直接 source-atop 叠纸纹会把纸的颜色盖上去，人物整体发白；正确做法是纹理层 destination-in 角色剪影，再 multiply 叠回（迁移测试 B）。
P.textureInside = (c, shapeLayer, drawTex, { op = 'multiply', alpha = 1, key = 'texInside' } = {}) => {
  const M = P.scratch(key), mg = M.getContext('2d'); mg.reset(); mg.clearRect(0, 0, W, H);
  drawTex(mg);
  mg.globalCompositeOperation = 'destination-in'; mg.globalAlpha = 1; mg.drawImage(shapeLayer, 0, 0);
  c.save(); c.globalCompositeOperation = op; c.globalAlpha = alpha; c.drawImage(M, 0, 0); c.restore();
};

// ---------- 色调 ----------
// sat: saturation 混合灰的 α（1 = 完全去色）；tint: multiply 一层颜色（暖灰 '#f2e8d2' = 老胶片；土色纹理 = 壁画）
P.fade = (c, { sat = 1, tint } = {}) => {
  c.save(); c.globalCompositeOperation = 'saturation'; c.fillStyle = `rgba(128,128,128,${sat})`; c.fillRect(0, 0, W, H); c.restore();
  if (tint) { c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = tint; c.fillRect(0, 0, W, H); c.restore(); }
};
P.vignette = (c, { cx = 960, cy = 540, inner = 520, outer = 1150, col = 'rgba(0,0,0,.4)' } = {}) => {
  const vg = c.createRadialGradient(cx, cy, inner, cx, cy, outer); vg.addColorStop(0, col.replace(/[\d.]+\)$/, '0)')); vg.addColorStop(1, col); c.fillStyle = vg; c.fillRect(0, 0, W, H);
};
})();
```

## motion.js

来源：https://github.com/alchaincyf/huashu-art-motion/blob/d861767d180008d27675819932070a670a3ae43f/scripts/engine/lib/motion.js

```javascript
// 动效时间库 MO：缓动、弹簧、步进、错开、拍号。全部是「时间 → 数值」的纯函数，不读时钟，确定性。
// 来源：YouTube 解说动画语法 8 支示范片（references/09-视频动画语法.md）。约定：p 是 0..1 的进度，t/lt 是秒。
//   选缓动的一句话：讲解（3b1b/白板）用 smooth/sineInOut 两端都停稳；发布会用 appleOut/弹簧；动态文字用 expoOut＋弹簧；
//   拼贴（Vox）相机用 sineInOut 或长尾 longTail，纸片按 12fps 步进；Kurzgesagt 动作用 k75，循环用 easyEase。
(() => {
const { clamp, lerp } = U;
const MO = window.MO = {};

// 画布尺寸 U.setStage / U.onStage 在 util.js（比本文件先加载的 paint/brush/render/post 也要登记）。

// ---------- 时间片 ----------
MO.seg = (t, a, b) => clamp((t - a) / (b - a));                          // [a,b] → 0..1
MO.at = (t, t0, dur) => clamp((t - t0) / dur);                           // [t0, t0+dur] → 0..1
MO.anim = (lt, start, dur, ease = MO.smooth) => ease(clamp((lt - start) / dur));
// 步进时间：把连续时间量化成 fps 步。拼贴纸片/打字/荧光笔「一拍二」= 12fps；故事型角色 24fps；相机仍按 60fps 平滑。
MO.step = (t, fps = 12) => Math.floor(t * fps + 1e-6) / fps;

// ---------- manim 缓动（3b1b/manim rate_functions.py） ----------
// smooth = 6t⁵−15t⁴+10t³：两端速度、加速度都为 0。讲解类片子的默认缓动。
MO.smooth = t => { t = clamp(t); return t * t * t * (10 - 15 * t + 6 * t * t); };
const sig = x => 1 / (1 + Math.exp(-x));
MO.smoothCE = (t, inflection = 10) => { const e = sig(-inflection / 2); return clamp((sig(inflection * (t - 0.5)) - e) / (1 - 2 * e)); };   // ManimCE 版
MO.thereAndBack = t => MO.smooth(t < 0.5 ? 2 * t : 2 * (1 - t));          // Indicate 用：去了又回
MO.rushInto = t => 2 * MO.smooth(t / 2);                                  // 慢起、冲进终点
MO.rushFrom = t => 2 * MO.smooth(t / 2 + 0.5) - 1;                        // 冲出、慢收
MO.doubleSmooth = t => t < 0.5 ? 0.5 * MO.smooth(2 * t) : 0.5 * (1 + MO.smooth(2 * t - 1));
MO.wiggle = (t, wiggles = 2) => MO.thereAndBack(t) * Math.sin(wiggles * Math.PI * t);
// manim LaggedStart(lag_ratio=r)：n 个子动画里第 i 个在总进度 p 下的局部进度。总长 = 1+(n-1)·r 个单位，第 i 个占 [i·r, i·r+1]。
MO.lagged = (i, n, p, r = 0.05) => clamp(p * (1 + (n - 1) * r) - i * r);

// ---------- 常用解析缓动（AE / CSS 名字） ----------
MO.linear = p => p;
MO.sineInOut = p => -(Math.cos(Math.PI * p) - 1) / 2;
MO.cubicIn = p => p * p * p;
MO.cubicOut = p => 1 - Math.pow(1 - p, 3);
MO.cubicInOut = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
MO.quartOut = p => 1 - Math.pow(1 - p, 4);
MO.quintOut = p => 1 - Math.pow(1 - p, 5);
MO.quintInOut = p => p < .5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2;
MO.expoIn = p => p <= 0 ? 0 : Math.pow(2, 10 * p - 10);
MO.expoOut = p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);                // 动效设计最常用的「快出慢停」
MO.expoInOut = p => p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
// backOut 过冲：s=1.70158 约 10%；2.2 约 13%；2.6 约 17%；3.5 约 23%
MO.backOut = (p, s = 1.70158) => { const q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; };
// 弹性落定：overshoot 一次再回（贴纸「啪」地落下）
MO.elasticOut = p => p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI / 3)) + 1;

// ---------- CSS cubic-bezier(x1,y1,x2,y2)：牛顿法由 x 求参数，再取 y ----------
MO.bezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = s => ((ax * s + bx) * s + cx) * s, Y = s => ((ay * s + by) * s + cy) * s, dX = s => (3 * ax * s + 2 * bx) * s + cx;
  return p => {
    if (p <= 0) return 0; if (p >= 1) return 1;
    let s = p; for (let k = 0; k < 8; k++) { const e = X(s) - p, d = dX(s); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; s -= e / d; }
    s = clamp(s); return Y(s);
  };
};
MO.appleOut = MO.bezier(0.25, 0.1, 0.25, 1);        // CSS `ease`：苹果官网/发布会过渡
MO.emphasized = MO.bezier(0.2, 0, 0, 1);            // Material 3 emphasized：长尾减速
MO.k75 = MO.bezier(0.75, 0, 0.25, 1);               // Kurzgesagt「其他动作用 75% influence」（y1 调研 §6.2）
MO.easyEase = MO.bezier(0.333, 0, 0.667, 1);        // AE Easy Ease：循环动作
MO.longTail = MO.bezier(0.33, 0, 0.2, 1);           // Vox「沿线追过去」「拉出揭示」：起步快、长尾落定（y2 调研）

// ---------- 弹簧 ----------
// SwiftUI 参数化（WWDC23 Animate with springs）：stiffness=(2π/duration)²，damping=4π(1-bounce)/duration → ζ=1-bounce，ω=2π/duration。
// 返回 0→1 的位移（可 >1 = 过冲）。t 单位秒。发布会 UI 用它：.smooth(bounce 0) / .snappy(0.15) / .bouncy(0.3)。
MO.spring = (t, { duration = 0.5, bounce = 0, v0 = 0 } = {}) => {
  if (t <= 0) return 0;
  const w = 2 * Math.PI / duration, z = 1 - bounce;
  let x;                                                                 // x = 剩余位移（1→0）
  if (Math.abs(z - 1) < 1e-4) x = Math.exp(-w * t) * (1 + (w - v0) * t);
  else if (z < 1) { const wd = w * Math.sqrt(1 - z * z); x = Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w - v0) / wd) * Math.sin(wd * t)); }
  else { const r = Math.sqrt(z * z - 1), a = -w * (z - r), b = -w * (z + r); const A = (-v0 - b) / (a - b); x = A * Math.exp(a * t) + (1 - A) * Math.exp(b * t); }
  return 1 - x;
};
MO.smoothSpring = t => MO.spring(t, { duration: 0.5, bounce: 0 });
MO.snappy = t => MO.spring(t, { duration: 0.5, bounce: 0.15 });
MO.bouncy = t => MO.spring(t, { duration: 0.5, bounce: 0.3 });
// 频率/衰减参数化的欠阻尼弹簧阶跃响应（动态文字用）：freq Hz、decay 1/s。
//   freq 3 / decay 6 第一次过冲 ≈37%（砸进来的大字）；2.5 / 9 ≈16%（常规弹入）；2.2 / 10 ≈8%（主词落定）
MO.springHz = (t, freq = 2.5, decay = 9) => t <= 0 ? 0 : 1 - Math.exp(-decay * t) * Math.cos(2 * Math.PI * freq * t);
// 到位后的余振（Dan Ebberts 惯性回弹）：amp·sin(2πft)/e^(decay·t)。换姿势的身体挤压、屏幕震动都用它。
MO.settle = (t, amp, freq = 3, decay = 5) => t <= 0 ? 0 : amp * Math.sin(2 * Math.PI * freq * t) / Math.exp(decay * t);

// ---------- 脉冲节奏（解说片的默认运动：停住 → 猛动 → 停住） ----------
// 出处：一支被判「像放 PPT」的片子（每镜匀速推近 7.5%）换成脉冲后被认可：快推 0.28s、同倍率横移 0.30s、砸入 0.17s，其余时间停住。
// 时长常量集中在这里，CAM.track / MD / 各片段都读它；要改节奏改这里，别在片段里另写一套。
MO.PULSE = { punch: 0.28, pan: 0.30, slam: 0.17, k: 0.25, kMin: 0.18, kMax: 0.32 };
// 砸入曲线：k = 0..1（砸入进度）→ 缩放。1.55 → 0.94（前 60%，3 帧砸下）→ 1.0（后 40%，2 帧回弹）。k≤0 返回 1.55（还没落下）。
MO.slamK = (k, from = 1.55, under = 0.94) => k <= 0 ? from : k < 0.6 ? from - (from - under) * (k / 0.6) : k < 1 ? under + (1 - under) * ((k - 0.6) / 0.4) : 1;
// 某个元素在 at 这一帧砸进来：返回它此刻的缩放（at 之前 = 0，元素还不该画）。o: {dur=0.17, from=1.55, under=0.94}
MO.slam = (t, at, o = {}) => t < at ? 0 : MO.slamK((t - at) / (o.dur || MO.PULSE.slam), o.from, o.under);
// 脉冲进度：at 起 dur 秒内按 cubicInOut 从 0 走到 1，之后停在 1（快推、横移都用它）
MO.pulse = (t, at, dur = MO.PULSE.punch, ease = MO.cubicInOut) => ease(clamp((t - at) / dur));

// ---------- 持续微动 ----------
// 只给环境层（星闪、粒子、远景云）和艺术风格画面用。解说片的主体、标签、卡片落定后停住，不加浮动、呼吸。
// 漂浮：两频正弦叠加。周期避开 5s 左右（HIG：~0.2Hz 的持续摆动让人不适）
MO.float = (t, amp = 6, period = 4, ph = 0) => amp * (0.75 * Math.sin(2 * Math.PI * t / period + ph) + 0.25 * Math.sin(2 * Math.PI * t / (period * 0.53) + ph * 1.7));

// ---------- 反查与拍号 ----------
// 缓动的反函数（二分）：「线头/计数在什么时刻到达 y」。例：折线按 smooth 画，求画到某个 x 的时刻（t3 镜 2 的事件标注）。
MO.invert = (ease, y, iters = 30) => { let a = 0, b = 1; for (let i = 0; i < iters; i++) { const m = (a + b) / 2; if (ease(m) < y) a = m; else b = m; } return (a + b) / 2; };
// 拍 → 秒
MO.beat = (n, bpm = 120) => n * 60 / bpm;
// 揭开那一帧落在拍上：段起点 = 小节线 − 揭开点 × 转场时长（y5：zoom 揭开点 .55、色带 .6、push 到 90% 位移在 .58）
MO.onBeat = (barTime, revealP, trDur) => barTime - revealP * trDur;
})();
```

## camera.js

来源：https://github.com/alchaincyf/huashu-art-motion/blob/d861767d180008d27675819932070a670a3ae43f/scripts/engine/lib/camera.js

```javascript
// 世界相机 CAM：解说片不是「一段段画＋转场」，而是「一张连续的世界画布＋一台相机」。
// 铁律：相机只由全片时间（或本段时间）算出来，场景每帧按相机矢量重画——缩放转场永远清楚，不会把 1920 的位图放大 20 倍糊掉；
//       引擎在转场窗口里会把上一段继续按 t 画进 A 缓冲，所以「上一镜的相机继续推」天然成立（live 推进）。
// cam = { x, y, z, r }：世界点 (x,y) 落在画面中心，缩放 z（>1 推近），绕中心旋转 r（弧度）。缺省 x=960,y=540,z=1,r=0。
(() => {
let W = 1920, H = 1080; U.onStage((w, h) => { W = w; H = h; });   // 画布尺寸跟 U.setStage 走（默认 1920×1080）
const { clamp, lerp } = U;
const CAM = window.CAM = {};
const n = cam => ({ x: cam.x ?? W / 2, y: cam.y ?? H / 2, z: cam.z ?? 1, r: cam.r || 0 });

// 把相机变换作用到 c 上（不 save/restore，调用方负责）
CAM.apply = (c, cam) => { const k = n(cam); c.translate(W / 2, H / 2); if (k.r) c.rotate(k.r); c.scale(k.z, k.z); c.translate(-k.x, -k.y); };
// 在相机下画 fn(c)，自动 save/restore
CAM.with = (c, cam, fn) => { c.save(); CAM.apply(c, cam); fn(c); c.restore(); };
// 世界 → 屏幕 / 屏幕 → 世界
CAM.toScreen = (cam, x, y) => { const k = n(cam); let dx = (x - k.x) * k.z, dy = (y - k.y) * k.z; if (k.r) { const cs = Math.cos(k.r), sn = Math.sin(k.r); [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs]; } return [W / 2 + dx, H / 2 + dy]; };
CAM.toWorld = (cam, sx, sy) => { const k = n(cam); let dx = sx - W / 2, dy = sy - H / 2; if (k.r) { const cs = Math.cos(-k.r), sn = Math.sin(-k.r); [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs]; } return [k.x + dx / k.z, k.y + dy / k.z]; };

// ---------- 缩放 ----------
// 对数插值：z0→z1 每帧放大同样的倍数，观众感到「匀速穿越尺度」；线性插值会前慢后猛。所有推拉缩放都用它。
CAM.zlerp = (z0, z1, e) => z0 * Math.pow(z1 / z0, e);
// 「从一个半径 r 的圆形开口穿进去，开口要在转场结束前盖满屏」需要的最小放大倍数 = 开口中心到最远屏幕角的距离 / r。
// 开口在画面中心时 ≈ 1101/r（卡片里写的「放大倍数 ≥ 1100/半径」）。小了，最后一帧开口没盖满会跳。
CAM.coverZoom = (r, cx = W / 2, cy = H / 2) => Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) / r;
// 让世界点 (wx,wy) 在缩放 z 下出现在屏幕 (sx,sy)：返回相机。推近某物时让它平滑移到画面中心就靠它。
CAM.anchor = (wx, wy, z, sx, sy) => ({ x: wx - (sx - W / 2) / z, y: wy - (sy - H / 2) / z, z });
// 推进某个世界点：从 base 相机出发，缩放按对数插值到 Z（进度 e）；该点在屏幕上从原位置移向画面中心（进度 k，默认 = e；k=0 = 绕它原地推）。
// 用于「钻进镜头」（y1）、「推满照片再硬切」（y2）、「推进最新数据点」（t3，k=0）。
CAM.pushTo = (base, wx, wy, Z, e, k = e, to = [W / 2, H / 2]) => {
  const s0 = CAM.toScreen(base, wx, wy), z = CAM.zlerp(n(base).z, Z, e);
  return CAM.anchor(wx, wy, z, lerp(s0[0], to[0], k), lerp(s0[1], to[1], k));
};

// ---------- 关键帧 ----------
// keys = [{t, x, y, z, r, ease}]；ease 作用在「从上一键到这一键」，默认 cubicInOut；z 用对数插值。
// 沿路径平移（Vox 桌面、白板上的平移/甩镜）就是一串关键帧：平滑移动用 sineInOut，远跳用 cubicInOut＋运动模糊，沿线追用 MO.longTail。
CAM.at = (keys, t) => {
  if (t <= keys[0].t) return { ...keys[0] };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) { const e = (b.ease || MO.cubicInOut)(MO.seg(t, a.t, b.t));
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: CAM.zlerp(a.z, b.z, e), r: lerp(a.r || 0, b.r || 0, e), v: e }; }
  }
  return { ...keys[keys.length - 1] };
};

// ---------- 脉冲镜头（解说片默认用它，不用匀速慢推） ----------
// 节奏：停住 → 快推 / 横移 / 砸入 → 停住；停多久按口播。时长在 MO.PULSE（快推 0.28s、横移 0.30s、砸入 0.17s）。
// CAM.track(base, events, t) → cam：base 是起始相机 {x, y, z}；events 是按时间排的镜头动作，相机只由 t 算出来（确定性，可跳帧）。
// 每个动作从「上一个动作结束时的相机」出发，到 at + dur 落定；两个动作挨太近（上一个没走完下一个就开始）时，下一个从上一个此刻的位置接着走。
//   {at, kind: 'punch', k?, x?, y?, dur?}   快推：z 乘以 (1+k)（k 默认 0.25；横竖屏都写 0.18–0.32）；给 x, y 就同时把这个世界点移到画面中心，
//                                            不给就绕当前画面中心推。k 可以写负数（快拉，回到上一档）。
//   {at, kind: 'pan', x, y, dur?}            同倍率横移：缩放不变，画面中心移到世界点 (x, y)。同一面「墙」上从一件证据移到下一件。
//   {at, kind: 'to', x?, y?, z?, dur?, ease?} 推到指定相机（推近截图上的一块：z 用 MD.zoomFor 算）；dur 默认 0.28。
//   {at, kind: 'slam', dur?, from?}          整帧砸入：z 额外乘 MO.slamK（1.55→0.94→1.0，0.17s）。镜头切到新画面那一帧用。
//   {at, kind: 'shake', amp?, dur?}          震镜：dur（默认 4 帧 ≈ 0.13s）内上下抖 amp 像素（默认 14），和砸入、盖章同帧用，一支片子别超过两次。
//   {at, kind: 'cut', x?, y?, z?}            硬切到这台相机（不过渡）。
// 返回的 cam 带 moving: true/false（这一刻是否在运动），给运动模糊、标签显隐用。
CAM.track = (base, events, t) => {
  let cam = { x: base.x ?? W / 2, y: base.y ?? H / 2, z: base.z ?? 1 }, zMul = 1, dy = 0, moving = false;
  const evs = [...events].sort((a, b) => a.at - b.at);
  for (const e of evs) {
    if (t < e.at) break;
    const P = MO.PULSE, kind = e.kind || 'punch';
    if (kind === 'cut') { cam = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: e.z ?? cam.z }; continue; }
    if (kind === 'slam') { const d = e.dur || P.slam, k = (t - e.at) / d; if (k < 1) { zMul *= MO.slamK(k, e.from); moving = true; } continue; }
    if (kind === 'shake') { const d = e.dur || 4 / 30, k = (t - e.at) / d; if (k < 1) { dy += (e.amp ?? 14) * Math.sin(k * Math.PI * 4) * (1 - k) / cam.z; moving = true; } continue; }
    const d = e.dur || (kind === 'pan' ? P.pan : P.punch), p = (e.ease || MO.cubicInOut)(clamp((t - e.at) / d));
    let to;
    if (kind === 'pan') to = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: cam.z };
    else if (kind === 'to') to = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: e.z ?? cam.z };
    else to = { x: e.x ?? cam.x, y: e.y ?? cam.y, z: cam.z * (1 + (e.k ?? P.k)) };
    if (p < 1) moving = true;
    cam = { x: lerp(cam.x, to.x, p), y: lerp(cam.y, to.y, p), z: CAM.zlerp(cam.z, to.z, p) };
  }
  return { x: cam.x, y: cam.y + dy, z: cam.z * zMul, moving };
};

// ---------- 视差 ----------
// d=1 是主体平面，d<1 远、d>1 近。远层位移按 d 线性、缩放按 z^d：深推时远景几乎不动，这就是景深感（Kurzgesagt 5 层视差）。
CAM.layer = (c, cam, d, fn) => { const k = n(cam); c.save(); CAM.apply(c, { x: lerp(W / 2, k.x, d), y: lerp(H / 2, k.y, d), z: Math.pow(k.z, d) }); fn(c); c.restore(); };

// ---------- 运动 ----------
// 相机在屏幕上的瞬时速度（像素/帧，60fps）：camFn(t) → cam。给 motionBlur 用。
CAM.velocity = (camFn, t, dt = 1 / 60) => { const a = camFn(t), b = camFn(t - dt); const z = n(a).z; return [(n(a).x - n(b).x) * z, (n(a).y - n(b).y) * z]; };
// 动态模糊：沿速度方向把整帧叠 n 次（快摇/甩镜用；速度 <1.5px 自动退化成一次绘制）。模糊长度应短于相机位移（PremiumBeat）。
CAM.motionBlur = (c, src, vx, vy, k = 7) => {
  const sp = Math.hypot(vx, vy); if (sp < 1.5) { c.drawImage(src, 0, 0); return; }
  c.save(); for (let i = 0; i < k; i++) { const q = i / (k - 1) - 0.5; c.globalAlpha = i === 0 ? 1 : 1 / (i + 1); c.drawImage(src, -vx * q, -vy * q); } c.restore();
};
// 手持感微漂：两路不同周期的正弦（连续时间，不闪），返回 [dx, dy] 像素。只给艺术风格画面和纯氛围镜头；解说镜头停住时就停住，不加微漂
CAM.drift = (t, amp = 6, seed = 0) => [amp * Math.sin(t * 0.9 + seed) + amp * 0.4 * Math.sin(t * 2.3 + seed * 2), amp * 0.7 * Math.sin(t * 1.1 + seed * 3)];
})();
```
