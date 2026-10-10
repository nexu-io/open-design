# Motion.Lab · advanced

从固定提交的 data/effects.ts 提取，代码保留原样；是集成起点，不是对所有运行环境的兼容性保证。使用前落实 DOM 作用域、依赖、清理及无障碍。

## gsap-scrollTrigger — 滚动驱动 / GSAP ScrollTrigger

使用 GSAP ScrollTrigger 绑定滚动进度。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "distance",
    "label": "位移",
    "min": 50,
    "max": 400,
    "step": 10,
    "default": 200,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="gsap-target">SCROLL</div>
```

### CSS

```css
.gsap-target { font-size: 64px; font-weight: 900; }
```

### JS

```javascript
gsap.registerPlugin(ScrollTrigger);
gsap.to('.gsap-target', { x: 200, scrollTrigger: { trigger: '.gsap-target', start: 'top center', end: 'bottom center', scrub: true } });
```

## three-particles — 粒子系统 / Three.js Particles

Three.js 渲染的几何粒子系统。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 100,
    "max": 5000,
    "step": 100,
    "default": 1500
  }
]
```

### HTML

```html
<canvas class="three"></canvas>
```

### CSS

```css
.three { width: 100%; height: 100%; }
```

### JS

```javascript
import * as THREE from 'three';
const scene = new THREE.Scene();
const geom = new THREE.BufferGeometry();
const positions = new Float32Array(1500 * 3);
for (let i = 0; i < 1500 * 3; i++) positions[i] = (Math.random() - 0.5) * 10;
geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const mat = new THREE.PointsMaterial({ color: 0xff00ff, size: 0.05 });
scene.add(new THREE.Points(geom, mat));
```

## webgl-shader — 着色器 / WebGL Shader

自定义 GLSL 片元着色器生成动画。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.1,
    "max": 3,
    "step": 0.1,
    "default": 1
  }
]
```

### HTML

```html
<canvas class="shader"></canvas>
```

### CSS

```css
.shader { width: 100%; height: 100%; }
```

### JS

```javascript
const frag = `precision mediump float; uniform float u_time; uniform vec2 u_resolution; void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0); }`;
```

## canvas-confetti — 五彩纸屑 / Canvas Confetti

撒花庆祝效果。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 30,
    "max": 300,
    "step": 10,
    "default": 120
  }
]
```

### HTML

```html
<canvas class="cv"></canvas>
```

### CSS

```css
.cv { position: absolute; inset: 0; pointer-events: none; }
```

### JS

```javascript
const cv = document.querySelector('.cv'); const ctx = cv.getContext('2d');
const particles = [];
for (let i = 0; i < 120; i++) particles.push({ x: 200, y: 200, vx: (Math.random()-0.5)*8, vy: Math.random()*-12, g: 0.3, c: `hsl(${Math.random()*360} 90% 60%)` });
function tick() { ctx.clearRect(0,0,cv.width,cv.height); particles.forEach(p => { p.vy += p.g; p.x += p.vx; p.y += p.vy; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 6, 6); }); requestAnimationFrame(tick); } tick();
```

## lottie-loader — Lottie 加载 / Lottie Loader

使用 Lottie 动画作为加载器。

难度：2/3。参数：

```json
[
  {
    "kind": "select",
    "key": "style",
    "label": "风格",
    "options": [
      "pulse",
      "orbit",
      "wave"
    ],
    "default": "pulse"
  }
]
```

### HTML

```html
<div class="lottie"></div>
```

### CSS

```css
.lottie { width: 200px; height: 200px; }
```

### JS

```javascript
import lottie from 'lottie-web';
lottie.loadAnimation({ container: document.querySelector('.lottie'), renderer: 'svg', loop: true, autoplay: true, path: '/animation.json' });
```

## morph-svg — SVG 形变 / Morph SVG

SVG path 之间平滑形变。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.4,
    "max": 3,
    "step": 0.1,
    "default": 1.5,
    "unit": "s"
  }
]
```

### HTML

```html
<svg viewBox="0 0 100 100"><path class="p" d="M10 50 Q50 10 90 50 Q50 90 10 50" fill="none" stroke="currentColor" stroke-width="4"/></svg>
```

### CSS

```css
svg { width: 200px; height: 200px; }
```

### JS

```javascript
const p = document.querySelector('.p');
const paths = ['M10 50 Q50 10 90 50 Q50 90 10 50', 'M10 10 L90 10 L90 90 L10 90 Z'];
let i = 0; setInterval(() => { p.setAttribute('d', paths[i++ % 2]); }, 1500);
```

## grid-magnetic — 网格磁吸 / Grid Magnetic

网格中每个点对鼠标有磁吸反应。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "radius",
    "label": "吸引半径",
    "min": 40,
    "max": 200,
    "step": 10,
    "default": 100,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="grid-mag"></div>
```

### CSS

```css
.grid-mag { position: relative; width: 100%; height: 100%; }
.grid-mag .dot { position: absolute; width: 4px; height: 4px; background: currentColor; border-radius: 50%; transition: transform 0.2s; }
```

### JS

```javascript
const el = document.querySelector('.grid-mag');
const dots = [];
for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) { const d = document.createElement('div'); d.className = 'dot'; d.style.left = c * 24 + 'px'; d.style.top = r * 24 + 'px'; el.appendChild(d); dots.push(d); }
el.addEventListener('mousemove', (e) => { dots.forEach(d => { const r = d.getBoundingClientRect(); const dx = e.clientX - (r.left + 2); const dy = e.clientY - (r.top + 2); const dist = Math.hypot(dx, dy); if (dist < 100) d.style.transform = `translate(${dx * 0.3}px, ${dy * 0.3}px)`; else d.style.transform = ''; }); });
```

## sine-wave — 正弦波 / Sine Wave

Canvas 渲染的正弦波。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "frequency",
    "label": "频率",
    "min": 0.005,
    "max": 0.05,
    "step": 0.005,
    "default": 0.02
  },
  {
    "kind": "range",
    "key": "amplitude",
    "label": "振幅",
    "min": 10,
    "max": 80,
    "step": 5,
    "default": 30,
    "unit": "px"
  }
]
```

### HTML

```html
<canvas class="wave"></canvas>
```

### CSS

```css
.wave { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.wave'); const ctx = c.getContext('2d');
let t = 0;
function draw() { ctx.clearRect(0, 0, c.width, c.height); ctx.beginPath();
for (let x = 0; x < c.width; x++) ctx.lineTo(x, c.height/2 + Math.sin(x * 0.02 + t) * 30);
ctx.stroke(); t += 0.05; requestAnimationFrame(draw); } draw();
```

## audio-wave — 音频条 / Audio Wave

模拟音频可视化的跳动条形。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "bars",
    "label": "条数",
    "min": 16,
    "max": 64,
    "step": 4,
    "default": 32
  },
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.05,
    "max": 0.3,
    "step": 0.01,
    "default": 0.12
  }
]
```

### HTML

```html
<div class="audio"></div>
```

### CSS

```css
.audio { display: flex; align-items: center; justify-content: center; gap: 3px; width: 100%; height: 100%; }
.audio .bar { width: 6px; background: linear-gradient(180deg, hsl(280 90% 60%), hsl(200 90% 60%)); border-radius: 3px; }
```

### JS

```javascript
const wrap = document.querySelector('.audio');
const bars = [];
for (let i = 0; i < params.bars; i++) { const b = document.createElement('div'); b.className = 'bar'; wrap.appendChild(b); bars.push(b); }
let t = 0;
function tick() { t += params.speed; bars.forEach((b, i) => { const h = 30 + Math.abs(Math.sin(t + i * 0.4)) * 70; b.style.height = h + '%'; }); requestAnimationFrame(tick); } tick();
```

## fractal-tree — 分形树 / Fractal Tree

递归绘制的分形树动画。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "depth",
    "label": "深度",
    "min": 5,
    "max": 11,
    "step": 1,
    "default": 8
  },
  {
    "kind": "range",
    "key": "angle",
    "label": "分支角度",
    "min": 15,
    "max": 35,
    "step": 1,
    "default": 22,
    "unit": "°"
  }
]
```

### HTML

```html
<canvas class="ftree"></canvas>
```

### CSS

```css
.ftree { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.ftree'); const ctx = c.getContext('2d');
const resize = () => { c.width = c.offsetWidth * 2; c.height = c.offsetHeight * 2; };
resize();
window.addEventListener('resize', resize);
let t = 0;
function branch(x, y, len, ang, d) { if (d <= 0 || len < 2) return; const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.strokeStyle = `hsl(${(10 - d) * 20} 70% 50%)`; ctx.lineWidth = d; ctx.stroke(); branch(x2, y2, len * 0.75, ang - params.angle * Math.PI / 180, d - 1); branch(x2, y2, len * 0.75, ang + params.angle * Math.PI / 180, d - 1); }
let raf = 0;
function draw() { ctx.clearRect(0, 0, c.width, c.height); t += 0.01; ctx.save(); ctx.translate(c.width / 2, c.height); branch(0, 0, 200, -Math.PI / 2 + Math.sin(t) * 0.05, params.depth); ctx.restore(); raf = requestAnimationFrame(draw); }
draw();
return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
```

## noise-flow — 噪声流动 / Noise Flow

基于 value-noise 的 2D 流动场。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.001,
    "max": 0.02,
    "step": 0.001,
    "default": 0.005
  },
  {
    "kind": "range",
    "key": "scale",
    "label": "尺度",
    "min": 0.005,
    "max": 0.05,
    "step": 0.005,
    "default": 0.02
  }
]
```

### HTML

```html
<canvas class="nf"></canvas>
```

### CSS

```css
.nf { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.nf'); const ctx = c.getContext('2d');
const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
resize();
window.addEventListener('resize', resize);
const grad = ctx.createLinearGradient(0, 0, 0, c.height);
grad.addColorStop(0, '#ff00aa'); grad.addColorStop(1, '#00ddff');
function noise(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function smoothNoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy; const a = noise(ix, iy), b = noise(ix + 1, iy), c2 = noise(ix, iy + 1), d = noise(ix + 1, iy + 1); const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v; }
let t = 0; let raf = 0;
function draw() { const img = ctx.createImageData(c.width, c.height); const d = img.data; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const n = smoothNoise(x * params.scale + t, y * params.scale - t); const idx = (y * c.width + x) * 4; const v = Math.floor(n * 255); d[idx] = v < 128 ? 255 - v * 2 : 0; d[idx + 1] = v; d[idx + 2] = 255 - v; d[idx + 3] = 255; } ctx.putImageData(img, 0, 0); t += params.speed * 10; raf = requestAnimationFrame(draw); }
draw();
return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
```

## metaball — 粘性球 / Metaball

模糊叠加形成粘性 metaball 效果。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "球数",
    "min": 3,
    "max": 10,
    "step": 1,
    "default": 6
  },
  {
    "kind": "range",
    "key": "blur",
    "label": "模糊",
    "min": 10,
    "max": 60,
    "step": 2,
    "default": 28,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="mb"></div>
```

### CSS

```css
.mb { position: relative; width: 100%; height: 100%; background: #0a0a1a; }
.mb .ball { position: absolute; border-radius: 50%; filter: blur(var(--blur, 28px)); will-change: transform; }
```

### JS

```javascript
const mb = document.querySelector('.mb');
const balls = [];
for (let i = 0; i < params.count; i++) { const b = document.createElement('div'); b.className = 'ball'; b.style.width = b.style.height = (60 + Math.random() * 40) + 'px'; b.style.background = i % 2 ? 'hsl(280 90% 60%)' : 'hsl(180 90% 55%)'; mb.appendChild(b); balls.push({ el: b, x: 0, y: 0, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 }); }
let raf = 0;
const w = () => mb.offsetWidth, h = () => mb.offsetHeight;
function tick() { balls.forEach(b => { b.x += b.vx; b.y += b.vy; if (b.x < 0 || b.x > w() - 80) b.vx *= -1; if (b.y < 0 || b.y > h() - 80) b.vy *= -1; b.el.style.transform = `translate(${b.x}px, ${b.y}px)`; }); raf = requestAnimationFrame(tick); }
tick();
return () => cancelAnimationFrame(raf);
```

## physics-spring — 弹簧物理 / Spring Physics

弹簧物理仿真,拖动后回弹。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "stiffness",
    "label": "刚度",
    "min": 0.02,
    "max": 0.3,
    "step": 0.01,
    "default": 0.12
  },
  {
    "kind": "range",
    "key": "damping",
    "label": "阻尼",
    "min": 0.7,
    "max": 0.98,
    "step": 0.01,
    "default": 0.88
  }
]
```

### HTML

```html
<div class="spring-zone"><div class="ball-s"></div></div>
```

### CSS

```css
.spring-zone { position: relative; width: 100%; height: 100%; background: #f0f0f0; border-radius: 12px; cursor: grab; overflow: hidden; }
.spring-zone .ball-s { position: absolute; width: 48px; height: 48px; border-radius: 50%; background: radial-gradient(circle, hsl(20 90% 60%), hsl(0 80% 40%)); box-shadow: 0 8px 16px rgba(0,0,0,0.2); top: 50%; left: 50%; transform: translate(-50%, -50%); }
```

### JS

```javascript
const zone = document.querySelector('.spring-zone'); const ball = document.querySelector('.ball-s');
let px = zone.offsetWidth / 2, py = zone.offsetHeight / 2, vx = 0, vy = 0, dragging = false;
let offX = 0, offY = 0;
zone.addEventListener('mousedown', (e) => { dragging = true; const r = ball.getBoundingClientRect(); offX = e.clientX - (r.left + 24); offY = e.clientY - (r.top + 24); });
window.addEventListener('mousemove', (e) => { if (!dragging) return; const r = zone.getBoundingClientRect(); px = e.clientX - r.left - offX; py = e.clientY - r.top - offY; });
window.addEventListener('mouseup', () => dragging = false);
let raf = 0;
const cx = () => zone.offsetWidth / 2, cy = () => zone.offsetHeight / 2;
function tick() { if (!dragging) { const dx = cx() - px, dy = cy() - py; vx += dx * params.stiffness; vy += dy * params.stiffness; vx *= params.damping; vy *= params.damping; px += vx; py += vy; } ball.style.left = (px - 24) + 'px'; ball.style.top = (py - 24) + 'px'; raf = requestAnimationFrame(tick); } tick();
return () => { cancelAnimationFrame(raf); };
```

## trajectory-path — 路径运动 / Trajectory

元素沿 SVG 路径平滑运动。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 2,
    "max": 8,
    "step": 0.2,
    "default": 4,
    "unit": "s"
  }
]
```

### HTML

```html
<svg class="traj" viewBox="0 0 200 100"><path class="p" d="M10,80 C40,10 70,90 100,40 S160,90 190,30" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="2" stroke-dasharray="4 4"/><circle class="dot" r="5" fill="hsl(280 90% 60%)"/></svg>
```

### CSS

```css
.traj { width: 100%; height: 100%; }
```

### JS

```javascript
const path = document.querySelector('.p'); const dot = document.querySelector('.dot');
const len = path.getTotalLength();
let t = 0; let raf = 0;
function tick() { t += 16 / (params.duration * 1000); if (t > 1) t = 0; const p = path.getPointAtLength(t * len); dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); raf = requestAnimationFrame(tick); } tick();
return () => cancelAnimationFrame(raf);
```

## 3d-cube-rotate — 立方体 / 3D Cube

纯 CSS 3D 立方体持续旋转。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 2,
    "max": 10,
    "step": 0.5,
    "default": 5,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="cube-wrap"><div class="cube"><div class="face f1">1</div><div class="face f2">2</div><div class="face f3">3</div><div class="face f4">4</div><div class="face f5">5</div><div class="face f6">6</div></div></div>
```

### CSS

```css
.cube-wrap { perspective: 600px; width: 100px; height: 100px; }
.cube { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; animation: cubeRot var(--duration, 5s) linear infinite; }
.cube .face { position: absolute; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; color: white; background: hsl(280 90% 60%); border: 2px solid white; box-sizing: border-box; opacity: 0.85; }
.cube .f2 { transform: rotateY(180deg); background: hsl(0 90% 60%); }
.cube .f3 { transform: rotateY(90deg) translateZ(50px); background: hsl(60 90% 60%); }
.cube .f4 { transform: rotateY(-90deg) translateZ(50px); background: hsl(120 80% 55%); }
.cube .f5 { transform: rotateX(90deg) translateZ(50px); background: hsl(200 90% 60%); }
.cube .f6 { transform: rotateX(-90deg) translateZ(50px); background: hsl(320 80% 60%); }
.cube .f1 { transform: translateZ(50px); }
@keyframes cubeRot { to { transform: rotateY(360deg) rotateX(360deg); } }
```

### JS

```javascript

```

## matrix-rain — 数字雨 / Matrix Rain

Matrix 风格绿色字符雨。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 1,
    "max": 6,
    "step": 1,
    "default": 3
  },
  {
    "kind": "range",
    "key": "density",
    "label": "密度",
    "min": 0.3,
    "max": 1,
    "step": 0.1,
    "default": 0.7
  }
]
```

### HTML

```html
<canvas class="mr"></canvas>
```

### CSS

```css
.mr { width: 100%; height: 100%; background: #000; }
```

### JS

```javascript
const c = document.querySelector('.mr'); const ctx = c.getContext('2d');
const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
resize();
window.addEventListener('resize', resize);
const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789';
const fontSize = 14;
let cols = Math.floor(c.width / fontSize * params.density);
let drops = new Array(cols).fill(0);
let raf = 0;
function draw() { ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#0f0'; ctx.font = fontSize + 'px monospace'; for (let i = 0; i < drops.length; i++) { const ch = chars[Math.floor(Math.random() * chars.length)]; ctx.fillText(ch, i * fontSize, drops[i] * fontSize); if (drops[i] * fontSize > c.height && Math.random() > 0.975) drops[i] = 0; drops[i] += params.speed / 3; } raf = requestAnimationFrame(draw); }
draw();
return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
```

## ripple-water — 水波涟漪 / Water Ripple

点击产生水波涟漪,实时衰减。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "衰减时长",
    "min": 1,
    "max": 4,
    "step": 0.2,
    "default": 2,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "count",
    "label": "波纹数",
    "min": 2,
    "max": 6,
    "step": 1,
    "default": 3
  }
]
```

### HTML

```html
<div class="water"><span class="hint">CLICK</span></div>
```

### CSS

```css
.water { position: relative; width: 100%; height: 100%; background: hsl(200 80% 50%); border-radius: 12px; cursor: pointer; overflow: hidden; }
.water .hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 24px; letter-spacing: 0.2em; pointer-events: none; }
.water .ring { position: absolute; border-radius: 50%; border: 3px solid white; transform: translate(-50%, -50%); pointer-events: none; }
```

### JS

```javascript
const water = document.querySelector('.water');
water.addEventListener('click', (e) => { const r = water.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; for (let i = 0; i < params.count; i++) { const ring = document.createElement('div'); ring.className = 'ring'; ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.style.width = ring.style.height = '20px'; ring.style.transition = `all ${params.duration}s ease-out ${i * 0.2}s`; water.appendChild(ring); requestAnimationFrame(() => { ring.style.width = ring.style.height = (200 + i * 80) + 'px'; ring.style.opacity = '0'; }); setTimeout(() => ring.remove(), (params.duration + i * 0.2) * 1000 + 200); } });
```

## fluid-distort — 流体畸变 / Fluid Distort

使用 feTurbulence + feDisplacementMap 实现流体畸变。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "amount",
    "label": "畸变强度",
    "min": 0,
    "max": 60,
    "step": 2,
    "default": 24
  },
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0,
    "max": 1,
    "step": 0.05,
    "default": 0.3
  }
]
```

### HTML

```html
<svg width="0" height="0"><filter id="fd"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3"><animate attributeName="baseFrequency" dur="6s" values="0.02;0.04;0.02" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="24" /></filter></svg><div class="fluid">FLUID</div>
```

### CSS

```css
.fluid { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: 900; color: white; background: linear-gradient(135deg, hsl(280 90% 60%), hsl(200 90% 60%)); border-radius: 12px; filter: url(#fd); }
```

### JS

```javascript

```

## particle-fountain — 粒子喷泉 / Particle Fountain

Canvas 粒子从底部喷涌向上,受重力下落。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 30,
    "max": 300,
    "step": 10,
    "default": 120
  }
]
```

### HTML

```html
<canvas class="fountain"></canvas>
```

### CSS

```css
.fountain { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.fountain'); const ctx = c.getContext('2d');
const ps = [];
function spawn() { return { x: c.width/2, y: c.height, vx: (Math.random()-0.5)*4, vy: -Math.random()*10-4, c: `hsl(${Math.random()*360} 90% 60%)`, s: 3+Math.random()*3 }; }
for (let i = 0; i < 120; i++) ps.push(spawn());
function tick() { ctx.fillStyle='rgba(10,10,30,0.2)'; ctx.fillRect(0,0,c.width,c.height); ps.forEach((p,i) => { p.vy += 0.2; p.x += p.vx; p.y += p.vy; if (p.y > c.height) ps[i] = spawn(); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); }); requestAnimationFrame(tick); } tick();
```

## particle-galaxy — 粒子星系 / Particle Galaxy

Three.js 螺旋星系粒子,缓慢自转。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 500,
    "max": 8000,
    "step": 500,
    "default": 3000
  }
]
```

### HTML

```html
<canvas class="galaxy"></canvas>
```

### CSS

```css
.galaxy { width: 100%; height: 100%; }
```

### JS

```javascript
import * as THREE from 'three';
const scene = new THREE.Scene();
const geom = new THREE.BufferGeometry();
const pos = new Float32Array(3000 * 3); const col = new Float32Array(3000 * 3);
for (let i = 0; i < 3000; i++) { const r = Math.random() * 5; const a = i * 0.3; pos[i*3] = Math.cos(a) * r; pos[i*3+1] = (Math.random()-0.5)*0.5; pos[i*3+2] = Math.sin(a) * r; }
geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const mat = new THREE.PointsMaterial({ color: 0xff66ff, size: 0.04 });
scene.add(new THREE.Points(geom, mat));
```

## shader-plasma — 等离子着色器 / Plasma Shader

GLSL 片元着色器生成等离子流动色彩。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.1,
    "max": 3,
    "step": 0.1,
    "default": 1
  }
]
```

### HTML

```html
<canvas class="plasma"></canvas>
```

### CSS

```css
.plasma { width: 100%; height: 100%; }
```

### JS

```javascript
const frag = `precision mediump float; uniform float u_time; uniform vec2 u_resolution; void main() { vec2 uv = gl_FragCoord.xy / u_resolution; float v = sin(uv.x*10.0 + u_time) + sin(uv.y*10.0 + u_time*1.3) + sin((uv.x+uv.y)*8.0); v = v / 3.0; gl_FragColor = vec4(0.5+0.5*sin(v*3.14), 0.5+0.5*sin(v*3.14+2.0), 0.5+0.5*sin(v*3.14+4.0), 1.0); }`;
```

## shader-fireball — 火球着色器 / Fireball Shader

GLSL 着色器生成燃烧火球纹理。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.1,
    "max": 3,
    "step": 0.1,
    "default": 1
  }
]
```

### HTML

```html
<canvas class="fireball"></canvas>
```

### CSS

```css
.fireball { width: 100%; height: 100%; }
```

### JS

```javascript
const frag = `precision mediump float; uniform float u_time; uniform vec2 u_resolution; float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); } void main() { vec2 uv = gl_FragCoord.xy/u_resolution; float n = hash(uv*10.0 + u_time); vec3 col = mix(vec3(1.0,0.8,0.1), vec3(0.8,0.1,0.0), uv.y); gl_FragColor = vec4(col*n*1.5, 1.0); }`;
```

## canvas-snow — 雪花飘落 / Canvas Snow

Canvas 模拟雪花飘落,带风偏移。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "雪花数",
    "min": 30,
    "max": 300,
    "step": 10,
    "default": 100
  }
]
```

### HTML

```html
<canvas class="snow"></canvas>
```

### CSS

```css
.snow { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.snow'); const ctx = c.getContext('2d');
const flakes = [];
for (let i = 0; i < 100; i++) flakes.push({ x: Math.random()*c.width, y: Math.random()*c.height, r: 1+Math.random()*3, s: 0.5+Math.random()*1.5, w: Math.random()*2-1 });
function tick() { ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle = 'white'; flakes.forEach(f => { f.y += f.s; f.x += f.w; if (f.y > c.height) f.y = 0; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }); requestAnimationFrame(tick); } tick();
```

## canvas-fireworks — 烟花 / Canvas Fireworks

Canvas 烟花自动升空爆炸,多彩粒子。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 30,
    "max": 200,
    "step": 10,
    "default": 80
  }
]
```

### HTML

```html
<canvas class="fw"></canvas>
```

### CSS

```css
.fw { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.fw'); const ctx = c.getContext('2d');
let ps = [];
function launch() { const x = Math.random()*c.width; const y = c.height; const hue = Math.random()*360; for (let i = 0; i < 80; i++) { const a = (i/80)*6.28; ps.push({ x, y: c.height*0.4, vx: Math.cos(a)*3, vy: Math.sin(a)*3, c: `hsl(${hue} 90% 60%)`, life: 1 }); } }
setInterval(launch, 1200);
function tick() { ctx.fillStyle='rgba(0,0,20,0.2)'; ctx.fillRect(0,0,c.width,c.height); ps = ps.filter(p => p.life > 0); ps.forEach(p => { p.vy += 0.05; p.x += p.vx; p.y += p.vy; p.life -= 0.015; ctx.fillStyle = p.c; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, 3, 3); }); ctx.globalAlpha = 1; requestAnimationFrame(tick); } tick();
```

## canvas-starfield — 星空 / Canvas Starfield

Canvas 3D 星空穿越,星点向四周飞散。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "星数",
    "min": 100,
    "max": 800,
    "step": 50,
    "default": 300
  }
]
```

### HTML

```html
<canvas class="stars"></canvas>
```

### CSS

```css
.stars { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.stars'); const ctx = c.getContext('2d');
const stars = [];
for (let i = 0; i < 300; i++) stars.push({ x: (Math.random()-0.5)*c.width, y: (Math.random()-0.5)*c.height, z: Math.random()*c.width });
function tick() { ctx.fillStyle='black'; ctx.fillRect(0,0,c.width,c.height); ctx.fillStyle='white'; stars.forEach(s => { s.z -= 4; if (s.z <= 0) s.z = c.width; const k = 128 / s.z; const x = s.x*k + c.width/2; const y = s.y*k + c.height/2; const r = (1 - s.z/c.width) * 2; ctx.fillRect(x, y, r, r); }); requestAnimationFrame(tick); } tick();
```

## canvas-ocean — 海浪 / Canvas Ocean

Canvas 多层正弦叠加模拟海浪起伏。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.01,
    "max": 0.2,
    "step": 0.01,
    "default": 0.05
  }
]
```

### HTML

```html
<canvas class="ocean"></canvas>
```

### CSS

```css
.ocean { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.ocean'); const ctx = c.getContext('2d');
let t = 0;
function wave(y, amp, freq, color) { ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= c.width; x += 4) ctx.lineTo(x, y + Math.sin(x*freq + t)*amp); ctx.lineTo(c.width, c.height); ctx.lineTo(0, c.height); ctx.fillStyle = color; ctx.fill(); }
function tick() { ctx.fillStyle = '#0a1a3a'; ctx.fillRect(0,0,c.width,c.height); wave(c.height*0.5, 16, 0.02, 'hsl(200 80% 40%)'); wave(c.height*0.62, 12, 0.03, 'hsl(210 80% 50%)'); wave(c.height*0.74, 8, 0.04, 'hsl(200 90% 60%)'); t += 0.05; requestAnimationFrame(tick); } tick();
```

## svg-draw-path — 路径绘制 / SVG Path Draw

SVG 路径按 stroke-dashoffset 逐步绘制。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 1,
    "max": 6,
    "step": 0.2,
    "default": 3,
    "unit": "s"
  }
]
```

### HTML

```html
<svg class="svg-draw" viewBox="0 0 200 100"><path class="p" d="M10,80 C40,10 70,90 100,40 S160,90 190,30" fill="none" stroke="hsl(280 90% 60%)" stroke-width="3"/></svg>
```

### CSS

```css
.svg-draw { width: 100%; height: 100%; }
.svg-draw .p { stroke-dasharray: 400; stroke-dashoffset: 400; animation: draw var(--duration, 3s) ease-in-out infinite alternate; }
@keyframes draw { to { stroke-dashoffset: 0; } }
```

### JS

```javascript

```

## svg-dash-animate — 虚线动画 / SVG Dash Animate

SVG 虚线沿路径流动,蚂蚁线效果。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.5,
    "max": 4,
    "step": 0.1,
    "default": 1.5,
    "unit": "s"
  }
]
```

### HTML

```html
<svg class="svg-dash" viewBox="0 0 200 100"><path class="p" d="M10,50 L60,20 L110,80 L160,30 L190,60" fill="none" stroke="hsl(200 90% 55%)" stroke-width="3" stroke-dasharray="8 6"/></svg>
```

### CSS

```css
.svg-dash { width: 100%; height: 100%; }
.svg-dash .p { animation: dash var(--duration, 1.5s) linear infinite; }
@keyframes dash { to { stroke-dashoffset: -28; } }
```

### JS

```javascript

```

## 3d-sphere — 3D 球体 / 3D Sphere

Three.js 线框球体自转,带粒子环绕。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "detail",
    "label": "细分",
    "min": 8,
    "max": 48,
    "step": 2,
    "default": 24
  }
]
```

### HTML

```html
<canvas class="sphere"></canvas>
```

### CSS

```css
.sphere { width: 100%; height: 100%; }
```

### JS

```javascript
import * as THREE from 'three';
const scene = new THREE.Scene();
const geom = new THREE.IcosahedronGeometry(1.5, 2);
const mat = new THREE.MeshBasicMaterial({ color: 0xaa66ff, wireframe: true });
scene.add(new THREE.Mesh(geom, mat));
```

## 3d-torus — 3D 圆环 / 3D Torus

Three.js 圆环持续旋转,带光泽材质。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 2,
    "max": 12,
    "step": 0.5,
    "default": 6,
    "unit": "s"
  }
]
```

### HTML

```html
<canvas class="torus"></canvas>
```

### CSS

```css
.torus { width: 100%; height: 100%; }
```

### JS

```javascript
import * as THREE from 'three';
const scene = new THREE.Scene();
const geom = new THREE.TorusGeometry(1.2, 0.4, 16, 60);
const mat = new THREE.MeshNormalMaterial();
scene.add(new THREE.Mesh(geom, mat));
```

## gsap-timeline — GSAP 时间线 / GSAP Timeline

GSAP 时间线编排多步动画序列。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 1,
    "max": 6,
    "step": 0.2,
    "default": 3,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="gsap-tl"><div class="b b1">1</div><div class="b b2">2</div><div class="b b3">3</div></div>
```

### CSS

```css
.gsap-tl .b { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; }
.gsap-tl .b1 { background: hsl(280 90% 60%); }
.gsap-tl .b2 { background: hsl(200 90% 60%); }
.gsap-tl .b3 { background: hsl(320 90% 60%); }
```

### JS

```javascript
const tl = gsap.timeline({ repeat: -1 });
tl.to('.b1', { x: 60, duration: 1 }).to('.b2', { x: 60, duration: 1 }, '<0.2').to('.b3', { x: 60, duration: 1 }, '<0.2').to('.b', { x: 0, duration: 1 }, '+=0.3');
```

## gsap-stagger — GSAP 错落 / GSAP Stagger

GSAP stagger 让多个元素错落入场。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "stagger",
    "label": "间隔",
    "min": 0.05,
    "max": 0.5,
    "step": 0.05,
    "default": 0.15,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="gsap-st"><div class="item">A</div><div class="item">B</div><div class="item">C</div><div class="item">D</div><div class="item">E</div></div>
```

### CSS

```css
.gsap-st { display: flex; gap: 8px; }
.gsap-st .item { width: 40px; height: 40px; border-radius: 8px; background: linear-gradient(135deg, hsl(280 90% 60%), hsl(200 90% 60%)); color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; }
```

### JS

```javascript
gsap.from('.gsap-st .item', { y: 40, opacity: 0, duration: 0.6, stagger: 0.15, repeat: -1, repeatDelay: 1 });
```

## lottie-checkmark — Lottie 打勾 / Lottie Checkmark

SVG 模拟 Lottie 打勾动画,完成反馈。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.4,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<svg class="check" viewBox="0 0 100 100"><circle class="c" cx="50" cy="50" r="44" fill="none" stroke="hsl(140 80% 50%)" stroke-width="4"/><path class="mark" d="M30 52 L45 66 L72 36" fill="none" stroke="hsl(140 80% 50%)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

### CSS

```css
.check { width: 120px; height: 120px; }
.check .c { stroke-dasharray: 276; stroke-dashoffset: 276; animation: drawC var(--duration, 0.8s) ease-out forwards; }
.check .mark { stroke-dasharray: 60; stroke-dashoffset: 60; animation: drawM var(--duration, 0.8s) ease-out var(--duration, 0.8s) forwards; }
@keyframes drawC { to { stroke-dashoffset: 0; } }
@keyframes drawM { to { stroke-dashoffset: 0; } }
```

### JS

```javascript

```

## physics-gravity — 重力物理 / Gravity Physics

Canvas 多球受重力碰撞弹跳,物理仿真。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "gravity",
    "label": "重力",
    "min": 0.1,
    "max": 1,
    "step": 0.05,
    "default": 0.4
  }
]
```

### HTML

```html
<canvas class="grav"></canvas>
```

### CSS

```css
.grav { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.grav'); const ctx = c.getContext('2d');
const balls = [];
for (let i = 0; i < 8; i++) balls.push({ x: Math.random()*c.width, y: 50, vx: (Math.random()-0.5)*4, vy: 0, r: 12+Math.random()*8, c: `hsl(${Math.random()*360} 90% 60%)` });
function tick() { ctx.clearRect(0,0,c.width,c.height); balls.forEach(b => { b.vy += 0.4; b.x += b.vx; b.y += b.vy; if (b.y + b.r > c.height) { b.y = c.height - b.r; b.vy *= -0.8; } if (b.x < b.r || b.x > c.width - b.r) b.vx *= -1; ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); }); requestAnimationFrame(tick); } tick();
```

## physics-cloth — 布料模拟 / Cloth Sim

Canvas 网格布料模拟,受重力下垂摆动。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "resolution",
    "label": "分辨率",
    "min": 6,
    "max": 16,
    "step": 1,
    "default": 10
  }
]
```

### HTML

```html
<canvas class="cloth"></canvas>
```

### CSS

```css
.cloth { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.cloth'); const ctx = c.getContext('2d');
const cols = 10, rows = 10, gap = 16;
const pts = [];
for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) pts.push({ x: col*gap, y: r*gap, px: col*gap, py: r*gap, pin: r === 0 });
function tick() { ctx.clearRect(0,0,c.width,c.height); pts.forEach(p => { if (p.pin) return; const vx = (p.x - p.px)*0.99, vy = (p.y - p.py)*0.99; p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + 0.3; }); ctx.strokeStyle = 'hsl(280 90% 60%)'; for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) { const p = pts[r*cols+col]; if (col < cols-1) { const q = pts[r*cols+col+1]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } if (r < rows-1) { const q = pts[(r+1)*cols+col]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } } requestAnimationFrame(tick); } tick();
```

## fractal-mandelbrot — 曼德博集合 / Mandelbrot

Canvas 渲染曼德博分形集合,自相似图案。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "iterations",
    "label": "迭代",
    "min": 30,
    "max": 200,
    "step": 10,
    "default": 80
  }
]
```

### HTML

```html
<canvas class="mandel"></canvas>
```

### CSS

```css
.mandel { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.mandel'); const ctx = c.getContext('2d');
const img = ctx.createImageData(c.width, c.height); const d = img.data;
for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) { let x = 0, y = 0, i = 0; const cx = (px - c.width/2)/120 - 0.5, cy = (py - c.height/2)/120; while (x*x + y*y < 4 && i < 80) { const xt = x*x - y*y + cx; y = 2*x*y + cy; x = xt; i++; } const idx = (py*c.width + px)*4; const v = i === 80 ? 0 : (i*8 % 256); d[idx] = v; d[idx+1] = v*0.5; d[idx+2] = 255 - v; d[idx+3] = 255; }
ctx.putImageData(img, 0, 0);
```

## flow-field — 流场粒子 / Flow Field

基于噪声场的粒子流动,有机运动轨迹。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 100,
    "max": 2000,
    "step": 100,
    "default": 600
  }
]
```

### HTML

```html
<canvas class="flow"></canvas>
```

### CSS

```css
.flow { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.flow'); const ctx = c.getContext('2d');
const ps = [];
for (let i = 0; i < 600; i++) ps.push({ x: Math.random()*c.width, y: Math.random()*c.height });
let t = 0;
function noise(x, y) { return Math.sin(x*0.01 + t)*Math.cos(y*0.01 + t*0.7); }
function tick() { ctx.fillStyle='rgba(10,10,30,0.05)'; ctx.fillRect(0,0,c.width,c.height); ctx.fillStyle = 'hsl(280 90% 70%)'; ps.forEach(p => { const a = noise(p.x, p.y) * 6.28; p.x += Math.cos(a)*1.5; p.y += Math.sin(a)*1.5; if (p.x < 0 || p.x > c.width || p.y < 0 || p.y > c.height) { p.x = Math.random()*c.width; p.y = Math.random()*c.height; } ctx.fillRect(p.x, p.y, 1.5, 1.5); }); t += 0.01; requestAnimationFrame(tick); } tick();
```

## voronoi-art — Voronoi 艺术 / Voronoi Art

Canvas 生成 Voronoi 单元艺术图案,彩色拼贴。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "种子数",
    "min": 10,
    "max": 80,
    "step": 5,
    "default": 30
  }
]
```

### HTML

```html
<canvas class="voronoi"></canvas>
```

### CSS

```css
.voronoi { width: 100%; height: 100%; }
```

### JS

```javascript
const c = document.querySelector('.voronoi'); const ctx = c.getContext('2d');
const seeds = [];
for (let i = 0; i < 30; i++) seeds.push({ x: Math.random()*c.width, y: Math.random()*c.height, c: `hsl(${Math.random()*360} 70% 60%)` });
const img = ctx.createImageData(c.width, c.height); const d = img.data;
for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) { let best = 0, bd = Infinity; for (let i = 0; i < seeds.length; i++) { const dx = px - seeds[i].x, dy = py - seeds[i].y; const dist = dx*dx + dy*dy; if (dist < bd) { bd = dist; best = i; } } const idx = (py*c.width + px)*4; const m = seeds[best].c.match(/hsl\((\d+)/); const h = +m[1]; d[idx] = h; d[idx+1] = 150; d[idx+2] = 150; d[idx+3] = 255; }
ctx.putImageData(img, 0, 0);
```
