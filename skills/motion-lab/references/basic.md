# Motion.Lab · basic

从固定提交的 data/effects.ts 提取，代码保留原样；是集成起点，不是对所有运行环境的兼容性保证。使用前落实 DOM 作用域、依赖、清理及无障碍。

## fade-in — 淡入 / Fade In

元素从透明渐入到不透明,最基础的进入动画。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 3,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "delay",
    "label": "延迟",
    "min": 0,
    "max": 2,
    "step": 0.1,
    "default": 0,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="fade-in">Hello</div>
```

### CSS

```css
.fade-in { animation: fadeIn var(--duration, 0.8s) ease-out var(--delay, 0s) both; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
```

### JS

```javascript
// Pure CSS — no JS needed
```

## fade-in-up — 上滑淡入 / Fade In Up

元素从下方淡入,常用于列表项。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 3,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 10,
    "max": 80,
    "step": 5,
    "default": 20,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="fade-in-up">Hello</div>
```

### CSS

```css
.fade-in-up { animation: fadeInUp var(--duration, 0.8s) ease-out both; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(var(--distance, 20px)); } to { opacity: 1; transform: translateY(0); } }
```

### JS

```javascript
// Pure CSS
```

## slide-in-left — 左侧滑入 / Slide In Left

元素从左侧滑入视口。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 2,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="slide-left">→</div>
```

### CSS

```css
.slide-left { animation: slideLeft var(--duration, 0.6s) ease-out both; }
@keyframes slideLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
```

### JS

```javascript

```

## slide-in-right — 右侧滑入 / Slide In Right

元素从右侧滑入视口。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 2,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="slide-right">←</div>
```

### CSS

```css
.slide-right { animation: slideRight var(--duration, 0.6s) ease-out both; }
@keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
```

### JS

```javascript

```

## zoom-bounce — 缩放弹跳 / Zoom Bounce

元素放大入场,带弹跳回弹。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="zoom-bounce">●</div>
```

### CSS

```css
.zoom-bounce { animation: zoomBounce var(--duration, 0.8s) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes zoomBounce { from { transform: scale(0); } to { transform: scale(1); } }
```

### JS

```javascript

```

## flip-x — 水平翻转 / Flip X

元素绕 X 轴翻转入场。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="flip-x">↻</div>
```

### CSS

```css
.flip-x { animation: flipX var(--duration, 0.8s) ease-out both; transform-origin: center; }
@keyframes flipX { from { transform: perspective(600px) rotateX(-90deg); opacity: 0; } to { transform: perspective(600px) rotateX(0); opacity: 1; } }
```

### JS

```javascript

```

## rotate-in — 旋转入场 / Rotate In

元素从旋转状态回归原位。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.7,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="rotate-in">★</div>
```

### CSS

```css
.rotate-in { animation: rotateIn var(--duration, 0.7s) ease-out both; }
@keyframes rotateIn { from { transform: rotate(-180deg) scale(0.3); opacity: 0; } to { transform: rotate(0) scale(1); opacity: 1; } }
```

### JS

```javascript

```

## pulse — 脉冲 / Pulse

元素持续放大缩小,吸引注意。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.5,
    "max": 3,
    "step": 0.1,
    "default": 1.5,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "intensity",
    "label": "强度",
    "min": 0.05,
    "max": 0.4,
    "step": 0.05,
    "default": 0.15
  }
]
```

### HTML

```html
<div class="pulse">●</div>
```

### CSS

```css
.pulse { animation: pulse var(--duration, 1.5s) ease-in-out infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(calc(1 + var(--intensity, 0.15))); } }
```

### JS

```javascript

```

## shake — 摇晃 / Shake

元素左右快速摇晃,常用于表单错误提示。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 1.5,
    "step": 0.1,
    "default": 0.5,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="shake">!</div>
```

### CSS

```css
.shake { animation: shake var(--duration, 0.5s); }
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
```

### JS

```javascript

```

## heartbeat — 心跳 / Heartbeat

双拍心跳节奏,模拟真实心跳。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.5,
    "max": 3,
    "step": 0.1,
    "default": 1.2,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="heartbeat">♥</div>
```

### CSS

```css
.heartbeat { animation: heartbeat var(--duration, 1.2s) ease-in-out infinite; }
@keyframes heartbeat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.3); } 28% { transform: scale(1); } 42% { transform: scale(1.3); } 70% { transform: scale(1); } }
```

### JS

```javascript

```

## marquee — 跑马灯 / Marquee

内容从右向左无限滚动。

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
    "default": 12,
    "unit": "s"
  },
  {
    "kind": "select",
    "key": "direction",
    "label": "方向",
    "options": [
      "left",
      "right"
    ],
    "default": "left"
  }
]
```

### HTML

```html
<div class="marquee"><span>Motion.Lab · 动效实验室 · </span><span>Motion.Lab · 动效实验室 · </span></div>
```

### CSS

```css
.marquee { display: flex; gap: 32px; animation: marquee var(--duration, 12s) linear infinite; white-space: nowrap; }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
```

### JS

```javascript

```

## spinner — 加载旋转 / Spinner

经典加载指示器。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="spinner"></div>
```

### CSS

```css
.spinner { width: 32px; height: 32px; border: 3px solid rgba(0,0,0,0.1); border-top-color: var(--accent); border-radius: 50%; animation: spin var(--duration, 0.8s) linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

### JS

```javascript

```

## slide-up — 上滑入场 / Slide Up

元素从下往上滑入并淡入,通用入场动画。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 2,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 20,
    "max": 120,
    "step": 5,
    "default": 40,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="slide-up">Slide Up</div>
```

### CSS

```css
.slide-up { animation: slideUp var(--duration, 0.6s) ease-out both; }
@keyframes slideUp { from { opacity: 0; transform: translateY(var(--distance, 40px)); } to { opacity: 1; transform: translateY(0); } }
```

### JS

```javascript

```

## slide-down — 下滑入场 / Slide Down

元素从上往下滑入,适合顶部 banner。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 2,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 20,
    "max": 120,
    "step": 5,
    "default": 40,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="slide-down">Slide Down</div>
```

### CSS

```css
.slide-down { animation: slideDown var(--duration, 0.6s) ease-out both; }
@keyframes slideDown { from { opacity: 0; transform: translateY(calc(var(--distance, 40px) * -1)); } to { opacity: 1; transform: translateY(0); } }
```

### JS

```javascript

```

## bounce-in — 弹跳入场 / Bounce In

元素入场时多次反弹,有节奏感。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.5,
    "max": 2,
    "step": 0.1,
    "default": 1,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="bounce-in">Bounce</div>
```

### CSS

```css
.bounce-in { animation: bounceIn var(--duration, 1s) both; }
@keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.1); opacity: 1; } 70% { transform: scale(0.9); } 85% { transform: scale(1.05); } 100% { transform: scale(1); } }
```

### JS

```javascript

```

## elastic-in — 弹性入场 / Elastic In

入场时带有明显弹性回弹,生动有趣。

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
<div class="elastic-in">Elastic</div>
```

### CSS

```css
.elastic-in { animation: elasticIn var(--duration, 1.2s) cubic-bezier(0.68, -0.55, 0.265, 1.55) both; }
@keyframes elasticIn { 0% { transform: scale(0) rotate(-180deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
```

### JS

```javascript

```

## fade-out — 淡出消失 / Fade Out

元素持续淡出后回弹,适合循环演示。

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
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="fade-out">Fade Out</div>
```

### CSS

```css
.fade-out { animation: fadeOut var(--duration, 2s) ease-in-out infinite alternate; }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
```

### JS

```javascript

```

## scale-pulse — 缩放呼吸 / Scale Pulse

元素持续缩放形成呼吸效果,比 pulse 更夸张。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.6,
    "max": 3,
    "step": 0.1,
    "default": 1.4,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "min",
    "label": "最小",
    "min": 0.4,
    "max": 0.95,
    "step": 0.05,
    "default": 0.7
  },
  {
    "kind": "range",
    "key": "max",
    "label": "最大",
    "min": 1.05,
    "max": 1.6,
    "step": 0.05,
    "default": 1.15
  }
]
```

### HTML

```html
<div class="scale-pulse">●</div>
```

### CSS

```css
.scale-pulse { animation: sp var(--duration, 1.4s) ease-in-out infinite; }
@keyframes sp { 0%, 100% { transform: scale(var(--min, 0.7)); } 50% { transform: scale(var(--max, 1.15)); } }
```

### JS

```javascript

```

## rotate-360 — 持续旋转 / Rotate 360

元素持续 360 度旋转,无限循环。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.5,
    "max": 6,
    "step": 0.1,
    "default": 2,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="rotate-360">⟳</div>
```

### CSS

```css
.rotate-360 { display: inline-block; animation: rot360 var(--duration, 2s) linear infinite; }
@keyframes rot360 { to { transform: rotate(360deg); } }
```

### JS

```javascript

```

## swing — 钟摆 / Swing

顶部固定,左右摆动,像钟摆一样。

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
<div class="swing">⏰</div>
```

### CSS

```css
.swing { display: inline-block; transform-origin: top center; animation: swing var(--duration, 1.6s) ease-in-out infinite; }
@keyframes swing { 0%, 100% { transform: rotate(15deg); } 50% { transform: rotate(-15deg); } }
```

### JS

```javascript

```

## jello — 果冻 / Jello

元素呈现果冻般的扭曲抖动,俏皮可爱。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.6,
    "max": 1.5,
    "step": 0.1,
    "default": 0.9,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="jello">JELLO</div>
```

### CSS

```css
.jello { display: inline-block; animation: jello var(--duration, 0.9s) ease-in-out infinite; transform-origin: center; }
@keyframes jello { 0%, 100% { transform: scale3d(1, 1, 1); } 30% { transform: scale3d(1.25, 0.75, 1); } 40% { transform: scale3d(0.75, 1.25, 1); } 50% { transform: scale3d(1.15, 0.85, 1); } 65% { transform: scale3d(0.95, 1.05, 1); } 75% { transform: scale3d(1.05, 0.95, 1); } }
```

### JS

```javascript

```

## flash — 闪烁 / Flash

元素透明度快速闪烁,适合新消息/警告提示。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 0.4,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  },
  {
    "kind": "select",
    "key": "color",
    "label": "颜色",
    "options": [
      "red",
      "yellow",
      "blue",
      "green"
    ],
    "default": "red"
  }
]
```

### HTML

```html
<div class="flash">NOTICE</div>
```

### CSS

```css
.flash { animation: flash var(--duration, 0.8s) ease-in-out infinite; padding: 12px 20px; background: hsl(0 90% 55%); color: white; border-radius: 8px; font-weight: 700; }
@keyframes flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
```

### JS

```javascript

```

## fade-in-down — 上方淡入 / Fade In Down

元素从上方淡入下滑,通用入场动画。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 3,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 10,
    "max": 80,
    "step": 5,
    "default": 20,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="fade-in-down">Hello</div>
```

### CSS

```css
.fade-in-down { animation: fadeInDown var(--duration, 0.8s) ease-out both; }
@keyframes fadeInDown { from { opacity: 0; transform: translateY(calc(var(--distance, 20px) * -1)); } to { opacity: 1; transform: translateY(0); } }
```

### JS

```javascript

```

## fade-in-left — 左侧淡入 / Fade In Left

元素从左侧淡入滑入,适合横向布局。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 3,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 10,
    "max": 80,
    "step": 5,
    "default": 24,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="fade-in-left">Hello</div>
```

### CSS

```css
.fade-in-left { animation: fadeInLeft var(--duration, 0.8s) ease-out both; }
@keyframes fadeInLeft { from { opacity: 0; transform: translateX(calc(var(--distance, 24px) * -1)); } to { opacity: 1; transform: translateX(0); } }
```

### JS

```javascript

```

## fade-in-right — 右侧淡入 / Fade In Right

元素从右侧淡入滑入,横向入场。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 3,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 10,
    "max": 80,
    "step": 5,
    "default": 24,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="fade-in-right">Hello</div>
```

### CSS

```css
.fade-in-right { animation: fadeInRight var(--duration, 0.8s) ease-out both; }
@keyframes fadeInRight { from { opacity: 0; transform: translateX(var(--distance, 24px)); } to { opacity: 1; transform: translateX(0); } }
```

### JS

```javascript

```

## scale-in — 缩放入场 / Scale In

元素从较小尺寸缩放到原始大小入场。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 2,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "from",
    "label": "起始缩放",
    "min": 0.1,
    "max": 0.9,
    "step": 0.05,
    "default": 0.5
  }
]
```

### HTML

```html
<div class="scale-in">Scale</div>
```

### CSS

```css
.scale-in { animation: scaleIn var(--duration, 0.6s) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes scaleIn { from { opacity: 0; transform: scale(var(--from, 0.5)); } to { opacity: 1; transform: scale(1); } }
```

### JS

```javascript

```

## scale-out — 缩小归位 / Scale Out

元素从较大尺寸缩小归位,有收束感。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.2,
    "max": 2,
    "step": 0.1,
    "default": 0.6,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "from",
    "label": "起始缩放",
    "min": 1.05,
    "max": 2,
    "step": 0.05,
    "default": 1.2
  }
]
```

### HTML

```html
<div class="scale-out">Scale</div>
```

### CSS

```css
.scale-out { animation: scaleOut var(--duration, 0.6s) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes scaleOut { from { opacity: 0; transform: scale(var(--from, 1.2)); } to { opacity: 1; transform: scale(1); } }
```

### JS

```javascript

```

## flip-y — 垂直翻转 / Flip Y

元素绕 Y 轴翻转入场,类似翻牌。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="flip-y">↻</div>
```

### CSS

```css
.flip-y { animation: flipY var(--duration, 0.8s) ease-out both; transform-origin: center; }
@keyframes flipY { from { transform: perspective(600px) rotateY(-90deg); opacity: 0; } to { transform: perspective(600px) rotateY(0); opacity: 1; } }
```

### JS

```javascript

```

## flip-in-3d — 3D 翻转 / Flip In 3D

元素以 3D 透视翻转加缩放入场,立体感强。

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
    "default": 0.9,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="flip-in-3d">3D</div>
```

### CSS

```css
.flip-in-3d { animation: flipIn3d var(--duration, 0.9s) ease-out both; transform-origin: center; }
@keyframes flipIn3d { from { transform: perspective(800px) rotateX(-90deg) rotateY(-30deg) scale(0.6); opacity: 0; } to { transform: perspective(800px) rotateX(0) rotateY(0) scale(1); opacity: 1; } }
```

### JS

```javascript

```

## wobble — 摇摆 / Wobble

元素左右摇摆晃动,俏皮可爱。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.6,
    "max": 2,
    "step": 0.1,
    "default": 1,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="wobble">Wobble</div>
```

### CSS

```css
.wobble { display: inline-block; animation: wobble var(--duration, 1s) ease-in-out infinite; transform-origin: center; }
@keyframes wobble { 0%, 100% { transform: translateX(0) rotate(0); } 15% { transform: translateX(-12%) rotate(-5deg); } 30% { transform: translateX(10%) rotate(3deg); } 45% { transform: translateX(-8%) rotate(-3deg); } 60% { transform: translateX(6%) rotate(2deg); } 75% { transform: translateX(-3%) rotate(-1deg); } }
```

### JS

```javascript

```

## tada — 庆祝抖动 / Tada

元素放大并轻微旋转抖动,庆祝感强。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.6,
    "max": 2,
    "step": 0.1,
    "default": 1,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="tada">Tada!</div>
```

### CSS

```css
.tada { display: inline-block; animation: tada var(--duration, 1s) ease-in-out infinite; transform-origin: center; }
@keyframes tada { 0%, 100% { transform: scale(1) rotate(0); } 10%, 20% { transform: scale(0.9) rotate(-3deg); } 30%, 50%, 70%, 90% { transform: scale(1.15) rotate(3deg); } 40%, 60%, 80% { transform: scale(1.15) rotate(-3deg); } }
```

### JS

```javascript

```

## bounce-down — 向下弹跳 / Bounce Down

元素从上方弹跳落下,带多次反弹。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.6,
    "max": 2,
    "step": 0.1,
    "default": 1,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "distance",
    "label": "距离",
    "min": 20,
    "max": 120,
    "step": 5,
    "default": 60,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="bounce-down">Bounce</div>
```

### CSS

```css
.bounce-down { animation: bounceDown var(--duration, 1s) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes bounceDown { 0% { transform: translateY(calc(var(--distance, 60px) * -1)); opacity: 0; } 60% { transform: translateY(8px); opacity: 1; } 80% { transform: translateY(-4px); } 100% { transform: translateY(0); } }
```

### JS

```javascript

```

## slide-fade-corner — 角落滑入 / Corner Slide

元素从左上角斜向滑入,带淡入。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="corner-slide">Corner</div>
```

### CSS

```css
.corner-slide { animation: cornerSlide var(--duration, 0.8s) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes cornerSlide { from { opacity: 0; transform: translate(-40px, -40px) scale(0.8); } to { opacity: 1; transform: translate(0, 0) scale(1); } }
```

### JS

```javascript

```

## skew-in — 倾斜入场 / Skew In

元素以倾斜状态滑入归位,动感十足。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.7,
    "unit": "s"
  },
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
<div class="skew-in">Skew</div>
```

### CSS

```css
.skew-in { animation: skewIn var(--duration, 0.7s) ease-out both; }
@keyframes skewIn { from { opacity: 0; transform: skewX(calc(var(--angle, 15deg) * -1)) translateX(-30px); } to { opacity: 1; transform: skewX(0) translateX(0); } }
```

### JS

```javascript

```

## blur-in — 模糊入场 / Blur In

元素从模糊状态渐变到清晰,柔和入场。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.3,
    "max": 2,
    "step": 0.1,
    "default": 0.8,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "blur",
    "label": "模糊",
    "min": 4,
    "max": 30,
    "step": 1,
    "default": 14,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="blur-in">Blur</div>
```

### CSS

```css
.blur-in { animation: blurIn var(--duration, 0.8s) ease-out both; }
@keyframes blurIn { from { opacity: 0; filter: blur(var(--blur, 14px)); transform: scale(1.05); } to { opacity: 1; filter: blur(0); transform: scale(1); } }
```

### JS

```javascript

```

## blur-out — 模糊呼吸 / Blur Pulse

元素在清晰与模糊间循环呼吸,梦幻感。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 5,
    "step": 0.1,
    "default": 2.4,
    "unit": "s"
  },
  {
    "kind": "range",
    "key": "blur",
    "label": "模糊",
    "min": 2,
    "max": 16,
    "step": 1,
    "default": 8,
    "unit": "px"
  }
]
```

### HTML

```html
<div class="blur-out">Pulse</div>
```

### CSS

```css
.blur-out { animation: blurOut var(--duration, 2.4s) ease-in-out infinite; }
@keyframes blurOut { 0%, 100% { filter: blur(0); opacity: 1; } 50% { filter: blur(var(--blur, 8px)); opacity: 0.6; } }
```

### JS

```javascript

```

## grayscale-in — 灰度入场 / Grayscale In

元素从灰度渐变到彩色,复古转彩色。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.5,
    "max": 3,
    "step": 0.1,
    "default": 1.2,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="grayscale-in">Color</div>
```

### CSS

```css
.grayscale-in { animation: grayscaleIn var(--duration, 1.2s) ease-out both; }
@keyframes grayscaleIn { from { filter: grayscale(1) brightness(1.2); opacity: 0.4; } to { filter: grayscale(0) brightness(1); opacity: 1; } }
```

### JS

```javascript

```

## color-cycle — 色彩循环 / Color Cycle

元素背景色按 HSL 循环变化,霓虹感。

难度：1/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "周期",
    "min": 1,
    "max": 8,
    "step": 0.2,
    "default": 3,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="color-cycle">Cycle</div>
```

### CSS

```css
.color-cycle { animation: colorCycle var(--duration, 3s) linear infinite; }
@keyframes colorCycle { 0% { background: hsl(0 90% 60%); } 25% { background: hsl(90 90% 55%); } 50% { background: hsl(180 90% 55%); } 75% { background: hsl(270 90% 60%); } 100% { background: hsl(360 90% 60%); } }
```

### JS

```javascript

```

## border-draw — 边框画出 / Border Draw

边框按顺时针逐步画出,勾勒轮廓。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "duration",
    "label": "时长",
    "min": 0.6,
    "max": 3,
    "step": 0.1,
    "default": 1.4,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="border-draw">Draw</div>
```

### CSS

```css
.border-draw { position: relative; padding: 24px 32px; }
.border-draw::before { content: ""; position: absolute; inset: 0; padding: 2px; border-radius: 12px; background: linear-gradient(90deg, hsl(280 90% 60%), hsl(200 90% 60%)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; background-size: 300% 300%; animation: borderDraw var(--duration, 1.4s) ease-in-out infinite alternate; }
@keyframes borderDraw { to { background-position: 100% 100%; } }
```

### JS

```javascript

```

## shadow-grow — 阴影生长 / Shadow Grow

元素阴影循环生长,产生悬浮呼吸感。

难度：1/3。参数：

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
<div class="shadow-grow">Float</div>
```

### CSS

```css
.shadow-grow { animation: shadowGrow var(--duration, 2s) ease-in-out infinite; }
@keyframes shadowGrow { 0%, 100% { box-shadow: 0 4px 10px rgba(0,0,0,0.1); transform: translateY(0); } 50% { box-shadow: 0 24px 40px rgba(0,0,0,0.25); transform: translateY(-6px); } }
```

### JS

```javascript

```

## gradient-shift — 渐变流动 / Gradient Shift

渐变背景持续流动,色彩柔和过渡。

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
    "default": 5,
    "unit": "s"
  }
]
```

### HTML

```html
<div class="gradient-shift">Flow</div>
```

### CSS

```css
.gradient-shift { background: linear-gradient(120deg, hsl(280 90% 60%), hsl(200 90% 60%), hsl(320 90% 60%), hsl(280 90% 60%)); background-size: 300% 300%; animation: gradientShift var(--duration, 5s) ease infinite; }
@keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
```

### JS

```javascript

```

## typewriter-cursor — 光标打字 / Typing Cursor

带闪烁光标的打字效果,逐字输入循环。

难度：2/3。参数：

```json
[
  {
    "kind": "range",
    "key": "speed",
    "label": "速度",
    "min": 30,
    "max": 250,
    "step": 10,
    "default": 90,
    "unit": "ms"
  }
]
```

### HTML

```html
<span id="tw-cursor"></span>
```

### CSS

```css
#tw-cursor { font-family: monospace; font-weight: 800; }
#tw-cursor::after { content: "▌"; margin-left: 2px; animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
```

### JS

```javascript
const el = document.getElementById('tw-cursor');
const text = 'Typing...';
let i = 0;
setInterval(() => { el.textContent = text.slice(0, i++ % (text.length + 1)); }, 90);
```
