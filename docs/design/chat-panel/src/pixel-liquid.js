// 生图占位格:像素液体(还没生成出来的那一格里流动的东西)。
// ------------------------------------------------------------
// 取自 21st.dev 的 pixel-liquid-bg(@unlumen)。
// 上游是 three.js 上的一整套 Navier-Stokes:advect → 外力 → divergence →
// Poisson 迭代 → 投影,速度场留在一串 render target 里滚动,最后一支
// color_frag 把它像素化、抖动、上色。
//
// 这份稿子搬的是【最后那一支】,前面那一套没搬,三个理由:
//   ① 它要 three.js(约 600KB)。这两页是单文件、零依赖、双击即开的稿子,
//      所有东西都得内联进 HTML,加两份 600KB 不值当。
//   ② 一个实例 = 一个 WebGL context + 八张 render target。生图格是四格一排、
//      两页加起来六格,而浏览器同时活着的 context 上限是 8~16,开不起。
//   ③ 格子只有 84px 宽。解算网格会比 128×128 还小,解出来的涡量落到 14 列
//      像素里根本读不出"流体"的意思 —— 那一套的精度在这个尺寸上是浪费的。
//
// 所以速度场换成【curl noise】:对一个随时间漂移的标量势 ψ 取旋度,
//   v = (∂ψ/∂y, -∂ψ/∂x)
// 这样得到的场天然无散度 —— 而无散度正是上游那一串 Poisson 迭代最后要保证的
// 性质。省掉的是"把一个乱场解成无散度场"的过程,不是这个性质本身,所以看上去
// 仍然是液体在推,不是噪声在闪。
//
// color_frag 里那几行(像素化、4×4 Bayer 抖动、噪声、调色板、颗粒、alpha)
// 一字未改地翻成了 JS,见 shade()。两处按尺寸缩放的数写在各自的常量上。
//
// 画布按【CSS 像素】开,不乘 dpr:上游的 Bayer 是按 gl_FragCoord(设备像素)
// 取的,在 2× 屏上一格抖动只有半个 CSS 像素,这里的格子本来就小,再切一半就
// 糊成灰。按 CSS 像素画 + image-rendering: pixelated,抖动的方格是实的,
// 代价是 2× 屏上每个方格由 2×2 设备像素拼成 —— 对"像素液体"来说不算代价。

/* 上游 pixelSize 默认 18,配的是整屏宽的背景(约 80 列)。这里一格 84px,
   照抄 18 只剩 4 列,读不出流动;取 6 —— 14 列,和上游的列数量级对得上,
   方格也还看得出是方格。列数比方格边长更决定它像不像"像素液体"。 */
const PIXEL = 6;

/* 上游 makeBayerTexture() 里那 16 个数,原样。除以 255 是上游在 shader 里
   取纹理时做的(纹素是 0~255 的字节,采样出来是 0~1)。 */
const BAYER = [
  0, 136, 34, 170,
  204, 68, 238, 102,
  51, 187, 17, 153,
  255, 119, 221, 85,
].map((v) => v / 255);

/* 产品指定的两支色。上游默认是五支的粉色系,这里换成两支绿。 */
const STOPS = ['#EAFFEB', '#00FF04'];

/* 上游 light 模式的 bgColor 是 vec4(1,1,1,0) —— 白、且 alpha 为 0。
   alpha 0 的意思是"没有流体的地方完全透出底下",格子自己的底色因此还在。 */
const BG = [255, 255, 255];

/* curl noise 的增益。上游那行是 len = clamp(length(vel) * 2.2, 0, 1),
   2.2 配的是它自己解出来的速度量纲;这里的场是旋度,量纲不同,先用 GAIN
   折算到同一区间,再原样乘 2.2 —— 这样上游那行不用改。
   0.18 是量出来的:这个旋度场的速度中位数约 1.12,乘完 0.18×2.2 落在 0.44,
   于是【一格里多数方格是淡的、涡走过的那几条才吃满绿】。调大到 0.4 以上,
   整格会糊成一块实心绿,液体的形状就没了。 */
const GAIN = 0.18;

const FPS = 30;          // 30 帧够看:方格本来就在跳,60 帧只是多烧一倍 CPU
const REDUCE = typeof matchMedia !== 'undefined'
  ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduced = () => !!(REDUCE && REDUCE.matches);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (v) => v - Math.floor(v);

/* 上游 color_frag 里的 hash / noise,一字未改(GLSL → JS)。 */
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}

/* 标量势:两层随时间反向漂移的 value noise。两层的方向相反,涡才会互相
   挤压、拉长,而不是整块平移过去。 */
function psi(x, y, t) {
  return noise(x * 1.6 + t * 0.20, y * 1.6 - t * 0.14)
       + noise(x * 3.1 - t * 0.11, y * 3.1 + t * 0.17) * 0.5;
}
/* v = (∂ψ/∂y, -∂ψ/∂x),中心差分。 */
function speed(x, y, t) {
  const e = 0.035;
  const vx = (psi(x, y + e, t) - psi(x, y - e, t)) / (2 * e);
  const vy = -(psi(x + e, y, t) - psi(x - e, y, t)) / (2 * e);
  return Math.hypot(vx, vy);
}

/* 调色板查表。上游是一张 w=STOPS.length 的 DataTexture,LinearFilter +
   ClampToEdge,按 vec2(t, 0.5) 采样 —— 也就是纹素坐标 t*w-0.5、两端夹住。
   这里把同一条公式烤成 256 级查表,省掉每像素的插值。 */
function buildPalette() {
  const rgb = STOPS.map((h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]);
  const w = rgb.length;
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * w - 0.5;
    const i0 = Math.min(Math.max(Math.floor(x), 0), w - 1);
    const i1 = Math.min(i0 + 1, w - 1);
    const f = Math.min(Math.max(x - Math.floor(x), 0), 1);
    for (let k = 0; k < 3; k++) {
      lut[i * 3 + k] = Math.round(rgb[i0][k] + (rgb[i1][k] - rgb[i0][k]) * f);
    }
  }
  return lut;
}
const PALETTE = buildPalette();

/* 颗粒。上游是每像素每帧 hash(gl_FragCoord + time*137, time*91) —— 一秒
   几百万次 sin。这里烤成一张 64×64 的白噪表,每帧整体位移一次读:白噪声
   位移之后还是白噪声,肉眼分不出,但省掉了那几百万次。 */
const GRAIN_N = 64;
const GRAIN = (() => {
  const g = new Float32Array(GRAIN_N * GRAIN_N);
  for (let i = 0; i < g.length; i++) g[i] = hash(i % GRAIN_N, Math.floor(i / GRAIN_N));
  return g;
})();

/** 把一帧画进 ImageData。上游 color_frag 的主体,逐行对应。 */
function shade(img, w, h, t) {
  const data = img.data;
  const cols = Math.ceil(w / PIXEL);
  const rows = Math.ceil(h / PIXEL);
  const gx = Math.floor(t * 137) % GRAIN_N;
  const gy = Math.floor(t * 91) % GRAIN_N;

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      /* pixUV = (floor(uv * pixGrid) + 0.5) / pixGrid —— 方格中心 */
      const ux = (bx + 0.5) / cols;
      const uy = (by + 0.5) / rows;

      /* len = clamp(length(vel) * 2.2, 0, 1) */
      const len = clamp01(speed(ux, uy, t) * GAIN * 2.2);

      /* noiseVal = noise(uv * 6 + uTime * 0.15) * 0.06 - 0.03
         上游按像素算,这里按方格算:uv*6 在一格 84px 上是 14px 一个周期,
         恰好一个方格,格内那点差别看不出来。 */
      const nv = noise(ux * 6 + t * 0.15, uy * 6 + t * 0.15) * 0.06 - 0.03;

      const x0 = bx * PIXEL, x1 = Math.min(x0 + PIXEL, w);
      const y0 = by * PIXEL, y1 = Math.min(y0 + PIXEL, h);
      for (let y = y0; y < y1; y++) {
        const grainRow = ((y + gy) % GRAIN_N) * GRAIN_N;
        const bayerRow = (y & 3) * 4;
        let p = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, p += 4) {
          /* dither = bayer - 0.5;  t = clamp(len + dither*0.12 + noiseVal, 0, 1) */
          const dither = BAYER[bayerRow + (x & 3)] - 0.5;
          const tv = clamp01(len + dither * 0.12 + nv);

          /* col = mix(bgColor.rgb, palette(t), t);  再加颗粒 */
          const q = (tv * 255) | 0;
          const grain = (GRAIN[grainRow + ((x + gx) % GRAIN_N)] - 0.5) * 0.085 * 255;
          data[p]     = clamp01((BG[0] + (PALETTE[q * 3]     - BG[0]) * tv + grain) / 255) * 255;
          data[p + 1] = clamp01((BG[1] + (PALETTE[q * 3 + 1] - BG[1]) * tv + grain) / 255) * 255;
          data[p + 2] = clamp01((BG[2] + (PALETTE[q * 3 + 2] - BG[2]) * tv + grain) / 255) * 255;
          /* alpha = mix(bgColor.a, 1.0, t),而 light 下 bgColor.a = 0 */
          data[p + 3] = tv * 255;
        }
      }
    }
  }
}

function mount(host, index) {
  if (host.dataset.liquidMounted) return;
  host.dataset.liquidMounted = '1';

  const cv = document.createElement('canvas');
  cv.className = 'liquid';
  cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  let img = null, w = 0, h = 0;
  const resize = () => {
    const nw = Math.max(1, Math.round(host.clientWidth));
    const nh = Math.max(1, Math.round(host.clientHeight));
    if (nw === w && nh === h) return false;
    w = nw; h = nh;
    cv.width = w; cv.height = h;
    img = ctx.createImageData(w, h);
    return true;
  };
  resize();

  /* 每格错开相位,一排格子不同步 —— 四格一模一样地脉动会很假。 */
  const phase = index * 7.3;
  const draw = (sec) => {
    if (!img) return;
    shade(img, w, h, sec + phase);
    ctx.putImageData(img, 0, 0);
  };

  if (reduced()) { draw(0); return; }

  let raf = 0, running = false, onScreen = true, last = -1;
  const frame = (ms) => {
    const sec = ms / 1000;
    if (last < 0 || sec - last >= 1 / FPS) { last = sec; resize(); draw(sec); }
    if (running) raf = requestAnimationFrame(frame);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const play = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  const sync = () => {
    if (onScreen && document.visibilityState !== 'hidden') play(); else stop();
  };

  draw(0);

  /* 没人看的时候不空转,和这份稿子里别的循环同一条。 */
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(host);
  } else {
    sync();
  }
  document.addEventListener('visibilitychange', sync);
}

document.querySelectorAll('.shot.is-load').forEach(mount);
