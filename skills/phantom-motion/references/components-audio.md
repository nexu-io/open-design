# 影视级 Audio-First 多轨混音同步引擎 (Hyperframes)

**🚨 导演级核心法则：先定声音，再画画面。**
很多程序员的代码动画画面炫酷，但口型对不上、转场时旁白没念完。在 Hyperframes 渲染管线中，必须遵循“Audio-First”的原则。大模型需要利用旁白的精准时长（Duration）来严格规划 GSAP 镜头动画的 `startTime` 和 `duration`。

---

## 模块一：Hyperframes 多轨混音器标记结构

Hyperframes 会在无头浏览器截帧时，自动提取带有特定 `data` 属性的 `<audio>` 标签并交由 FFmpeg 混音。大模型必须在生成的 HTML 中埋入这些不可见的音频轨道。

```html
<!-- 必须注入到 HTML 尾部的隐藏多轨音频层 -->
<div id="audio-tracks" style="display: none;">

    <!-- 轨道 0：旁白人声 (Voiceover) -->
    <!-- data-start: 该音频在视频中的起始播放时间(秒) -->
    <!-- data-duration: 该音频的绝对时长(秒)，AI 规划运镜必须参考此数据 -->
    <audio src="./assets/scene_1_voice.mp3" class="clip" data-track-index="0" data-start="0" data-duration="4.325"></audio>
    <audio src="./assets/scene_2_voice.mp3" class="clip" data-track-index="0" data-start="4.5" data-duration="5.100"></audio>

    <!-- 轨道 1：史诗级背景音乐 (BGM) -->
    <!-- 贯穿始终，初始音量较小，通过 GSAP 动态控制 volume -->
    <audio src="./assets/bgm_epic.mp3" class="clip" data-track-index="1" data-start="0" data-duration="60" data-volume="0.3"></audio>

    <!-- 轨道 2：电影级音效 (Sound Effects) -->
    <!-- 配合画面冲击点 (如黑洞出现、运镜推近) 的爆发音效 -->
    <audio src="./assets/sfx_deep_boom.wav" class="clip" data-track-index="2" data-start="8.0" data-duration="2.0"></audio>

</div>
```

---

## 模块二：高级进阶 “Duck & Swell” (人声避让与情绪烘托)

真正的影视大片里，旁白说话时，BGM 变小（Duck）；旁白停顿展示宏大画面时，BGM 瞬间轰鸣推大（Swell）。
利用 GSAP 操控 `<audio>` 对象的 `volume` 属性，Hyperframes 能将这种音量的渐变完美写入最终的 MP4 音轨中。

```javascript
// 生成电影级的 BGM 情绪起伏动画
// 必须挂载在 masterTl 上，与画面运镜严格同步
function applyDuckAndSwell(masterTl, bgmSelector = 'audio[data-track-index="1"]') {
    const bgm = document.querySelector(bgmSelector);
    if (!bgm) return;

    // 示例：在第 4.325 秒 (旁白1结束)，BGM 在 2 秒内从 0.3 暴涨到 1.0，烘托画面
    masterTl.to(bgm, { 
        volume: 1.0, 
        duration: 2.0, 
        ease: "power1.inOut" 
    }, 4.325);

    // 示例：在第 9.61 秒 (下一句旁白开始前)，BGM 重新收敛回 0.3
    masterTl.to(bgm, { 
        volume: 0.3, 
        duration: 1.0, 
        ease: "power1.inOut" 
    }, 9.61);
}
```

---

## 模块三：AI 智能体的 "Text-to-Masterpiece" 串联逻辑

大模型在生成整个 HTML 动画文件时的思维流必须是：

1. **解析声音轴**：读取剧本，获取各句 TTS 音频的 `duration`。
2. **规划分镜头**：根据音频的 `duration`，切分出对应时长的运镜动作（`push_in`, `orbit` 等）。
3. **埋入音频轨**：在 HTML 末尾插入带有 `data-track-index` 和 `data-start` 的 `<audio>` 标签群。
4. **生成总轴**：将所有 Camera Rig、太极/星球/粒子生成逻辑、UI 文本特效、以及 Duck & Swell 音量控制，统统塞入同一个 GSAP `masterTl` 中。
5. **完美落幕**：在 `masterTl` 的最后加上片尾淡出，并将时间轴提交给 Hyperframes。