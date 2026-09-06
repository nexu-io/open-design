/* Thinking 那一行前面那颗球:thinking-orbs 的 `connecting` 态。
   ============================================================
   上游 thinking-orbs@0.3.1(MIT,Jakub Antalik,https://orbs.jakubantalik.com)。
   包本身是 React 组件,但它把几何和画笔单独发在 `thinking-orbs/engine` 这个
   入口上 —— 那份是纯 2D canvas、零依赖、不碰 React。所以这里【只抄引擎】,
   把 React 那层 80 行的挂载逻辑改写成原生的,而不是为一颗 20px 的球把
   React 拖进一个双击就能看的单文件预览页。

   为什么内联而不是 <script src>:这三份稿子要能直接双击打开、也要能贴进
   artifact 查看器,后者的 CSP 会把任何外站请求(CDN 也算)拦掉。跟上面
   tokens.css 里把字体 base64 内联是同一条理由。

   要跟上游同步:
     npm pack thinking-orbs && tar xzf thinking-orbs-*.tgz
     取 package/dist/engine.es.js 全文替换下面「引擎」那一段,
     把结尾的 `export { ... }` 换成本文件里那行 ORB 常量即可(名字是压缩后的,
     换版本要重新对一遍导出表)。挂载那段不用动。
   ============================================================ */

/* ---------- 引擎(上游 dist/engine.es.js 原样,仅改结尾导出) ---------- */
function U(n, s, t) {
  return n + (s - n) * t;
}
function nt(n) {
  return n - Math.floor(n);
}
function G(n, s) {
  const t = Math.floor(n), r = Math.floor(s);
  let a = n - t, o = s - r;
  a = a * a * (3 - 2 * a), o = o * o * (3 - 2 * o);
  const c = E(t, r), M = E(t + 1, r), h = E(t, r + 1), m = E(t + 1, r + 1);
  return c + (M - c) * a + (h - c) * o + (c - M - h + m) * a * o;
}
function E(n, s) {
  const t = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453;
  return t - Math.floor(t);
}
function J(n, s) {
  const t = Math.PI * (3 - Math.sqrt(5)), r = 1 - 2 * (n + 0.5) / s, a = Math.sqrt(1 - r * r), o = n * t;
  return [a * Math.cos(o), r, a * Math.sin(o)];
}
function et(n, s) {
  return Math.atan2(Math.sin(n - s), Math.cos(n - s));
}
function _(n, s, t, r, a) {
  const o = Math.sin(s), c = Math.cos(s), M = Math.sin(n), h = Math.cos(n);
  return (m, D, p) => {
    const e = m * h + p * M, l = -m * M + p * h, R = D * c - l * o, w = D * o + l * c;
    return [t + e * a, r - R * a, w];
  };
}
/* ── 墨色染色钩子 ─────────────────────────────────────────────
   默认仍是上游的严格单色(灰),只有宿主元素上写了 --orb-ink 才染色。
   不能直接把点换成一个平色:引擎的景深是靠【墨的明度】拉开的 ——
   近处的点墨重、远处的点墨淡。所以这里把那份明度差转成 alpha 再上色:
     浅底  墨重(M→0)   = 颜色最浓
     暗底  墨亮(M→255) = 颜色最浓
   染完景深一点没丢,只是换了个通道表达。 */
let CURRENT_INK = null;
function orbInk(el) {
  const v = getComputedStyle(el).getPropertyValue('--orb-ink').trim();
  if (!v) return null;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.fillStyle = '#000';
  probe.fillStyle = v;                      // 交给浏览器解析,任何合法写法都行
  const m = /^#([0-9a-f]{6})$/i.exec(probe.fillStyle);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function orbPaint(M, alpha, dark) {
  if (!CURRENT_INK) return `rgba(${M},${M},${M},${alpha})`;
  const k = dark ? M / 255 : 1 - M / 255;   // 墨与底的反差,拿来当不透明度
  return `rgba(${CURRENT_INK[0]},${CURRENT_INK[1]},${CURRENT_INK[2]},${alpha * k})`;
}
function rt(n, s, t, r = 0.3) {
  for (const a of s) {
    const o = a.a ?? 1, c = Math.min(1, Math.max(0, a.white)), M = Math.round((t ? 1 - c : c) * 255);
    n.fillStyle = orbPaint(M, o, t), n.beginPath(), n.arc(a.x, a.y, a.r, 0, Math.PI * 2), n.fill();
  }
}
function it(n, s, t) {
  for (const r of s) {
    const a = r.a ?? 1, o = Math.min(1, Math.max(0, r.white)), c = Math.round((t ? 1 - o : o) * 255);
    n.strokeStyle = orbPaint(c, a, t), n.lineWidth = r.w, n.beginPath(), n.moveTo(r.x1, r.y1), n.lineTo(r.x2, r.y2), n.stroke();
  }
}
function L(n, s, t = 0.3) {
  const r = [];
  for (const a of n)
    (a.a ?? 1) < 0.02 || (a.r = Math.max(t, a.r), r.push(a));
  return r.sort((a, o) => a.z - o.z), { dots: r, lines: s.filter((a) => (a.a ?? 1) >= 0.02) };
}
function ht(n, s, t) {
  s.lines.length && it(n, s.lines, t), rt(n, s.dots, t);
}
function $(n, s) {
  return (n / 300) ** s;
}
const Mt = (n, s, t) => {
  const r = n / 2, a = n / 2, o = n / 2 * 0.76, c = _(s * 0.4, 0.3, r, a, 1), M = $(n, t.rsPow ?? 0.6), h = [], m = t.ghostN ?? 150;
  for (let e = 0; e < m; e++) {
    const l = J(e, m), [R, w, i] = c(l[0] * o, l[1] * o, l[2] * o), u = (i / o + 1) / 2;
    h.push({ x: R, y: w, z: i, r: 0.8 * M, white: 0.78, a: 0.1 + 0.22 * u });
  }
  const D = t.strandN ?? 52, p = t.turns ?? 3;
  for (let e = 0; e < 3; e++) {
    const l = e / 3 * 2 * Math.PI;
    for (let R = 0; R < D; R++) {
      const w = (nt(R / D + s * 0.045) * 2 - 1) * 0.96, i = Math.sqrt(Math.max(0, 1 - w * w)), u = Math.min(1, (1 - Math.abs(w)) / 0.1), y = w * Math.PI * p + l, b = 1 + 0.075 * Math.sin(w * Math.PI * p * 2 + l * 2 + s * 0.8), f = i * o * b, [P, x, g] = c(Math.cos(y) * f, w * o * b, Math.sin(y) * f), d = (g / o + 1) / 2;
      h.push({
        x: P,
        y: x,
        z: g,
        r: ((t.rBase ?? 1.2) + (t.rDepth ?? 1.8) * d) * M,
        white: 0.55 - 0.45 * d,
        a: u * (0.45 + 0.55 * d)
      });
    }
  }
  return L(h, [], t.rMin);
};
function lt(n, s, t, r) {
  const a = 2 * s * t + r, o = n % a, c = new Array(s).fill(0);
  let M = -1;
  if (o < 2 * s * t) {
    const h = Math.floor(o / t), m = (o - h * t) / t, p = 1 - (1 - Math.min(1, m / 0.7)) ** 3;
    if (h < s) {
      for (let e = 0; e < h; e++) c[e] = 1;
      c[h] = p, M = h;
    } else {
      const e = 2 * s - 1 - h;
      for (let l = 0; l < e; l++) c[l] = 1;
      c[e] = 1 - p, M = e;
    }
  }
  return { amount: c, active: M };
}
function pt(n, s, t) {
  let [r, a, o] = n, c = !1;
  for (let M = 0; M < s.length; M++) {
    if (t.amount[M] <= 0) continue;
    const h = s[M], m = h.axis === 0 ? r : h.axis === 1 ? a : o;
    if (m < h.lo || m >= h.hi) continue;
    M === t.active && (c = !0);
    const D = h.ang * t.amount[M], p = Math.cos(D), e = Math.sin(D);
    if (h.axis === 0) {
      const l = a * p - o * e;
      o = a * e + o * p, a = l;
    } else if (h.axis === 1) {
      const l = r * p + o * e;
      o = -r * e + o * p, r = l;
    } else {
      const l = r * p - a * e;
      a = r * e + a * p, r = l;
    }
  }
  return [r, a, o, c];
}
function ut(n) {
  const s = [];
  for (let t = 0; t < n; t++) {
    const r = Math.min(2, Math.floor(E(t, 2.3) * 3)), a = -1 + 0.5 * Math.min(3, Math.floor(E(t, 5.9) * 4)), o = E(t, 7.7) < 0.5 ? 1 : -1;
    s.push({ axis: r, lo: a, hi: a + 0.5, ang: o * Math.PI / 2 });
  }
  return s;
}
const ft = (n, s, t) => {
  const a = n / 2, o = n / 2, c = n / 2 * 0.82, M = 0.4 + 0.06 * Math.sin(s * 0.35), h = _(s * 0.5, M, a, o, c), m = s * (0.5 + (1.7 - 0.5) * (t.scanMul ?? 1)), D = $(n, t.rsPow ?? 0.6), p = t.dimBase ?? 1, e = [], l = t.latRings ?? 17, R = t.lonDensity ?? 44;
  for (let w = 0; w <= l; w++) {
    const i = -Math.PI / 2 + w / l * Math.PI, u = Math.cos(i), y = Math.sin(i), b = Math.max(1, Math.round(Math.abs(u) * R));
    for (let f = 0; f < b; f++) {
      const P = f / b * 2 * Math.PI, [x, g, d] = h(u * Math.cos(P), y, u * Math.sin(P)), v = (d + 1) / 2, k = et(P + s * 0.5, m), N = Math.exp(-(k * k) / 0.18) * Math.max(0, d);
      e.push({
        x,
        y: g,
        z: d,
        r: ((t.rBase ?? 0.6) + (t.rDepth ?? 1.7) * v + (t.rBoost ?? 1) * N) * D,
        white: (t.inkFar ?? 0.62) - (t.inkSpan ?? 0.54) * v,
        // dimBase < 1 fades un-scanned dots so the meridian reads clearly
        a: p + (1 - p) * Math.min(1, N)
      });
    }
  }
  return L(e, [], t.rMin);
}, dt = (n, s, t) => {
  const r = n / 2, a = n / 2, o = n / 2 * 0.82, c = _(s * 0.55, 0.35 + 0.1 * Math.sin(s * 0.9), r, a, o), M = $(n, t.rsPow ?? 0.6), h = t.moveCount ?? 14, m = ut(h), D = lt(s, h, 0.42, 1.2), p = [], e = t.latRings ?? 15, l = t.lonDensity ?? 40;
  for (let R = 0; R <= e; R++) {
    const w = -Math.PI / 2 + R / e * Math.PI, i = Math.cos(w), u = Math.sin(w), y = Math.max(1, Math.round(Math.abs(i) * l));
    for (let b = 0; b < y; b++) {
      const f = b / y * 2 * Math.PI, [P, x, g, d] = pt([i * Math.cos(f), u, i * Math.sin(f)], m, D), [v, k, N] = c(P, x, g), z = (N + 1) / 2;
      p.push({
        x: v,
        y: k,
        z: N,
        r: ((t.rBase ?? 0.6) + (t.rDepth ?? 1.7) * z + (d ? t.rActive ?? 0.3 : 0)) * M,
        white: (t.inkFar ?? 0.62) - (t.inkSpan ?? 0.54) * z - (d ? 0.14 : 0)
      });
    }
  }
  return L(p, [], t.rMin);
}, bt = (n, s, t) => {
  const r = n / 2, a = n / 2, o = n / 2 * 0.874, c = _(s * 0.18, 0.38, r, a, 1), M = $(n, t.rsPow ?? 0.6), h = [], m = t.rings ?? 15, D = t.lonDensity ?? 40;
  for (let p = 0; p <= m; p++) {
    const e = -Math.PI / 2 + p / m * Math.PI, l = Math.cos(e), R = Math.sin(e), w = 0.62 * Math.sin(s * 2.1 - p * 0.52) + 0.38 * Math.sin(s * 1.27 + p * 0.83), i = o * (0.88 + 0.105 * w), u = Math.max(1, Math.round(Math.abs(l) * D));
    for (let y = 0; y < u; y++) {
      const b = y / u * 2 * Math.PI, [f, P, x] = c(l * Math.cos(b) * i, R * i, l * Math.sin(b) * i), g = (x / o + 1) / 2, d = Math.max(0, w);
      h.push({
        x: f,
        y: P,
        z: x,
        r: ((t.rBase ?? 0.6) + (t.rDepth ?? 1.7) * g) * (1 + 0.4 * d) * M,
        white: 0.66 - 0.56 * g - 0.1 * d
      });
    }
  }
  return L(h, [], t.rMin);
};
function xt(n) {
  return n * n * (3 - 2 * n);
}
function st(n) {
  const s = n.length, t = [];
  let r = 0;
  for (let a = 0; a < s; a++) {
    const o = n[a], c = n[(a + 1) % s], M = Math.hypot(c[0] - o[0], c[1] - o[1]);
    t.push(M), r += M;
  }
  return (a) => {
    let o = a * r, c = 0;
    for (; o > t[c] && c < s - 1; )
      o -= t[c], c++;
    const M = n[c], h = n[(c + 1) % s], m = t[c] ? Math.min(1, o / t[c]) : 0;
    return [M[0] + (h[0] - M[0]) * m, M[1] + (h[1] - M[1]) * m];
  };
}
const yt = (n) => {
  const s = -Math.PI / 2 + n * 2 * Math.PI;
  return [Math.cos(s) * 0.24, Math.sin(s) * 0.24];
}, gt = st([
  [0, -0.26],
  [0.24, 0.16],
  [-0.24, 0.16]
]), mt = st([
  [0, -0.2],
  [0.2, -0.2],
  [0.2, 0.2],
  [-0.2, 0.2],
  [-0.2, -0.2]
]), H = [yt, gt, mt];
function wt(n) {
  return Math.max(6, Math.round(34 * n));
}
const V = 1.4, ot = 0.9, Q = V + ot, Pt = (n, s, t) => {
  const r = H.length, a = s % (Q * r), o = Math.floor(a / Q), c = a - o * Q, M = c > V ? xt((c - V) / ot) : 0, h = t.spread ?? 1, m = H[o], D = H[(o + 1) % r], p = 160, e = [];
  for (let x = 0; x < p; x++) {
    const g = x / p, d = m(g), v = D(g);
    e.push([(d[0] + (v[0] - d[0]) * M) * h, (d[1] + (v[1] - d[1]) * M) * h]);
  }
  const l = [];
  let R = 0;
  for (let x = 0; x < p; x++) {
    const g = e[x], d = e[(x + 1) % p], v = Math.hypot(d[0] - g[0], d[1] - g[1]);
    l.push(v), R += v;
  }
  const w = wt(t.iconD ?? 1), i = (t.rDot ?? 0.021) * 1.35 * h, u = 1 + 0.02 * Math.sin(c * 3.1), y = [], b = n / 2;
  let f = 0, P = 0;
  for (let x = 0; x < w; x++) {
    const g = x / w * R;
    for (; P + l[f] < g && f < p - 1; )
      P += l[f], f++;
    const d = e[f], v = e[(f + 1) % p], k = l[f] ? Math.min(1, (g - P) / l[f]) : 0, N = (d[0] + (v[0] - d[0]) * k) * u, z = (d[1] + (v[1] - d[1]) * k) * u;
    y.push({
      x: b + N * n,
      y: b + z * n,
      z: 0,
      r: Math.max(0.35, i * n),
      white: 0.1
    });
  }
  return L(y, [], t.rMin);
}, Rt = (n, s, t) => {
  const r = n / 2, a = n / 2, o = n / 2 * 0.82, c = _(s * 0.12, 0.3, r, a, 1), M = $(n, t.rsPow ?? 0.6), h = [], m = t.orbitN ?? 12, D = t.ghostN ?? 40, p = t.particles ?? 3;
  for (let e = 0; e < m; e++) {
    const l = E(e, 1.7), R = E(e, 5.2), w = E(e, 8.9), i = o * (0.45 + 0.52 * l), u = l * 2 * Math.PI, y = Math.acos(2 * R - 1), b = Math.sin(y) * Math.cos(u), f = Math.cos(y), P = Math.sin(y) * Math.sin(u);
    let x = -f, g = b;
    const d = 0, v = Math.max(1e-6, Math.sqrt(x * x + g * g));
    x /= v, g /= v;
    const k = f * d - P * g, N = P * x - b * d, z = b * g - f * x, O = (0.25 + 0.55 * w) * (w > 0.5 ? 1 : -1);
    for (let B = 0; B < D; B++) {
      const I = B / D * 2 * Math.PI, [S, A, T] = c(
        (x * Math.cos(I) + k * Math.sin(I)) * i,
        (g * Math.cos(I) + N * Math.sin(I)) * i,
        (d * Math.cos(I) + z * Math.sin(I)) * i
      ), C = (T / i + 1) / 2;
      h.push({
        x: S,
        y: A,
        z: T,
        r: (t.ghostR ?? 0.9) * M,
        white: 0.72,
        a: (t.ghostA ?? 0.5) * (0.4 + 0.6 * C)
      });
    }
    for (let B = 0; B < p; B++) {
      const I = s * O + B / p * 2 * Math.PI + R * 6, [S, A, T] = c(
        (x * Math.cos(I) + k * Math.sin(I)) * i,
        (g * Math.cos(I) + N * Math.sin(I)) * i,
        (d * Math.cos(I) + z * Math.sin(I)) * i
      ), C = (T / i + 1) / 2;
      h.push({
        x: S,
        y: A,
        z: T,
        r: ((t.partR ?? 1.2) + (t.partRDepth ?? 1.6) * C) * M,
        white: 0.3 - 0.22 * C
      });
    }
  }
  return L(h, [], t.rMin);
}, Z = (n, s, t) => {
  const r = n / 2, a = n / 2, o = n / 2 * 0.78, c = t.spin ?? 1, M = 0.3, h = _(s * 0.1 * c, M, r, a, 1), m = $(n, t.rsPow ?? 0.6), D = [], p = t.ghostN ?? 150;
  for (let z = 0; z < p; z++) {
    const O = J(z, p), [B, I, S] = h(O[0] * o, O[1] * o, O[2] * o), A = (S / o + 1) / 2;
    D.push({ x: B, y: I, z: S, r: 0.8 * m, white: 0.78, a: 0.1 + 0.22 * A });
  }
  const e = s * 0.24 * c, l = t.faceOn ? -M : 0.55 + 0.3 * Math.sin(s * 0.18) * c, R = Math.cos(e), w = 0, i = Math.sin(e), u = -i * Math.sin(l), y = Math.cos(l), b = R * Math.sin(l), f = w * b - i * y, P = i * u - R * b, x = R * y - w * u, g = 0.23 * (t.wobMul ?? 1), d = t.faceOn ? o / (1 + 0.85 * g) : o, v = t.lanes ?? 5, k = t.segs ?? 88, N = Math.max(1, Math.round(v * (t.bandMul ?? 1)));
  for (let z = 0; z < N; z++) {
    const O = (z - (N - 1) / 2) * 0.075, B = Math.abs(z - (N - 1) / 2) / Math.max(1, (N - 1) / 2);
    for (let I = 0; I < k; I++) {
      const S = I / k * 2 * Math.PI, A = (0.16 * Math.sin(S * 3 - s * 1.7 + z * 0.22) + 0.07 * Math.sin(S * 5 + s * 1.1)) * (t.wobMul ?? 1), T = t.faceOn ? 1 + A : 1, C = t.faceOn ? O : O + A, q = R * Math.cos(S) + u * Math.sin(S) + f * C, F = w * Math.cos(S) + y * Math.sin(S) + P * C, j = i * Math.cos(S) + b * Math.sin(S) + x * C, W = Math.sqrt(q * q + F * F + j * j), Y = d * T, [ct, at, X] = h(q / W * Y, F / W * Y, j / W * Y), K = (X / o + 1) / 2;
      D.push({
        x: ct,
        y: at,
        z: X,
        r: ((t.rBase ?? 1.1) + (t.rDepth ?? 1.7) * K) * (1 - 0.25 * B) * m,
        white: 0.52 - 0.44 * K + 0.18 * B,
        a: 0.4 + 0.6 * K
      });
    }
  }
  return L(D, [], t.rMin);
}, Dt = (n, s, t) => {
  const r = n / 2, a = n / 2, o = n / 2 * 0.8 * (t.spread ?? 1), c = _(s * 0.12, 0.32, r, a, o), M = $(n, t.rsPow ?? 0.6), h = t.nodeN ?? 30, m = t.thr ?? 0.72, D = t.nodeR ?? 1.4, p = t.nodeRDepth ?? 1.8, e = [];
  for (let i = 0; i < h; i++) {
    const u = J(i, h), y = u[0] + 0.3 * (G(i * 0.31 + 9, s * 0.24) - 0.5) * 2, b = u[1] + 0.3 * (G(i * 0.53 + 27, s * 0.21) - 0.5) * 2, f = u[2] + 0.3 * (G(i * 0.77 + 55, s * 0.27) - 0.5) * 2, P = Math.sqrt(y * y + b * b + f * f);
    e.push([y / P, b / P, f / P]);
  }
  const l = [], R = [];
  for (let i = 0; i < h; i++)
    for (let u = i + 1; u < h; u++) {
      const y = e[i][0] - e[u][0], b = e[i][1] - e[u][1], f = e[i][2] - e[u][2], P = Math.sqrt(y * y + b * b + f * f);
      if (P >= m) continue;
      const [x, g, d] = c(e[i][0], e[i][1], e[i][2]), [v, k, N] = c(e[u][0], e[u][1], e[u][2]), z = ((d + N) / 2 + 1) / 2;
      l.push({
        x1: x,
        y1: g,
        x2: v,
        y2: k,
        white: 0.42,
        a: (1 - P / m) * (0.3 + 0.55 * z),
        w: Math.max(0.6, (t.lineW ?? 0.8) * M)
      });
    }
  for (let i = 0; i < h; i++) {
    const [u, y, b] = c(e[i][0], e[i][1], e[i][2]), f = (b + 1) / 2, P = 1 + 0.25 * Math.sin(s * 1.4 + i * 2.7);
    R.push({
      x: u,
      y,
      z: b,
      r: (D + p * f) * P * M,
      white: 0.55 - 0.45 * f
    });
  }
  const w = t.signals ?? 5;
  for (let i = 0; i < w; i++) {
    const u = Math.floor(s * 0.55 + i * 7.31), y = Math.floor(E(u, i * 3.1 + 1.7) * h), b = Math.floor(E(u, i * 5.7 + 4.2) * h);
    if (y === b) continue;
    const f = nt(s * 0.55 + i * 7.31), P = U(e[y][0], e[b][0], f), x = U(e[y][1], e[b][1], f), g = U(e[y][2], e[b][2], f), d = Math.max(1e-6, Math.sqrt(P * P + x * x + g * g)), [v, k, N] = c(P / d, x / d, g / d), z = (N + 1) / 2;
    R.push({
      x: v,
      y: k,
      z: N,
      r: (D * 1.5 + p * z) * M,
      white: 0.05,
      a: 0.5 + 0.5 * z
    });
  }
  return L(R, l, t.rMin);
}, vt = {
  orbits: Rt,
  globe: ft,
  rubik: dt,
  wave: bt,
  web: Dt,
  braid: Mt,
  ribbon: Z,
  // ring shares ribbon's geometry — the `faceOn` profile flag switches it
  ring: Z,
  morph: Pt
}, Ct = Object.fromEntries(
  Object.entries(vt).map(([n, s]) => [
    n,
    (t, r, a, o, c) => ht(t, s(r, a, c), o)
  ])
), zt = [
  ["latRings", "lonDensity"],
  ["rings", "lonDensity"],
  ["lanes", "segs"]
], Nt = ["orbitN", "ghostN", "nodeN", "strandN", "signals"], It = ["iconD"], kt = [
  "rBase",
  "rDepth",
  "rActive",
  "rDot",
  "ghostR",
  "partR",
  "partRDepth",
  "nodeR",
  "nodeRDepth"
];
function St(n, s) {
  const t = { ...n }, r = /* @__PURE__ */ new Set(), a = Math.sqrt(s);
  for (const [o, c] of zt) {
    const M = t[o], h = t[c];
    M != null && h != null && !r.has(o) && !r.has(c) && (t[o] = Math.max(2, Math.round(M * a)), t[c] = Math.max(2, Math.round(h * a)), r.add(o), r.add(c));
  }
  for (const o of Nt) {
    const c = t[o];
    c != null && c !== 0 && !r.has(o) && (t[o] = Math.max(1, Math.round(c * s)));
  }
  for (const o of It) {
    const c = t[o];
    c != null && (t[o] = Math.max(0.02, c * s));
  }
  return t;
}
function Bt(n, s) {
  const t = { ...n };
  for (const r of kt) {
    const a = t[r];
    a != null && (t[r] = a * s);
  }
  return t.rSizeMul = (t.rSizeMul ?? 1) * s, t;
}
const Et = {
  globe: {
    latRings: 17,
    lonDensity: 44,
    rBase: 0.6,
    rDepth: 1.7,
    rBoost: 1,
    inkFar: 0.62,
    inkSpan: 0.54,
    rsPow: 0.6,
    rMin: 0.3
  },
  orbits: {
    orbitN: 12,
    ghostN: 40,
    ghostR: 0.9,
    ghostA: 0.5,
    particles: 3,
    partR: 1.2,
    partRDepth: 1.6,
    rsPow: 0.6,
    rMin: 0.3
  },
  rubik: {
    latRings: 15,
    lonDensity: 40,
    moveCount: 14,
    rBase: 0.6,
    rDepth: 1.7,
    rActive: 0.3,
    inkFar: 0.62,
    inkSpan: 0.54,
    rsPow: 0.6,
    rMin: 0.3
  },
  wave: {
    rings: 15,
    lonDensity: 40,
    rBase: 0.6,
    rDepth: 1.7,
    rsPow: 0.6,
    rMin: 0.3
  },
  web: {
    nodeN: 30,
    thr: 0.72,
    signals: 5,
    nodeR: 1.4,
    nodeRDepth: 1.8,
    lineW: 0.8,
    rsPow: 0.6,
    rMin: 0.3
  },
  braid: {
    strandN: 52,
    turns: 3,
    ghostN: 150,
    rBase: 1.2,
    rDepth: 1.8,
    rsPow: 0.6,
    rMin: 0.3
  },
  ribbon: {
    lanes: 5,
    segs: 88,
    ghostN: 150,
    rBase: 1.1,
    rDepth: 1.7,
    rsPow: 0.6,
    rMin: 0.3
  },
  // ring shares ribbon's painter; faceOn cancels the camera tilt and moves
  // the undulation onto the radius, and there is no ghost sphere behind it
  ring: {
    lanes: 5,
    segs: 88,
    ghostN: 0,
    faceOn: 1,
    rBase: 1.1,
    rDepth: 1.7,
    rsPow: 0.6,
    rMin: 0.3
  },
  morph: {
    rDot: 0.021,
    iconD: 1,
    rMin: 0.25
  }
}, Ot = {
  working: "orbits",
  searching: "globe",
  solving: "rubik",
  listening: "wave",
  connecting: "web",
  weaving: "braid",
  composing: "ribbon",
  breathing: "ring",
  shaping: "morph"
}, At = {
  orbits: {
    64: { speed: 1.885, count: 1, size: 1 },
    20: { speed: 3.9, count: 0.238, size: 2.4 }
  },
  globe: {
    64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } },
    20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } }
  },
  rubik: {
    64: { speed: 1.82, count: 0.35, size: 1.05 },
    20: { speed: 1.95, count: 0.088, size: 1.9 }
  },
  wave: {
    64: { speed: 4.388, count: 0.341, size: 1 },
    20: { speed: 3.998, count: 0.105, size: 1.6 }
  },
  web: {
    64: { speed: 3.315, count: 1.35, size: 0.95 },
    20: { speed: 6.63, count: 0.25, size: 1.52 }
  },
  braid: {
    64: { speed: 1.625, count: 0.5, size: 1 },
    20: { speed: 2.75, count: 0.1125, size: 1.36 }
  },
  ribbon: {
    64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } },
    20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } }
  },
  ring: {
    64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } },
    20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } }
  },
  morph: {
    64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } },
    20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } }
  }
}, tt = /* @__PURE__ */ new Map();
function Lt(n, s) {
  const t = `${n}-${s}`, r = tt.get(t);
  if (r) return r;
  const a = Ot[n], o = At[a][s];
  let c = { ...Et[a] };
  o.count !== 1 && (c = St(c, o.count)), o.size !== 1 && (c = Bt(c, o.size)), o.extra && (c = { ...c, ...o.extra });
  const M = { mode: a, speed: o.speed, opts: c };
  return tt.set(t, M), M;
}

/* 上游结尾是 `export { Ct as MODE_DRAWS, ..., Lt as resolvePreset }`。
   内联进页面时没人 import 它,收成一个常量,下面挂载那段直接取。 */
const ORB = { MODE_DRAWS: Ct, resolvePreset: Lt };


/* ---------- 挂载(替代上游的 React 组件,行为一比一) ---------- */

/* 每个状态的默认 aria-label,和上游同一张表 —— 球是 role="img",
   读屏软件念的是这句,不是旁边那个 Thinking。 */
const ORB_LABEL = {
  working: 'Working…', searching: 'Searching…', solving: 'Solving…',
  listening: 'Listening…', connecting: 'Connecting…', weaving: 'Weaving…',
  composing: 'Composing…', breathing: 'Thinking…', shaping: 'Shaping…',
};

/* 深浅底:先往上找最近一个 data-theme / .dark / .light,找不到再问系统。
   本项目三份稿子都在 .od-preview-root 上钉了 data-theme,所以场景稿和浅色
   组件页拿到 light、暗色页拿到 dark —— 不会被评审者的系统暗色模式误触发,
   和 tokens.css 里那条作用域是同一个约定。 */
function orbDark(el) {
  for (let n = el; n; n = n.parentElement) {
    const t = n.getAttribute && n.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    if (n.classList && n.classList.contains('dark')) return true;
    if (n.classList && n.classList.contains('light')) return false;
  }
  return typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches;
}

function mountOrb(host) {
  if (host.dataset.orbMounted) return;
  host.dataset.orbMounted = '1';

  const state = host.dataset.orb || 'working';
  /* 上游只发 64 和 20 两档,而且明说不是缩放系数、是两套各自调过点数和点径的
     设计。这一行是 12px 的正文旁边,取 20 那档(上游写的 inline-text scale)。 */
  const size = Number(host.dataset.orbSize) || 20;
  /* 画布【显示】尺寸,跟上面那个"档位"分开。
     上游只发 20 / 64 两档,而且明说不是缩放系数,是两套各自调过点数和点径的
     设计 —— 传 24 进 resolvePreset 会直接取不到表。所以档位仍走 20,
     只把这一档画到一个稍大的盒子里:几何按 box/size 等比放大,backing store
     也跟着放大,不是把 20px 的位图拉上去,放大后边缘照样是实的。 */
  const box = Number(host.dataset.orbBox) || size;
  const speedMul = Number(host.dataset.orbSpeed) || 1;

  const cv = document.createElement('canvas');
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', host.dataset.orbLabel || ORB_LABEL[state] || 'Thinking…');
  cv.style.width = cv.style.height = box + 'px';
  cv.style.display = 'block';
  host.appendChild(cv);

  const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
  cv.width = Math.round(box * dpr);
  cv.height = Math.round(box * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const preset = ORB.resolvePreset(state, size);
  const draw = ORB.MODE_DRAWS[preset.mode];
  const rate = preset.speed * speedMul;
  let dark = orbDark(host);
  let ink = orbInk(host);

  const paint = (t) => {
    CURRENT_INK = ink;
    /* dpr 之外再乘一档 box/size:画的还是 20 那套几何,落到大盒子上。 */
    const k = dpr * box / size;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, size, size);
    draw(ctx, size, t, dark, preset.opts);
  };
  /* 时钟取全局的 performance.now(),不是各自从 0 起 —— 页面上有好几颗球时
     它们同相,不会各转各的。 */
  const now = () => performance.now() / 1000 * rate;

  /* 关掉动效的人给一帧静止的代表帧(和上游同一个 t=0.6),不是空白也不是转圈。
     主题仍然跟着走。 */
  const reduce = typeof matchMedia !== 'undefined'
    ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  let raf = 0, running = false, visible = true;
  const tick = () => { paint(now()); if (running) raf = requestAnimationFrame(tick); };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const still = () => { stop(); paint(0.6); };

  const sync = () => {
    if (reduce && reduce.matches) { still(); return; }
    if (visible && document.visibilityState !== 'hidden') start(); else stop();
  };

  paint(reduce && reduce.matches ? 0.6 : now());

  /* 滚出视口 / 切走标签页就停,回来接着当前时钟继续 —— 一颗一直在跑的
     canvas 不该在没人看的时候还占着一帧。 */
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(cv);
  } else {
    sync();
  }
  document.addEventListener('visibilitychange', sync);
  if (reduce) reduce.addEventListener('change', sync);

  /* 主题是活的:查看器切深浅、系统切深浅,球跟着换墨色。 */
  const repaintTheme = () => {
    const next = orbDark(host);
    ink = orbInk(host);
    if (next === dark) return;
    dark = next;
    if (!running) paint(reduce && reduce.matches ? 0.6 : now());
  };
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(repaintTheme).observe(document.documentElement, {
      attributes: true, attributeFilter: ['class', 'data-theme'], subtree: true,
    });
  }
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaintTheme);
  }
}

for (const el of document.querySelectorAll('[data-orb]')) mountOrb(el);
