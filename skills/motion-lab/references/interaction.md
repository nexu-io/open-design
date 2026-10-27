# Motion.Lab · interaction

从固定提交的 data/effects.ts 提取，代码保留原样；是集成起点，不是对所有运行环境的兼容性保证。使用前落实 DOM 作用域、依赖、清理及无障碍。

## magnetic-cursor — 磁吸光标 / Magnetic Cursor

光标靠近元素时元素被吸引。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "strength",
    "label": "强度",
    "min": 0.1,
    "max": 0.8,
    "step": 0.05,
    "default": 0.4
  }
]
```

### HTML

```html
<button class="magnetic">Hover me</button>
```

### CSS

```css
.magnetic { transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
```

### JS

```javascript
const btn = document.querySelector('.magnetic');
btn.addEventListener('mousemove', (e) => {
  const r = btn.getBoundingClientRect();
  const x = (e.clientX - r.left - r.width / 2) * 0.4;
  const y = (e.clientY - r.top - r.height / 2) * 0.4;
  btn.style.transform = `translate(${x}px, ${y}px)`;
});
btn.addEventListener('mouseleave', () => btn.style.transform = '');
```

## three-d-tilt — 3D 倾斜 / 3D Tilt

卡片随鼠标 3D 倾斜。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "max",
    "label": "最大角度",
    "min": 5,
    "max": 30,
    "step": 1,
    "default": 15,
    "unit": "°"
  }
]
```

### HTML

```html
<div class="tilt">TILT</div>
```

### CSS

```css
.tilt { transform-style: preserve-3d; transition: transform 0.2s; }
```

### JS

```javascript
const el = document.querySelector('.tilt');
el.addEventListener('mousemove', (e) => {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.transform = `perspective(600px) rotateY(${x * 30}deg) rotateX(${-y * 30}deg)`;
});
```

## ripple-click — 点击波纹 / Ripple Click

Material Design 风格的点击波纹。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.4,
    "max": 1.5,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  }
]
```

### HTML

```html
<button class="ripple-btn">Click</button>
```

### CSS

```css
.ripple-btn { position: relative; overflow: hidden; }
.ripple-btn .ripple { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.5); animation: ripple var(--duration, 0.6s); }
@keyframes ripple { to { transform: scale(4); opacity: 0; } }
```

### JS

```javascript
document.querySelector('.ripple-btn').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.left = (e.clientX - r.left) + 'px';
  ripple.style.top = (e.clientY - r.top) + 'px';
  ripple.style.width = ripple.style.height = '20px';
  e.currentTarget.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});
```

## parallax-mouse — 鼠标视差 / Parallax Mouse

多层元素按不同深度响应鼠标。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "intensity",
    "label": "强度",
    "min": 5,
    "max": 40,
    "step": 1,
    "default": 20,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="parallax"><div class="layer bg" data-depth="1"></div><div class="layer fg" data-depth="3"></div></div>
```

### CSS

```css
.parallax { position: relative; }
.layer { position: absolute; inset: 0; transition: transform 0.2s; }
```

### JS

```javascript
document.querySelector('.parallax').addEventListener('mousemove', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  e.currentTarget.querySelectorAll('.layer').forEach(l => {
    const d = +l.dataset.depth;
    l.style.transform = `translate(${x * d * 20}px, ${y * d * 20}px)`;
  });
});
```

## blob-cursor — 粘性光标 / Blob Cursor

光标变成一个跟随的彩色 blob。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "size",
    "label": "尺寸",
    "min": 20,
    "max": 80,
    "step": 4,
    "default": 40,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="blob"></div>
```

### CSS

```css
.blob { position: fixed; width: 40px; height: 40px; border-radius: 50%; background: hsl(280 90% 60%); mix-blend-mode: difference; pointer-events: none; transition: transform 0.15s; }
```

### JS

```javascript
const blob = document.querySelector('.blob');
document.addEventListener('mousemove', (e) => {
  blob.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
});
```

## hover-image-distort — 悬停图像畸变 / Hover Distort

悬停时图像被 SVG 滤镜畸变。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "amount",
    "label": "畸变强度",
    "min": 0,
    "max": 0.05,
    "step": 0.005,
    "default": 0.02
  }
]
```

### HTML

```html
<svg width="0" height="0"><filter id="d"><feTurbulence baseFrequency="0.02" numOctaves="2" /><feDisplacementMap in="SourceGraphic" scale="20" /></filter></svg>
<div class="distort">HOVER</div>
```

### CSS

```css
.distort { filter: url(#d); transition: filter 0.3s; }
```

### JS

```javascript

```

## magnetic-button — 磁吸按钮 / Magnetic Button

按钮周围区域吸引按钮位移。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "radius",
    "label": "吸引半径",
    "min": 30,
    "max": 200,
    "step": 10,
    "default": 80,
    "unit": "px"
  }
]
```

### HTML

```html
<button class="mag-btn">PRESS</button>
```

### CSS

```css
.mag-btn { transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
```

### JS

```javascript
const btn = document.querySelector('.mag-btn');
document.addEventListener('mousemove', (e) => {
  const r = btn.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  const dist = Math.hypot(dx, dy);
  if (dist < 80) btn.style.transform = `translate(${dx * 0.3}px, ${dy * 0.3}px)`;
  else btn.style.transform = '';
});
```

## sticky-stack — 堆叠翻页 / Sticky Stack

滚动时卡片堆叠翻页效果。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "卡片数",
    "min": 3,
    "max": 8,
    "step": 1,
    "default": 4
  }
]
```

### HTML

```html
<div class="stack"><div class="card">1</div><div class="card">2</div><div class="card">3</div></div>
```

### CSS

```css
.stack .card { position: sticky; top: 80px; padding: 40px; background: white; border-radius: 16px; margin-bottom: 20px; }
```

### JS

```javascript

```

## drag-scroll — 拖动滚动 / Drag Scroll

横向拖动滚动容器。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "惯性时长",
    "min": 0.2,
    "max": 1.5,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="drag"><div class="drag-inner"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div></div>
```

### CSS

```css
.drag { overflow: hidden; cursor: grab; user-select: none; }
.drag:active { cursor: grabbing; }
.drag-inner { display: flex; gap: 20px; padding: 20px; }
```

### JS

```javascript
const wrap = document.querySelector('.drag');
let isDown = false, startX = 0, scrollLeft = 0;
wrap.addEventListener('mousedown', (e) => { isDown = true; startX = e.pageX; scrollLeft = wrap.scrollLeft; });
window.addEventListener('mouseup', () => isDown = false);
wrap.addEventListener('mousemove', (e) => { if (!isDown) return; e.preventDefault(); wrap.scrollLeft = scrollLeft - (e.pageX - startX); });
```

## color-picker-hover — 随悬停变色 / Color Hover

悬停位置产生彩色光晕。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "size",
    "label": "光晕大小",
    "min": 100,
    "max": 600,
    "step": 20,
    "default": 300,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="color-hover"></div>
```

### CSS

```css
.color-hover { background: radial-gradient(circle at var(--x, 50%) var(--y, 50%), hsl(var(--h, 0) 90% 60%), transparent 50%); }
```

### JS

```javascript
const el = document.querySelector('.color-hover');
el.addEventListener('mousemove', (e) => {
  const r = el.getBoundingClientRect();
  el.style.setProperty('--x', (e.clientX - r.left) + 'px');
  el.style.setProperty('--y', (e.clientY - r.top) + 'px');
  el.style.setProperty('--h', Math.random() * 360);
});
```

## button-press — 按钮按下 / Button Press

鼠标按下时按钮缩放反馈,有手感。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "scale",
    "label": "缩放",
    "min": 0.85,
    "max": 0.98,
    "step": 0.01,
    "default": 0.92
  }
]
```

### HTML

```html
<button class="press">CLICK</button>
```

### CSS

```css
.press { padding: 14px 28px; border: none; background: hsl(280 90% 60%); color: white; font-weight: 700; font-size: 18px; border-radius: 10px; cursor: pointer; transition: transform 0.1s, box-shadow 0.1s; box-shadow: 0 6px 0 hsl(280 90% 35%); }
.press:active { transform: scale(var(--scale, 0.92)) translateY(4px); box-shadow: 0 2px 0 hsl(280 90% 35%); }
```

### JS

```javascript

```

## hover-lift — 悬停上浮 / Hover Lift

hover 时元素上浮并加深阴影。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "lift",
    "label": "上浮",
    "min": 2,
    "max": 20,
    "step": 1,
    "default": 8,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="lift">HOVER ME</div>
```

### CSS

```css
.lift { padding: 24px 32px; background: white; border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease; font-weight: 700; }
.lift:hover { transform: translateY(calc(var(--lift, 8px) * -1)); box-shadow: 0 16px 32px rgba(0,0,0,0.18); }
```

### JS

```javascript

```

## tilt-card-strong — 强倾斜 / Strong Tilt

比 3D Tilt 更夸张的倾斜效果,带光斑。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "max",
    "label": "最大角度",
    "min": 10,
    "max": 45,
    "step": 1,
    "default": 25,
    "unit": "°"
  }
]
```

### HTML

```html
<div class="tilt-s">STRONG TILT</div>
```

### CSS

```css
.tilt-s { width: 240px; height: 160px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, hsl(280 90% 65%), hsl(200 90% 60%)); color: white; font-weight: 900; font-size: 24px; border-radius: 16px; cursor: pointer; transform-style: preserve-3d; transition: transform 0.15s; }
```

### JS

```javascript
const el = document.querySelector('.tilt-s');
el.addEventListener('mousemove', (e) => {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.transform = `perspective(800px) rotateY(${x * params.max * 2}deg) rotateX(${-y * params.max * 2}deg)`;
});
el.addEventListener('mouseleave', () => el.style.transform = '');
```

## spotlight-follow — 跟随聚光 / Spotlight

鼠标位置形成 spotlight 高亮,其余区域变暗。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "size",
    "label": "光圈",
    "min": 100,
    "max": 400,
    "step": 20,
    "default": 220,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="spot"><div class="spot-inner">SPOTLIGHT</div></div>
```

### CSS

```css
.spot { position: relative; width: 100%; height: 100%; background: #111; border-radius: 12px; cursor: crosshair; }
.spot-inner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; font-weight: 900; letter-spacing: 0.1em; }
```

### JS

```javascript
const spot = document.querySelector('.spot');
spot.addEventListener('mousemove', (e) => {
  const r = spot.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  spot.style.background = `radial-gradient(circle ${params.size}px at ${x}px ${y}px, rgba(255,255,255,0.25), #111 70%)`;
});
spot.addEventListener('mouseleave', () => spot.style.background = '#111');
```

## mouse-trail — 鼠标拖尾 / Mouse Trail

鼠标移动时留下一串彩色粒子拖尾。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 6,
    "max": 30,
    "step": 1,
    "default": 12
  },
  {
    "kind": "range",
    "key": "size",
    "label": "尺寸",
    "min": 4,
    "max": 16,
    "step": 1,
    "default": 8,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="trail-zone"></div>
```

### CSS

```css
.trail-zone { position: relative; width: 100%; height: 100%; cursor: crosshair; }
.trail-dot { position: absolute; border-radius: 50%; pointer-events: none; }
```

### JS

```javascript
const zone = document.querySelector('.trail-zone');
let dots = [];
for (let i = 0; i < params.count; i++) { const d = document.createElement('div'); d.className = 'trail-dot'; d.style.width = d.style.height = params.size + 'px'; d.style.background = `hsl(${i * 30} 90% 60%)`; zone.appendChild(d); dots.push(d); }
let history = [];
zone.addEventListener('mousemove', (e) => { const r = zone.getBoundingClientRect(); history.unshift({ x: e.clientX - r.left, y: e.clientY - r.top }); if (history.length > params.count) history.pop(); dots.forEach((d, i) => { const p = history[i] || history[history.length - 1]; if (!p) return; d.style.left = (p.x - params.size/2) + 'px'; d.style.top = (p.y - params.size/2) + 'px'; d.style.opacity = String(1 - i / params.count); }); });
```

## click-burst — 点击爆开 / Click Burst

点击位置爆开一圈彩色粒子。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "粒子数",
    "min": 8,
    "max": 40,
    "step": 2,
    "default": 20
  }
]
```

### HTML

```html
<div class="burst">CLICK ANYWHERE</div>
```

### CSS

```css
.burst { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #222; color: white; font-weight: 700; border-radius: 12px; cursor: pointer; }
```

### JS

```javascript
const burst = document.querySelector('.burst');
burst.addEventListener('click', (e) => {
  const r = burst.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  for (let i = 0; i < params.count; i++) {
    const p = document.createElement('span');
    const ang = (i / params.count) * Math.PI * 2;
    const dist = 40 + Math.random() * 30;
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:8px;height:8px;border-radius:50%;background:hsl(${Math.random()*360} 90% 60%);transition:all 0.6s cubic-bezier(0.2,0.8,0.2,1);`;
    burst.appendChild(p);
    requestAnimationFrame(() => { p.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(0)`; p.style.opacity = '0'; });
    setTimeout(() => p.remove(), 700);
  }
});
```

## hover-icon-spin — 悬停旋转 / Icon Spin

hover 时图标旋转一周。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 1.5,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  }
]
```

### HTML

```html
<button class="spin-icon"><span>⚙</span></button>
```

### CSS

```css
.spin-icon { padding: 12px 16px; border: 2px solid currentColor; background: transparent; border-radius: 10px; cursor: pointer; font-size: 18px; color: inherit; }
.spin-icon span { display: inline-block; transition: transform var(--duration, 0.6s) ease; }
.spin-icon:hover span { transform: rotate(360deg); }
```

### JS

```javascript

```

## toggle-flip — 滑动开关 / Toggle Flip

可点击切换的左右滑动 toggle。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "滑动时长",
    "min": 0.2,
    "max": 0.8,
    "step": 0.05,
    "default": 0.35,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="toggle" data-on="false"><div class="knob"></div></div>
```

### CSS

```css
.toggle { position: relative; width: 64px; height: 32px; background: #ccc; border-radius: 999px; cursor: pointer; transition: background var(--duration, 0.35s); }
.toggle .knob { position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; background: white; border-radius: 50%; transition: transform var(--duration, 0.35s) cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.toggle.on { background: hsl(140 80% 50%); }
.toggle.on .knob { transform: translateX(32px); }
```

### JS

```javascript
const tg = document.querySelector('.toggle');
tg.addEventListener('click', () => { const on = tg.classList.toggle('on'); tg.dataset.on = String(on); });
```

## accordion-smooth — 手风琴 / Accordion

点击展开/收起内容,平滑过渡。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 1,
    "step": 0.05,
    "default": 0.4,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="acc"><button class="acc-h">Q: 什么是动效？</button><div class="acc-b"><p>动效是界面元素的运动,引导注意力,增强反馈。</p></div></div>
```

### CSS

```css
.acc { width: 280px; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.acc-h { width: 100%; padding: 14px 18px; background: hsl(280 90% 60%); color: white; border: none; text-align: left; font-weight: 700; cursor: pointer; font-size: 15px; }
.acc-b { max-height: 0; overflow: hidden; transition: max-height var(--duration, 0.4s) ease; }
.acc-b p { padding: 14px 18px; margin: 0; font-size: 14px; line-height: 1.6; color: #444; }
```

### JS

```javascript
const h = document.querySelector('.acc-h'); const b = document.querySelector('.acc-b');
h.addEventListener('click', () => { if (b.style.maxHeight) { b.style.maxHeight = null; } else { b.style.maxHeight = b.scrollHeight + 'px'; } });
```

## range-drag — 滑块拖动 / Range Drag

可拖动的圆形滑块,显示当前值。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "max",
    "label": "最大值",
    "min": 50,
    "max": 500,
    "step": 10,
    "default": 200
  }
]
```

### HTML

```html
<div class="range"><div class="track"><div class="fill"></div><div class="knob"></div></div><div class="val">0</div></div>
```

### CSS

```css
.range { padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; width: 240px; }
.range .track { position: relative; width: 200px; height: 6px; background: rgba(0,0,0,0.1); border-radius: 999px; cursor: pointer; }
.range .fill { position: absolute; left: 0; top: 0; height: 100%; background: hsl(280 90% 60%); border-radius: 999px; width: 50%; }
.range .knob { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 20px; height: 20px; background: white; border: 3px solid hsl(280 90% 60%); border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.2); cursor: grab; }
.range .val { font-size: 24px; font-weight: 900; font-variant-numeric: tabular-nums; }
```

### JS

```javascript
const track = document.querySelector('.track'); const fill = document.querySelector('.fill'); const knob = document.querySelector('.knob'); const val = document.querySelector('.val');
let dragging = false;
const update = (clientX) => { const r = track.getBoundingClientRect(); let pct = (clientX - r.left) / r.width; pct = Math.max(0, Math.min(1, pct)); fill.style.width = (pct * 100) + '%'; knob.style.left = (pct * 100) + '%'; val.textContent = Math.round(pct * params.max); };
track.addEventListener('mousedown', (e) => { dragging = true; update(e.clientX); });
window.addEventListener('mousemove', (e) => { if (dragging) update(e.clientX); });
window.addEventListener('mouseup', () => dragging = false);
```

## hover-scale — 悬停缩放 / Hover Scale

鼠标悬停时元素放大,平滑过渡。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "scale",
    "label": "缩放",
    "min": 1.05,
    "max": 1.6,
    "step": 0.05,
    "default": 1.15
  }
]
```

### HTML

```html
<div class="hover-scale">HOVER</div>
```

### CSS

```css
.hover-scale { transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); cursor: pointer; }
.hover-scale:hover { transform: scale(var(--scale, 1.15)); }
```

### JS

```javascript

```

## hover-rotate — 悬停旋转 / Hover Rotate

鼠标悬停时元素旋转,带过渡。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "angle",
    "label": "角度",
    "min": 5,
    "max": 180,
    "step": 5,
    "default": 30,
    "unit": "°"
  }
]
```

### HTML

```html
<div class="hover-rotate">ROTATE</div>
```

### CSS

```css
.hover-rotate { transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); cursor: pointer; }
.hover-rotate:hover { transform: rotate(var(--angle, 30deg)); }
```

### JS

```javascript

```

## hover-skew — 悬停倾斜 / Hover Skew

鼠标悬停时元素倾斜变形,动感。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "angle",
    "label": "角度",
    "min": 5,
    "max": 30,
    "step": 1,
    "default": 15,
    "unit": "°"
  }
]
```

### HTML

```html
<div class="hover-skew">SKEW</div>
```

### CSS

```css
.hover-skew { transition: transform 0.3s ease; cursor: pointer; }
.hover-skew:hover { transform: skewX(calc(var(--angle, 15deg) * -1)); }
```

### JS

```javascript

```

## hover-blur — 悬停模糊 / Hover Blur

悬停时背景模糊,聚焦前景元素。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "blur",
    "label": "模糊",
    "min": 2,
    "max": 16,
    "step": 1,
    "default": 6,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="hover-blur"><div class="bg"></div><div class="fg">FOCUS</div></div>
```

### CSS

```css
.hover-blur { position: relative; cursor: pointer; }
.hover-blur .bg { transition: filter 0.3s; }
.hover-blur:hover .bg { filter: blur(var(--blur, 6px)); }
```

### JS

```javascript

```

## hover-color-change — 悬停变色 / Hover Color

悬停时元素背景色平滑过渡。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.1,
    "max": 1,
    "step": 0.05,
    "default": 0.3,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="hover-color">CHANGE</div>
```

### CSS

```css
.hover-color { background: hsl(280 90% 60%); transition: background var(--duration, 0.3s) ease, transform var(--duration, 0.3s) ease; cursor: pointer; }
.hover-color:hover { background: hsl(200 90% 55%); transform: translateY(-2px); }
```

### JS

```javascript

```

## hover-border-expand — 边框扩展 / Border Expand

悬停时边框从中心向四周扩展。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 1,
    "step": 0.05,
    "default": 0.4,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="border-expand">EXPAND</div>
```

### CSS

```css
.border-expand { position: relative; cursor: pointer; }
.border-expand::before { content: ""; position: absolute; inset: 50% 50%; border: 2px solid hsl(280 90% 60%); border-radius: 12px; transition: inset var(--duration, 0.4s) cubic-bezier(0.2, 0.8, 0.2, 1); }
.border-expand:hover::before { inset: 0; }
```

### JS

```javascript

```

## hover-text-reveal — 文字揭示 / Text Reveal

悬停时隐藏文字从下方滑入揭示。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 1,
    "step": 0.05,
    "default": 0.4,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="text-reveal"><span class="label">HOVER</span><span class="hidden">REVEALED</span></div>
```

### CSS

```css
.text-reveal { position: relative; overflow: hidden; cursor: pointer; }
.text-reveal .hidden { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transform: translateY(100%); transition: transform var(--duration, 0.4s) cubic-bezier(0.2, 0.8, 0.2, 1); }
.text-reveal:hover .hidden { transform: translateY(0); }
```

### JS

```javascript

```

## hover-image-zoom — 图片放大 / Image Zoom

悬停时图片平滑放大,带遮罩。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "scale",
    "label": "缩放",
    "min": 1.1,
    "max": 2,
    "step": 0.05,
    "default": 1.3
  }
]
```

### HTML

```html
<div class="img-zoom"><div class="img"></div></div>
```

### CSS

```css
.img-zoom { overflow: hidden; cursor: pointer; }
.img-zoom .img { width: 100%; height: 100%; background: linear-gradient(135deg, hsl(280 90% 60%), hsl(200 90% 60%)); transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
.img-zoom:hover .img { transform: scale(var(--scale, 1.3)); }
```

### JS

```javascript

```

## hover-flip-card — 翻转卡片 / Flip Card

悬停时卡片 3D 翻转,正反切换。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 1.2,
    "step": 0.05,
    "default": 0.6,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="flip-card"><div class="flip-inner"><div class="front">FRONT</div><div class="back">BACK</div></div></div>
```

### CSS

```css
.flip-card { perspective: 800px; cursor: pointer; }
.flip-inner { position: relative; transform-style: preserve-3d; transition: transform var(--duration, 0.6s); }
.flip-card:hover .flip-inner { transform: rotateY(180deg); }
.flip-card .front, .flip-card .back { position: absolute; inset: 0; backface-visibility: hidden; display: flex; align-items: center; justify-content: center; }
.flip-card .back { transform: rotateY(180deg); }
```

### JS

```javascript

```

## hover-glow — 悬停发光 / Hover Glow

悬停时元素周围发光晕,聚焦感。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "intensity",
    "label": "强度",
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
<div class="hover-glow">GLOW</div>
```

### CSS

```css
.hover-glow { transition: box-shadow 0.3s ease, transform 0.3s ease; cursor: pointer; }
.hover-glow:hover { box-shadow: 0 0 var(--intensity, 28px) hsl(280 90% 60%); transform: translateY(-2px); }
```

### JS

```javascript

```

## click-ripple-material — Material 波纹 / Material Ripple

Material Design 风格点击波纹扩散。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.4,
    "max": 1.2,
    "step": 0.05,
    "default": 0.6,
    "unit": "s"
  }
]
```

### HTML

```html
<button class="mat-ripple">CLICK</button>
```

### CSS

```css
.mat-ripple { position: relative; overflow: hidden; cursor: pointer; }
.mat-ripple .r { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.5); transform: translate(-50%, -50%) scale(0); animation: matRipple var(--duration, 0.6s) ease-out forwards; pointer-events: none; }
@keyframes matRipple { to { transform: translate(-50%, -50%) scale(10); opacity: 0; } }
```

### JS

```javascript
const btn = document.querySelector('.mat-ripple');
btn.addEventListener('click', (e) => { const r = btn.getBoundingClientRect(); const rip = document.createElement('span'); rip.className = 'r'; rip.style.left = (e.clientX - r.left) + 'px'; rip.style.top = (e.clientY - r.top) + 'px'; rip.style.width = rip.style.height = '20px'; btn.appendChild(rip); setTimeout(() => rip.remove(), 600); });
```

## click-shockwave — 点击冲击波 / Shockwave

点击产生扩散冲击波环,强烈反馈。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.4,
    "max": 1.5,
    "step": 0.05,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="shockwave">CLICK</div>
```

### CSS

```css
.shockwave { position: relative; cursor: pointer; }
.shockwave .wave { position: absolute; border: 3px solid hsl(280 90% 60%); border-radius: 50%; transform: translate(-50%, -50%) scale(0); animation: shock var(--duration, 0.8s) ease-out forwards; pointer-events: none; }
@keyframes shock { to { transform: translate(-50%, -50%) scale(8); opacity: 0; border-width: 1px; } }
```

### JS

```javascript
const el = document.querySelector('.shockwave');
el.addEventListener('click', (e) => { const r = el.getBoundingClientRect(); const w = document.createElement('span'); w.className = 'wave'; w.style.left = (e.clientX - r.left) + 'px'; w.style.top = (e.clientY - r.top) + 'px'; w.style.width = w.style.height = '20px'; el.appendChild(w); setTimeout(() => w.remove(), 800); });
```

## click-emoji-burst — Emoji 爆开 / Emoji Burst

点击位置爆开一圈 emoji,趣味反馈。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "count",
    "label": "数量",
    "min": 6,
    "max": 24,
    "step": 1,
    "default": 12
  }
]
```

### HTML

```html
<div class="emoji-burst">CLICK</div>
```

### CSS

```css
.emoji-burst { position: relative; cursor: pointer; }
.emoji-burst .e { position: absolute; font-size: 24px; pointer-events: none; transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.7s; }
```

### JS

```javascript
const el = document.querySelector('.emoji-burst');
const emojis = ['🎉','✨','⭐','💫','🌟','🎊'];
el.addEventListener('click', (e) => { const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; for (let i = 0; i < 12; i++) { const s = document.createElement('span'); s.className = 'e'; s.textContent = emojis[i % emojis.length]; s.style.left = x + 'px'; s.style.top = y + 'px'; el.appendChild(s); const ang = (i / 12) * Math.PI * 2; const dist = 50 + Math.random() * 30; requestAnimationFrame(() => { s.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(0)`; s.style.opacity = '0'; }); setTimeout(() => s.remove(), 750); } });
```

## drag-to-reveal — 拖动揭示 / Drag Reveal

拖动遮罩揭示下方内容,刮刮卡感。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "过渡",
    "min": 0.1,
    "max": 0.6,
    "step": 0.05,
    "default": 0.2,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="drag-reveal"><div class="cover">DRAG ME</div><div class="under">REVEALED</div></div>
```

### CSS

```css
.drag-reveal { position: relative; cursor: ew-resize; user-select: none; }
.drag-reveal .under { display: flex; align-items: center; justify-content: center; }
.drag-reveal .cover { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transition: clip-path var(--duration, 0.2s); clip-path: inset(0 0 0 0); }
```

### JS

```javascript
const el = document.querySelector('.drag-reveal'); const cover = el.querySelector('.cover');
let dragging = false, startX = 0, startPct = 0;
const pct = () => { const m = cover.style.clipPath.match(/inset\(0 (\d+)%/); return m ? +m[1] : 0; };
el.addEventListener('mousedown', (e) => { dragging = true; startX = e.clientX; startPct = pct(); });
window.addEventListener('mousemove', (e) => { if (!dragging) return; const w = el.offsetWidth; let p = startPct + ((e.clientX - startX) / w) * 100; p = Math.max(0, Math.min(100, p)); cover.style.clipPath = `inset(0 ${p}% 0 0)`; });
window.addEventListener('mouseup', () => dragging = false);
```

## drag-rotate — 拖动旋转 / Drag Rotate

拖动元素使其 3D 旋转,可交互探索。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "sensitivity",
    "label": "灵敏度",
    "min": 0.2,
    "max": 2,
    "step": 0.1,
    "default": 0.6
  }
]
```

### HTML

```html
<div class="drag-rotate">DRAG</div>
```

### CSS

```css
.drag-rotate { transform-style: preserve-3d; cursor: grab; user-select: none; }
.drag-rotate:active { cursor: grabbing; }
```

### JS

```javascript
const el = document.querySelector('.drag-rotate');
let rx = -20, ry = 20, dragging = false, lx = 0, ly = 0;
el.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('mousemove', (e) => { if (!dragging) return; ry += (e.clientX - lx) * 0.6; rx -= (e.clientY - ly) * 0.6; lx = e.clientX; ly = e.clientY; el.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg)`; });
window.addEventListener('mouseup', () => dragging = false);
```

## scroll-progress — 滚动进度 / Scroll Progress

页面滚动进度条,顶部高亮显示。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "height",
    "label": "高度",
    "min": 2,
    "max": 10,
    "step": 1,
    "default": 4,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="scroll-progress"><div class="bar"></div></div>
```

### CSS

```css
.scroll-progress { position: fixed; top: 0; left: 0; right: 0; height: 4px; background: rgba(0,0,0,0.1); z-index: 100; }
.scroll-progress .bar { height: 100%; width: 0; background: linear-gradient(90deg, hsl(280 90% 60%), hsl(200 90% 60%)); transition: width 0.1s; }
```

### JS

```javascript
const bar = document.querySelector('.scroll-progress .bar');
window.addEventListener('scroll', () => { const h = document.documentElement; const p = h.scrollTop / (h.scrollHeight - h.clientHeight); bar.style.width = (p * 100) + '%'; });
```

## scroll-reveal — 滚动揭示 / Scroll Reveal

元素进入视口时上滑淡入,常见落地页效果。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "distance",
    "label": "位移",
    "min": 10,
    "max": 100,
    "step": 5,
    "default": 40,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="scroll-reveal">REVEAL ON SCROLL</div>
```

### CSS

```css
.scroll-reveal { opacity: 0; transform: translateY(40px); transition: opacity 0.6s, transform 0.6s; }
.scroll-reveal.in { opacity: 1; transform: translateY(0); }
```

### JS

```javascript
const el = document.querySelector('.scroll-reveal');
const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) el.classList.add('in'); }), { threshold: 0.2 });
io.observe(el);
```

## scroll-parallax — 滚动视差 / Scroll Parallax

多层元素按不同速度响应滚动,纵深感。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.1,
    "max": 0.8,
    "step": 0.05,
    "default": 0.3
  }
]
```

### HTML

```html
<div class="scroll-parallax"><div class="layer" data-d="0.3">BACK</div><div class="layer" data-d="0.6">MID</div><div class="layer" data-d="1">FRONT</div></div>
```

### CSS

```css
.scroll-parallax { position: relative; }
.scroll-parallax .layer { transition: transform 0.1s; }
```

### JS

```javascript
const wrap = document.querySelector('.scroll-parallax');
window.addEventListener('scroll', () => { const r = wrap.getBoundingClientRect(); const y = r.top; wrap.querySelectorAll('.layer').forEach(l => { const d = +l.dataset.d; l.style.transform = `translateY(${y * d * 0.3}px)`; }); });
```

## hover-magnetic-text — 磁吸文字 / Magnetic Text

文字字符被光标磁吸,逐字位移。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "strength",
    "label": "强度",
    "min": 0.1,
    "max": 0.8,
    "step": 0.05,
    "default": 0.35
  }
]
```

### HTML

```html
<h1 class="mag-text">MAGNETIC</h1>
```

### CSS

```css
.mag-text span { display: inline-block; transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
```

### JS

```javascript
const el = document.querySelector('.mag-text');
[...el.textContent].forEach(c => { const s = document.createElement('span'); s.textContent = c; c.replaceWith(s); });
el.addEventListener('mousemove', (e) => { el.querySelectorAll('span').forEach(s => { const r = s.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy); if (d < 100) s.style.transform = `translate(${dx * 0.35}px, ${dy * 0.35}px)`; else s.style.transform = ''; }); });
```

## hover-follow-cursor — 跟随光标 / Follow Cursor

元素平滑跟随光标移动,带惯性。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.02,
    "max": 0.3,
    "step": 0.02,
    "default": 0.1
  }
]
```

### HTML

```html
<div class="follow-zone"><div class="dot"></div></div>
```

### CSS

```css
.follow-zone { position: relative; cursor: none; }
.follow-zone .dot { position: absolute; width: 24px; height: 24px; border-radius: 50%; background: hsl(280 90% 60%); pointer-events: none; transform: translate(-50%, -50%); }
```

### JS

```javascript
const zone = document.querySelector('.follow-zone'); const dot = zone.querySelector('.dot');
let tx = 0, ty = 0, x = 0, y = 0;
zone.addEventListener('mousemove', (e) => { const r = zone.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; });
function tick() { x += (tx - x) * 0.1; y += (ty - y) * 0.1; dot.style.left = x + 'px'; dot.style.top = y + 'px'; requestAnimationFrame(tick); } tick();
```
