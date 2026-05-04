# 高级 UI 与文字特效动画库 (GSAP + SplitType)

**🚨 核心版权与架构约束：**
1. **严禁使用 GSAP 官方付费插件**（如 `SplitText`, `MorphSVG`, `ScrambleText` 等），否则将带来严重的商业法务风险。
2. **严禁使用 CDN 加载核心动画库**。在离线渲染环境（如 Hyperframes 无头浏览器）下，CDN 延迟会导致视频渲染时丢失动画。必须使用 NPM 本地引入打包方案。
3. 文字打散动画必须使用 MIT 开源协议的 **`SplitType`** 作为官方平替。
4. 大模型必须且只能调用以下封装好的 UI 动画预设（Preset Library），严禁自行编写杂乱无章的 CSS/GSAP 界面动画。

---

## 模块一：电影级片头（光影文字解密出现）

**适用场景**：视频开场标题、章节切换标题、重要数据展示。
**依赖要求**：需在 HTML `<head>` 引入 `SplitType`（通过本地打包）。

```html
<!-- 示例依赖引入 (实际部署时必须通过本地打包) -->
<script src="https://unpkg.com/split-type"></script>
```

```javascript
// 生成电影级打散文字出现特效
// 结合 SplitType 与 GSAP，创造数字乱码解密或极具阻尼感的弹跳出现
function generateIntroTextAnimation(masterTl, elementSelector, startTime, duration = 1.0) {
    const el = document.querySelector(elementSelector);
    if (!el) return;

    // 1. 使用开源的 SplitType 将文字切分为单个字符 <span>
    const myText = new SplitType(el, { types: 'chars' });
    
    // 2. 文字一开始全隐藏，然后带有极具弹性的高级阻尼缓动出现
    if (myText.chars && myText.chars.length > 0) {
        masterTl.fromTo(myText.chars, 
            { opacity: 0, scale: 2, filter: 'blur(10px)' }, 
            { 
                opacity: 1, 
                scale: 1, 
                filter: 'blur(0px)', 
                stagger: 0.05, // 依次出现
                duration: duration, 
                ease: "back.out(1.7)" // 极具弹性的高级阻尼缓动 
            }, 
            startTime 
        );
    }
}
// 使用示例: generateIntroTextAnimation(masterTl, '#intro-title', 1.0);
```

---

## 模块二：3D 科技感信息面板弹出 (Information Card)

**适用场景**：旁白介绍某个具体的物理概念、数据指标或行星参数时，伴随运镜弹出的悬浮面板。

```javascript
// 生成 3D 空间感的信息面板飞入动画
function generateInfoCardAnimation(masterTl, cardId, startTime, duration = 1.5) {
    const card = document.getElementById(cardId);
    if (!card) return;

    // 利用 GSAP 控制 DOM 的 3D Transform (需配合 CSS perspective 属性使用)
    masterTl.fromTo(card, 
        { 
            rotationX: -90, // 像一扇门一样躺着
            opacity: 0, 
            z: -500 // 在屏幕深处
        }, 
        { 
            rotationX: 0, 
            opacity: 1, 
            z: 0, 
            duration: duration, 
            ease: "expo.out" // 极速飞出，然后丝滑刹车停住 
        }, 
        startTime 
    );
}
// 使用示例: generateInfoCardAnimation(masterTl, 'info-card-1', 4.5);
```

---

## 模块三：电影级片尾淡出 (Fade Outro)

**适用场景**：视频结尾的黑场与版权信息展示。

```javascript
function generateFadeOutroAnimation(masterTl, elementsToFade, startTime, duration = 2.0) {
    // 将整个画面元素淡出到黑屏
    masterTl.to(elementsToFade, {
        opacity: 0,
        duration: duration,
        ease: "power2.inOut"
    }, startTime);
    
    // 如果有特定的版权信息，可以在淡出后稍微浮现
    const copyright = document.getElementById('copyright');
    if (copyright) {
        masterTl.fromTo(copyright, 
            { opacity: 0 }, 
            { opacity: 1, duration: 1.5, ease: "power1.inOut" }, 
            startTime + duration * 0.5
        );
    }
}
```