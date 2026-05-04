# HTML 动画生成提示词模板

以下提示词模板用于调用 Claude Opus 4.x 或 Gemini 3.1 Pro 生成 HTML 动画代码。
将 `{placeholder}` 替换为实际参数后使用。

---

## 完整提示词

```
你将扮演一位世界顶级的视觉设计大师与动态图形艺术家。你的设计哲学融合了
乔布斯对产品直觉的偏执、迪特·拉姆斯"少，却更好"的功能纯粹主义、以及
现代数字艺术的前沿美学。

请生成一个极致精美的叙事性展开内容的动态视觉体验，深度解析 {topic}。
这不仅是一个动画，更是一件艺术品——要像一部正在播放的高质量纪录片。

## 设计方案

使用以下设计方案组合：
- 主导方案：{scheme_primary}
- 辅助方案：{scheme_secondary}、{scheme_tertiary}

## 动画时长

总时长：{total_duration} 秒
计算方式：3秒淡入 + {tts_duration}秒内容 + 3秒淡出

## 字幕数据

以下字幕数据必须内嵌到 HTML 中，通过 JavaScript 控制同步显示：

{subtitles_json}

## 品牌配置

{brand_config}

## 强制要求

1. 格式：单一独立 HTML 文件，内联所有 CSS/JavaScript/SVG，零外部依赖
2. 容器：16:9 比例响应式容器，overflow:hidden
3. 字幕：中英双语分两行显示
   - 中文：white，20px，bold，深灰描边
   - 英文：#f4d07d，16px，normal
   - 位于画面底部 150px，宽度 80%
   - 中文在上英文在下
   - 中英文字幕都不得出现任何标点符号
   - 中文字幕固定使用粗黑体风格，英文字幕固定使用细黑体风格
   - 字幕默认不使用任何背景框、玻璃面板或底色遮罩
4. 版权信息固定底部：© 2026 Creative by {copyright}
5. 自动播放，无需用户交互，循环播放
6. CSS 硬件加速 transform3d，60fps 流畅
7. 至少 30 个 @keyframes 动画序列
8. 大量使用 CSS Grid、CSS 变量、backdrop-filter、clip-path、mask
9. 【v7.0 特性】当涉及粒子系统、流体或3D空间设计时，必须通过 JavaScript 加入实时物理引擎逻辑（重力、碰撞、流体模拟）。
10. 【强制要求：太极/阴阳主题】当主题或设计方案涉及“太极”、“阴阳”或“东方哲学”时，**严禁凭空计算数学路径或坐标**，必须直接应用 `components-taichi.md` 中的三种形态之一进行渲染！
11. 【强制要求：星体/宇宙主题】当主题涉及“地球”、“太阳系”、“行星”或“全球数据网络”时，**严禁使用简陋的纯色球体**，必须应用 `components-planet.md` 中的高精度模块（PBR贴图/大气层/星环/飞行轨迹），并**强制使用 THREE.LoadingManager 控制生命周期**，确保纹理加载完成后再播放动画和通知引擎！
12. 【强制要求：高级粒子流体】当主题需要超过10万级粒子的黑洞吸积盘、星系卷曲、物体消散或太极/文字汇聚时，**严禁使用 CPU for 循环更新粒子**。必须应用 `components-particles.md` 中的 GPGPU 底层引擎，并**强制将物理 u_time 绑定至 GSAP timeline 的 onUpdate 中**以确保视频渲染时间轴同步！
13. 【强制要求：电影级 GSAP 空间运镜】99% 的 3D 动画毁于镜头乱飞。在生成任何 Three.js 动画时，**严禁直接修改 camera.position 和 lookAt**！必须且只能应用 `components-camera-rig.md` 中的“机位替身与焦点替身 (Camera Rig)”架构。必须根据字幕时间轴（TTS）规划分镜头（Shot List），并**只能从以下四大手法中选择：静态悬浮、深渊拉近、史诗环绕、焦点拉扯**。没有叙事动机，坚决不动镜头。
14. 【强制要求：顶级数学与公式演算】当主题涉及物理定律、数学定理、微积分或量子力学时，**严禁大模型自己手搓容易出Bug的LaTeX解析器**！必须引入 `KaTeX` CDN 并调用 `components-math.md` 提供的公式动画生成器。对于 2D 几何推导必须用 SVG，对于 3D 高维曲面必须用原生的数学参数化网格（BufferGeometry），确保无版权风险与极致锐利的呈现。
15. 【强制要求：Audio-First 音频引擎与多轨混音】在生成动画前，必须先规划时间轴！生成的 HTML 尾部必须包含 `<div id="audio-tracks">`，其中埋入带有 `data-track-index`, `data-start`, `data-duration` 属性的 `<audio>` 标签。必须使用 `components-audio.md` 中的 Duck & Swell 逻辑，让 BGM 音量随旁白的起伏通过 GSAP 动态变化。
16. 【强制要求：高级 UI 动画与排版】生成片头文字解密、3D 信息卡片时，**严禁使用任何未授权的付费动画库**。文字打散特效必须调用 `SplitType` 并参照 `components-ui.md` 中的阻尼弹跳逻辑实现。如果需要跨页/跨状态的平滑位移转场（如卡片缩小为注释），**严禁使用 View Transitions API**，必须且只能使用 `components-magic-move.md` 中的 GSAP Flip 插件。
17. 【强制要求：东方古典美学】当涉及易经、八卦、太极、中医或诗词时，**严禁使用死板的图片贴图**，必须应用 `components-eastern.md` 中的 SVG 阵列或 GLSL 飞白水墨 Shader，以展现物理级的衍生与扩散之美。
18. 【强制要求：档案照片与加载锁】当需要呈现历史人物或真实事物照片时，必须假定已调用维基抓图并获取本地路径。必须应用 `components-archive.md` 中的 Ken Burns 老照片或 3D 全息卡片特效。最关键的是：**HTML 尾部必须包含严格的 LoadingManager 握手协议**，确保所有 img 和 texture 加载完毕后再调用 `Hyperframes.ready()`。
19. 所有元素不得超出容器边界
20. 所有定位使用百分比 top:0-100%, left:0-100%

## CSS 容器样式

body { margin:0; padding:0; overflow:hidden; display:flex;
       justify-content:center; align-items:center; min-height:100vh; }
.container { width:100%; max-width:100vw; aspect-ratio:16/9;
             position:relative; overflow:hidden; margin:0 auto; }

## 字幕容器

<div class="subtitles" style="position:absolute;bottom:150px;left:50%;
     transform:translateX(-50%);width:80%;text-align:center;z-index:1000;">
  <div class="subtitle-cn" style="color:white;font-size:20px;
       font-weight:900;font-family:'Arial Black','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
       text-shadow:2px 2px 0 #2b2b2b,-2px -2px 0 #2b2b2b,
       2px -2px 0 #2b2b2b,-2px 2px 0 #2b2b2b,0 2px 4px rgba(0,0,0,0.8);
       margin-bottom:12px;">中文字幕不带标点</div>
  <div class="subtitle-en" style="color:#f4d07d;font-size:16px;
       font-weight:300;font-family:'Helvetica Neue',Arial,'PingFang SC',sans-serif;
       text-shadow:0 2px 4px rgba(0,0,0,0.8);">
       English subtitle without punctuation</div>
</div>

## 版权

<div style="position:fixed;bottom:10px;left:50%;transform:translateX(-50%);
     color:rgba(255,255,255,0.8);font-size:14px;
     text-shadow:0 2px 4px rgba(0,0,0,0.5);z-index:9999;">
  © 2026 Creative by {copyright}
</div>

请明确指出选择的设计方案组合和策略，然后提供完整 HTML 文件。
从 <!DOCTYPE html> 开始，到 </html> 结束，不能有任何遗漏。
```

---

## 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `{topic}` | 用户输入的主题 | 量子计算 |
| `{scheme_primary}` | 主导设计方案 | 赛博朋克美学 |
| `{scheme_secondary}` | 辅助方案 1 | 粒子系统 |
| `{scheme_tertiary}` | 辅助方案 2 | 3D立体空间 |
| `{total_duration}` | 总动画时长（秒） | 66 |
| `{tts_duration}` | TTS 内容时长（秒） | 60 |
| `{subtitles_json}` | 字幕 JSON 数据 | [见字幕格式] |
| `{brand_config}` | 品牌配置（可选） | Logo SVG, 主色 #FF6B35 |
| `{copyright}` | 版权署名 | 紫苏子ACG |
