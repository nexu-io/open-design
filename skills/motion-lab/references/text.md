# Motion.Lab · text

从固定提交的 data/effects.ts 提取，代码保留原样；是集成起点，不是对所有运行环境的兼容性保证。使用前落实 DOM 作用域、依赖、清理及无障碍。

## typewriter — 打字机 / Typewriter

字符逐个出现,模拟键盘输入。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 20,
    "max": 200,
    "step": 10,
    "default": 80,
    "unit": "ms"
  }
]
```

### HTML

```html
<div id="typewriter"></div>
```

### CSS

```css
#typewriter { font-family: monospace; border-right: 2px solid currentColor; padding-right: 4px; animation: caret 0.8s step-end infinite; }
@keyframes caret { 50% { border-color: transparent; } }
```

### JS

```javascript
const el = document.getElementById('typewriter');
const text = 'Hello, Motion.Lab!';
let i = 0;
setInterval(() => { el.textContent = text.slice(0, i++ % (text.length + 1)); }, 80);
```

## wave-text — 波浪文字 / Wave Text

每个字符上下波动形成波浪。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.8,
    "max": 3,
    "step": 0.1,
    "default": 1.6,
    "unit": "s"
  }
]
```

### HTML

```html
<span class="wave-text">WAVE</span>
```

### CSS

```css
.wave-text span { display: inline-block; animation: wave var(--duration, 1.6s) ease-in-out infinite; }
.wave-text span:nth-child(n) { animation-delay: calc(0.1s * n); }
@keyframes wave { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
```

### JS

```javascript
document.querySelectorAll('.wave-text').forEach(el => el.innerHTML = [...el.textContent].map(c => `<span>${c}</span>`).join(''));
```

## mask-reveal — 遮罩揭示 / Mask Reveal

文字从遮罩下方揭示,常用于 hero 标题。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.4,
    "max": 2.5,
    "step": 0.1,
    "default": 1.2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="mask-reveal">MOTION</h1>
```

### CSS

```css
.mask-reveal { clip-path: inset(0 0 100% 0); animation: reveal var(--duration, 1.2s) cubic-bezier(0.65, 0, 0.35, 1) forwards; }
@keyframes reveal { to { clip-path: inset(0 0 0 0); } }
```

### JS

```javascript

```

## split-char — 字符分裂 / Split Character

每个字符从上下分开再合拢。

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
<h1 class="split-char">SPLIT</h1>
```

### CSS

```css
.split-char span { display: inline-block; animation: split var(--duration, 0.8s) ease-out both; }
.split-char span:nth-child(odd) { animation-name: splitTop; }
.split-char span:nth-child(even) { animation-name: splitBot; }
@keyframes splitTop { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@keyframes splitBot { from { transform: translateY(100%); } to { transform: translateY(0); } }
```

### JS

```javascript
[...document.querySelector('.split-char').textContent].forEach(c => { const s = document.createElement('span'); s.textContent = c; c.replaceWith(s); });
```

## gradient-text — 渐变文字 / Gradient Text

文字使用 HSL 渐变背景 + 循环动画。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 2,
    "max": 10,
    "step": 0.5,
    "default": 4,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="gradient-text">COLOR</h1>
```

### CSS

```css
.gradient-text { background: linear-gradient(90deg, hsl(0 90% 60%), hsl(120 90% 60%), hsl(240 90% 60%)); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: hue var(--duration, 4s) linear infinite; }
@keyframes hue { to { background-position: 200% 0; } }
```

### JS

```javascript

```

## glitch-text — 故障文字 / Glitch Text

RGB 分离故障效果,赛博朋克风。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 5,
    "step": 0.1,
    "default": 2.5,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="glitch" data-text="GLITCH">GLITCH</h1>
```

### CSS

```css
.glitch { position: relative; }
.glitch::before, .glitch::after { content: attr(data-text); position: absolute; inset: 0; }
.glitch::before { color: cyan; animation: glitchA var(--duration, 2.5s) infinite; }
.glitch::after { color: magenta; animation: glitchB var(--duration, 2.5s) infinite; }
@keyframes glitchA { 0%, 100% { transform: translate(0); } 20% { transform: translate(-2px, 2px); } 40% { transform: translate(2px, -1px); } }
@keyframes glitchB { 0%, 100% { transform: translate(0); } 20% { transform: translate(2px, -1px); } 40% { transform: translate(-1px, 2px); } }
```

### JS

```javascript

```

## scramble — 乱码解码 / Scramble

文字先以乱码出现,逐渐解码为目标文字。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.5,
    "max": 3,
    "step": 0.1,
    "default": 1.5,
    "unit": "s"
  }
]
```

### HTML

```html
<span id="scramble"></span>
```

### CSS

```css
#scramble { font-family: monospace; }
```

### JS

```javascript
const el = document.getElementById('scramble');
const target = 'SCRAMBLE';
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%';
let frame = 0;
const interval = setInterval(() => {
  el.textContent = target.split('').map((c, i) => i < frame / 3 ? c : chars[Math.floor(Math.random() * chars.length)]).join('');
  if (frame++ > target.length * 3) clearInterval(interval);
}, 50);
```

## count-up — 数字滚动 / Count Up

数字从 0 滚动到目标值。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "target",
    "label": "目标值",
    "min": 10,
    "max": 9999,
    "step": 1,
    "default": 1234
  }
]
```

### HTML

```html
<span id="count-up">0</span>
```

### CSS

```css
#count-up { font-variant-numeric: tabular-nums; font-weight: 900; font-size: 48px; }
```

### JS

```javascript
const el = document.getElementById('count-up');
const target = 1234;
const duration = 1500;
const start = performance.now();
const tick = (now) => {
  const t = Math.min(1, (now - start) / duration);
  el.textContent = Math.floor(target * (1 - Math.pow(1 - t, 3)));
  if (t < 1) requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
```

## stagger-fade — 错落淡入 / Stagger Fade

多个文字依次淡入,带 stagger 延迟。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "单项时长",
    "min": 0.2,
    "max": 1.5,
    "step": 0.1,
    "default": 0.5,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "stagger",
    "label": "间隔",
    "min": 0.05,
    "max": 0.5,
    "step": 0.05,
    "default": 0.1,
    "unit": "s"
  }
]
```

### HTML

```html
<ul class="stagger"><li>一</li><li>二</li><li>三</li><li>四</li></ul>
```

### CSS

```css
.stagger li { opacity: 0; animation: fadeIn var(--duration, 0.5s) ease-out forwards; }
.stagger li:nth-child(1) { animation-delay: 0s; }
.stagger li:nth-child(2) { animation-delay: var(--stagger, 0.1s); }
.stagger li:nth-child(3) { animation-delay: calc(var(--stagger, 0.1s) * 2); }
.stagger li:nth-child(4) { animation-delay: calc(var(--stagger, 0.1s) * 3); }
@keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
```

### JS

```javascript

```

## vertical-marquee — 垂直跑马灯 / Vertical Marquee

文字从下往上垂直滚动。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 5,
    "max": 30,
    "step": 1,
    "default": 15,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="vmarquee"><div>设计 · 设计 · 设计 · 设计</div><div>设计 · 设计 · 设计 · 设计</div></div>
```

### CSS

```css
.vmarquee { height: 60px; overflow: hidden; }
.vmarquee > div { animation: vm var(--duration, 15s) linear infinite; }
@keyframes vm { from { transform: translateY(0); } to { transform: translateY(-100%); } }
```

### JS

```javascript

```

## text-shadow-shift — 阴影偏移 / Shadow Shift

文字阴影循环偏移,产生霓虹闪烁感。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 4,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "intensity",
    "label": "强度",
    "min": 2,
    "max": 12,
    "step": 1,
    "default": 6,
    "unit": "px"
  }
]
```

### HTML

```html
<h1 class="tss">SHADOW</h1>
```

### CSS

```css
.tss { font-size: 36px; font-weight: 900; color: white; text-shadow: var(--intensity, 6px) 0 hsl(320 90% 60%); animation: tss var(--duration, 2s) ease-in-out infinite alternate; }
@keyframes tss { from { text-shadow: var(--intensity, 6px) 0 hsl(320 90% 60%); } to { text-shadow: calc(var(--intensity, 6px) * -1) 0 hsl(180 90% 60%); } }
```

### JS

```javascript

```

## text-3d — 3D 文字 / 3D Text

多层文字堆叠形成 3D 立体透视效果。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "layers",
    "label": "层数",
    "min": 3,
    "max": 12,
    "step": 1,
    "default": 6
  },
  {
    "kind": "range",
    "key": "depth",
    "label": "深度",
    "min": 1,
    "max": 4,
    "step": 1,
    "default": 2,
    "unit": "px"
  }
]
```

### HTML

```html
<h1 class="t3d" data-text="3D">3D</h1>
```

### CSS

```css
.t3d { position: relative; font-size: 56px; font-weight: 900; color: white; }
.t3d::before, .t3d::after { content: attr(data-text); position: absolute; inset: 0; }
.t3d::before { color: hsl(320 90% 60%); transform: translate(var(--depth, 2px), var(--depth, 2px)); }
.t3d::after { color: hsl(200 90% 60%); transform: translate(calc(var(--depth, 2px) * -1), calc(var(--depth, 2px) * -1)); }
```

### JS

```javascript

```

## text-rotate-in — 字符旋转 / Char Rotate

每个字符依次旋转入场,强调感强。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "单项时长",
    "min": 0.3,
    "max": 1.2,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "stagger",
    "label": "间隔",
    "min": 0.05,
    "max": 0.4,
    "step": 0.05,
    "default": 0.1,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="tri">ROTATE</h1>
```

### CSS

```css
.tri span { display: inline-block; opacity: 0; animation: tri var(--duration, 0.6s) ease-out forwards; }
.tri span:nth-child(1) { animation-delay: 0s; }
.tri span:nth-child(2) { animation-delay: var(--stagger, 0.1s); }
.tri span:nth-child(3) { animation-delay: calc(var(--stagger, 0.1s) * 2); }
@keyframes tri { from { opacity: 0; transform: rotateY(180deg); } to { opacity: 1; transform: rotateY(0); } }
```

### JS

```javascript
[...document.querySelector('.tri').textContent].forEach(c => { const s = document.createElement('span'); s.textContent = c; c.replaceWith(s); });
```

## letter-spacing-wave — 字距呼吸 / Letter Spacing

字间距循环变化,产生呼吸节奏。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 5,
    "step": 0.1,
    "default": 2.5,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "max",
    "label": "最大间距",
    "min": 4,
    "max": 24,
    "step": 1,
    "default": 12,
    "unit": "px"
  }
]
```

### HTML

```html
<h1 class="lsw">BREATHE</h1>
```

### CSS

```css
.lsw { font-size: 32px; font-weight: 900; letter-spacing: 0; animation: lsw var(--duration, 2.5s) ease-in-out infinite; }
@keyframes lsw { 0%, 100% { letter-spacing: 0; } 50% { letter-spacing: var(--max, 12px); } }
```

### JS

```javascript

```

## underline-draw — 下划线 / Underline Draw

下划线从左到右逐段画出,适合链接。

难度：1/3。参数：

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
<a class="ul-draw">HOVER LINK</a>
```

### CSS

```css
.ul-draw { position: relative; font-size: 28px; font-weight: 700; color: inherit; text-decoration: none; }
.ul-draw::after { content: ""; position: absolute; left: 0; bottom: -4px; height: 3px; width: 0; background: currentColor; animation: ulDraw var(--duration, 0.8s) ease-out forwards; }
@keyframes ulDraw { to { width: 100%; } }
```

### JS

```javascript

```

## highlight-sweep — 高亮扫过 / Highlight Sweep

高亮条从左到右扫过文字,常用于强调。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1.5,
    "max": 4,
    "step": 0.1,
    "default": 2.5,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="hl-sweep">SWEEP</h1>
```

### CSS

```css
.hl-sweep { position: relative; display: inline-block; font-size: 36px; font-weight: 900; }
.hl-sweep::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, hsl(50 100% 60%), transparent); transform: translateX(-100%); animation: sweep var(--duration, 2.5s) ease-in-out infinite; mix-blend-mode: multiply; }
@keyframes sweep { 50% { transform: translateX(100%); } }
```

### JS

```javascript

```

## text-blink-cursor — 闪烁光标 / Blink Cursor

模拟终端的闪烁光标,极简风格。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 0.3,
    "max": 1.5,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<span class="cursor-t">输入中</span>
```

### CSS

```css
.cursor-t { font-family: monospace; font-size: 24px; font-weight: 700; }
.cursor-t::after { content: "_"; margin-left: 2px; animation: blink var(--speed, 0.8s) step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
```

### JS

```javascript

```

## rainbow-text — 彩虹文字 / Rainbow Text

文字颜色按彩虹色循环变化。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 6,
    "step": 0.1,
    "default": 3,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="rainbow">RAINBOW</h1>
```

### CSS

```css
.rainbow { font-size: 40px; font-weight: 900; background: linear-gradient(90deg, hsl(0 90% 60%), hsl(60 90% 60%), hsl(120 90% 60%), hsl(180 90% 60%), hsl(240 90% 60%), hsl(300 90% 60%), hsl(360 90% 60%)); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: rb var(--duration, 3s) linear infinite; }
@keyframes rb { to { background-position: 200% 0; } }
```

### JS

```javascript

```

## text-flip-3d — 3D 翻面 / Flip 3D

文字整体绕 Y 轴 360 度翻转,类似卡片。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 4,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="flip3d-wrap"><h1 class="flip3d">FLIP</h1></div>
```

### CSS

```css
.flip3d-wrap { perspective: 600px; }
.flip3d { font-size: 40px; font-weight: 900; display: inline-block; animation: flip3d var(--duration, 2s) ease-in-out infinite; transform-style: preserve-3d; }
@keyframes flip3d { 0% { transform: rotateY(0); } 50% { transform: rotateY(360deg); } 100% { transform: rotateY(360deg); } }
```

### JS

```javascript

```

## number-marquee — 数字翻牌 / Number Marquee

类似时钟翻页的数字滚动效果。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 200,
    "max": 1500,
    "step": 100,
    "default": 600,
    "unit": "ms"
  }
]
```

### HTML

```html
<div class="nmarquee"><span class="num" data-num="0"></span></div>
```

### CSS

```css
.nmarquee { display: flex; gap: 8px; font-family: monospace; font-size: 48px; font-weight: 900; height: 60px; overflow: hidden; }
.nmarquee .num { position: relative; height: 60px; min-width: 40px; text-align: center; }
.nmarquee .num-track { position: absolute; left: 0; right: 0; transition: transform 0.5s ease; }
```

### JS

```javascript
const numEl = document.querySelector('.num');
let cur = 0;
function render() {
  let track = '';
  for (let i = 0; i < 10; i++) track += `<div>${i}</div>`;
  numEl.innerHTML = `<div class="num-track" style="transform:translateY(-${cur * 60}px)">${track}</div>`;
  cur = (cur + 1) % 10;
}
render();
setInterval(render, params.speed);
```

## text-fade-up — 文字上滑 / Text Fade Up

文字从下方淡入上滑,优雅入场。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.4,
    "max": 2,
    "step": 0.1,
    "default": 0.9,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 10,
    "max": 60,
    "step": 5,
    "default": 24,
    "unit": "px"
  }
]
```

### HTML

```html
<h1 class="text-fade-up">MOTION</h1>
```

### CSS

```css
.text-fade-up { animation: textFadeUp var(--duration, 0.9s) cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes textFadeUp { from { opacity: 0; transform: translateY(var(--distance, 24px)); } to { opacity: 1; transform: translateY(0); } }
```

### JS

```javascript

```

## text-slide-left — 文字左滑 / Text Slide Left

文字从右侧滑入归位,横向入场。

难度：1/3。参数：

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
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 20,
    "max": 100,
    "step": 5,
    "default": 40,
    "unit": "px"
  }
]
```

### HTML

```html
<h1 class="text-slide-left">SLIDE</h1>
```

### CSS

```css
.text-slide-left { animation: textSlideLeft var(--duration, 0.8s) cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes textSlideLeft { from { opacity: 0; transform: translateX(var(--distance, 40px)); } to { opacity: 1; transform: translateX(0); } }
```

### JS

```javascript

```

## text-zoom-in — 文字缩放 / Text Zoom In

文字从远处缩放放大入场,有冲击力。

难度：1/3。参数：

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
<h1 class="text-zoom-in">ZOOM</h1>
```

### CSS

```css
.text-zoom-in { animation: textZoomIn var(--duration, 0.8s) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes textZoomIn { from { opacity: 0; transform: scale(0.3); letter-spacing: 0.3em; } to { opacity: 1; transform: scale(1); letter-spacing: -0.02em; } }
```

### JS

```javascript

```

## text-blur-reveal — 模糊揭示 / Blur Reveal

文字从模糊状态揭示为清晰,柔和神秘。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.5,
    "max": 2.5,
    "step": 0.1,
    "default": 1.2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="text-blur-reveal">REVEAL</h1>
```

### CSS

```css
.text-blur-reveal { animation: textBlurReveal var(--duration, 1.2s) ease-out both; }
@keyframes textBlurReveal { from { opacity: 0; filter: blur(20px); letter-spacing: 0.4em; } to { opacity: 1; filter: blur(0); letter-spacing: -0.02em; } }
```

### JS

```javascript

```

## text-glitch-rgb — RGB 故障 / RGB Glitch

文字 RGB 三通道分离故障,赛博朋克风。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 5,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="rgb-glitch" data-text="RGB">RGB</h1>
```

### CSS

```css
.rgb-glitch { position: relative; }
.rgb-glitch::before, .rgb-glitch::after { content: attr(data-text); position: absolute; inset: 0; mix-blend-mode: screen; }
.rgb-glitch::before { color: hsl(0 100% 55%); animation: rgbR var(--duration, 2s) infinite; }
.rgb-glitch::after { color: hsl(180 100% 55%); animation: rgbB var(--duration, 2s) infinite; }
@keyframes rgbR { 0%, 100% { transform: translate(0); } 20% { transform: translate(-3px, 1px); } 40% { transform: translate(2px, -2px); } 60% { transform: translate(-1px, 2px); } }
@keyframes rgbB { 0%, 100% { transform: translate(0); } 20% { transform: translate(3px, -1px); } 40% { transform: translate(-2px, 2px); } 60% { transform: translate(1px, -2px); } }
```

### JS

```javascript

```

## text-neon — 霓虹发光 / Neon Text

文字带霓虹灯发光效果,夜店招牌感。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 4,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="text-neon">NEON</h1>
```

### CSS

```css
.text-neon { color: hsl(320 100% 70%); text-shadow: 0 0 6px hsl(320 100% 60%), 0 0 14px hsl(320 100% 55%), 0 0 28px hsl(320 100% 50%), 0 0 50px hsl(320 100% 45%); animation: neonFlicker var(--duration, 2s) ease-in-out infinite; }
@keyframes neonFlicker { 0%, 100% { opacity: 1; } 92% { opacity: 1; } 93% { opacity: 0.4; } 94% { opacity: 1; } 96% { opacity: 0.6; } 97% { opacity: 1; } }
```

### JS

```javascript

```

## text-fire — 火焰文字 / Fire Text

文字带火焰渐变与跳动,炽热燃烧感。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 4,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="text-fire">FIRE</h1>
```

### CSS

```css
.text-fire { background: linear-gradient(0deg, hsl(0 90% 50%), hsl(20 100% 55%), hsl(45 100% 60%), hsl(0 90% 50%)); background-size: 100% 200%; -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 -2px 6px hsl(20 100% 50%)); animation: fireFlicker var(--duration, 2s) ease-in-out infinite; }
@keyframes fireFlicker { 0%, 100% { background-position: 0% 0%; } 50% { background-position: 0% 100%; } }
```

### JS

```javascript

```

## text-ice — 冰霜文字 / Ice Text

文字带冰霜蓝白渐变与结晶光泽,寒冷感。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 4,
    "step": 0.1,
    "default": 2.5,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="text-ice">ICE</h1>
```

### CSS

```css
.text-ice { background: linear-gradient(135deg, hsl(190 90% 80%), hsl(210 80% 95%), hsl(200 90% 70%), hsl(220 60% 85%)); background-size: 200% 200%; -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: 0 0 12px hsl(200 100% 80%); animation: iceShimmer var(--duration, 2.5s) ease-in-out infinite; }
@keyframes iceShimmer { 0%, 100% { background-position: 0% 0%; } 50% { background-position: 100% 100%; } }
```

### JS

```javascript

```

## text-metallic — 金属质感 / Metallic Text

文字带金属光泽渐变,质感高级。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 5,
    "step": 0.1,
    "default": 2.5,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="text-metallic">METAL</h1>
```

### CSS

```css
.text-metallic { background: linear-gradient(180deg, hsl(0 0% 85%) 0%, hsl(0 0% 35%) 45%, hsl(0 0% 75%) 50%, hsl(0 0% 30%) 55%, hsl(0 0% 80%) 100%); background-size: 100% 200%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: metalShine var(--duration, 2.5s) ease-in-out infinite; }
@keyframes metalShine { 0%, 100% { background-position: 0% 0%; } 50% { background-position: 0% 100%; } }
```

### JS

```javascript

```

## text-outline — 描边文字 / Outline Text

文字仅描边显示并循环呼吸,极简风格。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 4,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="text-outline">OUTLINE</h1>
```

### CSS

```css
.text-outline { color: transparent; -webkit-text-stroke: 2px hsl(280 90% 60%); animation: outlinePulse var(--duration, 2s) ease-in-out infinite; }
@keyframes outlinePulse { 0%, 100% { -webkit-text-stroke-color: hsl(280 90% 60%); } 50% { -webkit-text-stroke-color: hsl(200 90% 60%); } }
```

### JS

```javascript

```

## text-typewriter-multi — 多行打字 / Multi Typewriter

多行文字依次打字输入,循环切换。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 30,
    "max": 200,
    "step": 10,
    "default": 80,
    "unit": "ms"
  }
]
```

### HTML

```html
<span id="multi-tw"></span>
```

### CSS

```css
#multi-tw { font-family: monospace; font-weight: 800; }
#multi-tw::after { content: "▌"; animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
```

### JS

```javascript
const el = document.getElementById('multi-tw');
const lines = ['Hello.', 'I am Motion.', 'Built for effects.'];
let li = 0, ci = 0, del = false;
setInterval(() => {
  const t = lines[li];
  ci += del ? -1 : 1;
  el.textContent = t.slice(0, ci);
  if (!del && ci >= t.length) { del = true; setTimeout(() => {}, 800); }
  else if (del && ci <= 0) { del = false; li = (li + 1) % lines.length; }
}, 90);
```

## text-delete-retype — 删除重打 / Delete Retype

文字打完后删除再重新输入,循环演示。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 30,
    "max": 200,
    "step": 10,
    "default": 70,
    "unit": "ms"
  }
]
```

### HTML

```html
<span id="del-retype"></span>
```

### CSS

```css
#del-retype { font-family: monospace; font-weight: 800; }
#del-retype::after { content: "▌"; animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
```

### JS

```javascript
const el = document.getElementById('del-retype');
const text = 'DELETE & RETYPE';
let i = 0, del = false;
setInterval(() => { i += del ? -1 : 1; el.textContent = text.slice(0, i); if (i >= text.length) del = true; else if (i <= 0) del = false; }, 70);
```

## text-wave-3d — 3D 波浪 / Wave 3D

字符以 3D 透视上下波浪起伏,立体波浪。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 4,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="wave-3d">WAVE</h1>
```

### CSS

```css
.wave-3d { perspective: 400px; }
.wave-3d span { display: inline-block; animation: wave3d var(--duration, 2s) ease-in-out infinite; }
.wave-3d span:nth-child(n) { animation-delay: calc(0.08s * n); }
@keyframes wave3d { 0%, 100% { transform: translateY(0) rotateX(0); } 50% { transform: translateY(-14px) rotateX(60deg); } }
```

### JS

```javascript
[...document.querySelector('.wave-3d').textContent].forEach(c => { const s = document.createElement('span'); s.textContent = c; c.replaceWith(s); });
```

## text-bounce — 弹跳文字 / Bounce Text

字符依次弹跳,活泼有趣。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 3,
    "step": 0.1,
    "default": 1.6,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="text-bounce">BOUNCE</h1>
```

### CSS

```css
.text-bounce span { display: inline-block; animation: textBounce var(--duration, 1.6s) ease-in-out infinite; }
.text-bounce span:nth-child(n) { animation-delay: calc(0.1s * n); }
@keyframes textBounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-18px); } }
```

### JS

```javascript
[...document.querySelector('.text-bounce').textContent].forEach(c => { const s = document.createElement('span'); s.textContent = c; c.replaceWith(s); });
```

## text-rainbow-shift — 彩虹偏移 / Rainbow Shift

文字彩虹色循环并轻微偏移,梦幻。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 6,
    "step": 0.1,
    "default": 3,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="rainbow-shift">RAINBOW</h1>
```

### CSS

```css
.rainbow-shift { background: linear-gradient(90deg, hsl(0 90% 60%), hsl(60 90% 60%), hsl(120 90% 60%), hsl(180 90% 60%), hsl(240 90% 60%), hsl(300 90% 60%), hsl(360 90% 60%)); background-size: 300% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: rbShift var(--duration, 3s) linear infinite; }
@keyframes rbShift { to { background-position: 300% 0; } }
```

### JS

```javascript

```

## text-shadow-long — 长投影 / Long Shadow

文字带超长投影,层叠立体感强。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "depth",
    "label": "深度",
    "min": 4,
    "max": 20,
    "step": 1,
    "default": 10
  }
]
```

### HTML

```html
<h1 class="long-shadow">SHADOW</h1>
```

### CSS

```css
.long-shadow { color: hsl(0 0% 100%); text-shadow: 1px 1px 0 hsl(280 60% 40%), 2px 2px 0 hsl(280 60% 38%), 3px 3px 0 hsl(280 60% 36%), 4px 4px 0 hsl(280 60% 34%), 5px 5px 0 hsl(280 60% 32%), 6px 6px 0 hsl(280 60% 30%), 7px 7px 0 hsl(280 60% 28%), 8px 8px 0 hsl(280 60% 26%), 9px 9px 0 hsl(280 60% 24%), 10px 10px 12px hsl(280 80% 10%); }
```

### JS

```javascript

```

## text-stroke-animate — 描边动画 / Stroke Animate

SVG 描边文字按路径逐步绘制,书写感。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 1,
    "max": 5,
    "step": 0.2,
    "default": 2.5,
    "unit": "s"
  }
]
```

### HTML

```html
<svg viewBox="0 0 300 80"><text class="stroke-text" x="150" y="60" text-anchor="middle">STROKE</text></svg>
```

### CSS

```css
.stroke-text { font-size: 56px; font-weight: 900; fill: transparent; stroke: hsl(280 90% 60%); stroke-width: 2; stroke-dasharray: 600; stroke-dashoffset: 600; animation: strokeDraw var(--duration, 2.5s) ease-out infinite alternate; }
@keyframes strokeDraw { to { stroke-dashoffset: 0; } }
```

### JS

```javascript

```

## text-split-reveal — 分裂揭示 / Split Reveal

文字从中间分裂上下展开揭示,戏剧性。

难度：3/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.6,
    "max": 2.5,
    "step": 0.1,
    "default": 1.2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="split-reveal" data-text="SPLIT">SPLIT</h1>
```

### CSS

```css
.split-reveal { position: relative; overflow: hidden; }
.split-reveal::before { content: attr(data-text); position: absolute; inset: 0; clip-path: inset(0 0 50% 0); transform: translateY(-100%); animation: splitTop var(--duration, 1.2s) cubic-bezier(0.65, 0, 0.35, 1) forwards; }
@keyframes splitTop { to { transform: translateY(0); } }
```

### JS

```javascript

```

## text-char-fall — 字符下落 / Char Fall

字符从上方依次下落入位,瀑布感。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.6,
    "max": 2.5,
    "step": 0.1,
    "default": 1.2,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="char-fall">FALL</h1>
```

### CSS

```css
.char-fall span { display: inline-block; opacity: 0; animation: charFall var(--duration, 1.2s) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.char-fall span:nth-child(n) { animation-delay: calc(0.1s * n); }
@keyframes charFall { from { opacity: 0; transform: translateY(-60px) rotate(-20deg); } to { opacity: 1; transform: translateY(0) rotate(0); } }
```

### JS

```javascript
[...document.querySelector('.char-fall').textContent].forEach(c => { const s = document.createElement('span'); s.textContent = c; c.replaceWith(s); });
```

## text-word-fly — 词语飞入 / Word Fly

词语依次从远处飞入,带 stagger 延迟。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "单项时长",
    "min": 0.4,
    "max": 1.5,
    "step": 0.1,
    "default": 0.7,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "stagger",
    "label": "间隔",
    "min": 0.05,
    "max": 0.4,
    "step": 0.05,
    "default": 0.12,
    "unit": "s"
  }
]
```

### HTML

```html
<h1 class="word-fly"><span>Motion</span> <span>Lab</span> <span>Effects</span></h1>
```

### CSS

```css
.word-fly span { display: inline-block; opacity: 0; animation: wordFly var(--duration, 0.7s) cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.word-fly span:nth-child(1) { animation-delay: 0s; }
.word-fly span:nth-child(2) { animation-delay: var(--stagger, 0.12s); }
.word-fly span:nth-child(3) { animation-delay: calc(var(--stagger, 0.12s) * 2); }
@keyframes wordFly { from { opacity: 0; transform: translateZ(-200px) rotateY(40deg); } to { opacity: 1; transform: translateZ(0) rotateY(0); } }
```

### JS

```javascript

```
