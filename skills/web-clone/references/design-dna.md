# Design DNA · 结构化设计身份层（视觉复刻 / 内容爆改专用）

把"做成那个站的感觉"从模糊感觉变成**可版本化、可复用、可对照的 JSON 规范**。
用在「视觉复刻」和「内容爆改」两个模式——侦察之后、搭工程之前，多产出一个 `design-dna.json`，
让 Step 6「替换成用户自己的东西」有据可依：**DNA 留着、内容换掉**。

> 方法与 schema 改编自 [zanwei/design-dna](https://github.com/zanwei/design-dna)（MIT），按 web-clone 的口径裁剪。

## ⚠️ 适用边界（必须先读）

Design DNA 的生成哲学是**"近似风格"**——它产出的是"风格一致的新站"，不是逐字节复制。
这和 web-clone 的头号铁律「真源码至上 / 逐字节忠实」是**相反方向**。所以：

| 模式 | 用不用 DNA |
|---|---|
| 忠实复刻（拿到真源码 / 单文件原生站 / WebGL 逐字节还原） | **不用**。真源码就是真相，别让 DNA 把它稀释成"近似" |
| 视觉复刻（还原观感但简化实现） | **用**。DNA 是这条路的主产物 |
| 内容爆改（保留信息架构+节奏+视觉语法，换成用户的内容） | **用**。DNA 定义"要保留什么"，内容随便换 |

一句话：**DNA 是给"做我自己的站"用的，不是给"搬一模一样"用的。**

## 三维结构

DNA JSON 分三层，对应"可量化 / 可感知 / 特殊渲染"：

1. **`design_system`** — 可测量的 token：color / typography / spacing / layout / shape / elevation / iconography / motion / components
2. **`design_style`** — 主观感知：aesthetic（mood/genre/era）/ visual_language / composition / imagery / interaction_feel / brand_voice_in_ui
3. **`visual_effects`** — 超出普通 CSS 的渲染：background / particles / 3d / shader / scroll / text / cursor / image / glass-neu / canvas / svg

`design_system` 直接落成 CSS 变量；`design_style` 指导主观取舍；`visual_effects` 决定要不要上 Canvas/WebGL/GSAP，并和本 skill 的「WebGL 逆向分支」对接。

## 三步工作流

1. **Structure** — 先看 schema（下方 + `dna-scaffold.mjs` 生成的骨架），确认要填哪些维度，可裁掉不相关的。
2. **Analyze** — 从侦察产物里抽：
   - 颜色：`<label>-recon.json` 的 `cssVariables`（`--` 开头的色值）+ `sections[].style` 的 `backgroundColor` / `color`，按面积定 primary、按 CTA 定 accent。
   - 字体：`fonts` 数组 + `sections[].style.fontFamily`，分 heading / body / mono。
   - 间距/布局：截图 + `sections[].rect` 量节奏与最大宽度。
   - 特效：`frameworks.three/gsap/lenis` + `canvases` + `counts.canvas` → 填 `visual_effects.overview.primary_technology` 和各 enabled 标志。
   - 风格/感知：看三档截图（1440/768/390）人工判 mood、genre、composition、whitespace。
   - **每个字段都要填实，不要留空字符串**；填不出的标 `TODO` 并说明缺什么证据。
3. **Generate** — 解析 DNA → 生成 CSS 自定义属性 → 按 `design_style` 做主观决策 → 按 `effect_intensity` 选实现层级（lightweight=CSS/SVG/vanilla；medium=Canvas2D/GSAP/Lottie；heavy=Three.js/GLSL/Pixi）→ 输出页面 → 灌 用户自己的内容。**素材优先从原站取真图（用 `asset-harvest.mjs`），不要 AI 重绘近似。**

## 脚手架

```bash
node "$WEB_CLONE_SKILL_DIR/scripts/dna-scaffold.mjs" \
  --recon "$WEB_CLONE_PROJECT/RECON/original-recon.json" \
  --out   "$WEB_CLONE_PROJECT/RECON/design-dna.json"
```

脚本会输出完整 DNA 骨架，并把侦察到的字体、CSS 色变量、框架/特效信号**best-effort 预填**，
其余字段留 `""`（待人工 Analyze 补全）。没有 `--recon` 也能跑，纯出空骨架。

## DNA JSON 完整字段（改编自 design-dna，MIT）

```json
{
  "meta": { "name": "", "description": "", "source_references": "", "created_at": "" },

  "design_system": {
    "color": {
      "palette_type": "monochromatic | complementary | analogous | triadic | split-complementary",
      "primary":   { "hex": "", "role": "" },
      "secondary": { "hex": "", "role": "" },
      "accent":    { "hex": "", "role": "" },
      "neutral":   { "scale": "", "usage": "" },
      "semantic":  { "success": "", "warning": "", "error": "", "info": "" },
      "surface":   { "background": "", "card": "", "elevated": "" },
      "contrast_strategy": "high contrast | subtle layers | dark-on-light dominant"
    },
    "typography": {
      "type_scale": {
        "display":    { "size": "", "weight": "", "line_height": "", "tracking": "" },
        "heading_1":  { "size": "", "weight": "", "line_height": "", "tracking": "" },
        "heading_2":  { "size": "", "weight": "", "line_height": "", "tracking": "" },
        "heading_3":  { "size": "", "weight": "", "line_height": "", "tracking": "" },
        "body":       { "size": "", "weight": "", "line_height": "", "tracking": "" },
        "body_small": { "size": "", "weight": "", "line_height": "", "tracking": "" },
        "caption":    { "size": "", "weight": "", "line_height": "", "tracking": "" },
        "overline":   { "size": "", "weight": "", "line_height": "", "tracking": "" }
      },
      "font_families": { "heading": "", "body": "", "mono": "" },
      "font_style_notes": ""
    },
    "spacing": { "base_unit": "", "scale": "", "content_density": "compact | comfortable | spacious", "section_rhythm": "" },
    "layout":  { "grid_system": "", "max_content_width": "", "columns": "", "gutter": "", "breakpoints": "", "alignment_tendency": "strict grid | centered | asymmetric | mixed" },
    "shape":   { "border_radius": { "small": "", "medium": "", "large": "", "pill": "" }, "border_usage": "none | subtle 1px | bold borders | only on inputs", "divider_style": "" },
    "elevation": { "shadow_style": "none | soft diffused | hard drop | layered", "levels": { "low": "", "medium": "", "high": "" }, "depth_cues": "shadows | overlapping layers | blur/glass | color intensity" },
    "iconography": { "style": "", "stroke_weight": "", "size_scale": "", "preferred_set": "" },
    "motion": { "easing": "", "duration_scale": { "micro": "", "normal": "", "macro": "" }, "entrance_pattern": "", "exit_pattern": "", "philosophy": "minimal functional | playful bouncy | cinematic | none" },
    "components": { "button_style": "", "input_style": "", "card_style": "", "navigation_pattern": "", "modal_style": "", "list_style": "", "component_notes": "" }
  },

  "design_style": {
    "aesthetic": { "mood": [], "visual_metaphor": "", "era_influence": "", "genre": "", "personality_traits": [], "adjectives": [] },
    "visual_language": { "complexity": "minimal | moderate | rich | maximal", "ornamentation": "none | subtle accents | decorative | heavily ornamented", "whitespace_usage": "", "visual_weight_distribution": "", "focal_strategy": "single hero element | distributed interest | progressive reveal", "contrast_level": "", "texture_usage": "" },
    "composition": { "hierarchy_method": "scale contrast | color weight | spatial isolation | typographic hierarchy", "balance_type": "symmetric | asymmetric | radial | mosaic", "flow_direction": "", "grouping_strategy": "", "negative_space_role": "" },
    "imagery": { "photo_treatment": "", "illustration_style": "", "graphic_elements": "", "pattern_usage": "", "image_shape": "" },
    "interaction_feel": { "feedback_style": "", "hover_behavior": "", "transition_personality": "snappy | smooth glide | bouncy elastic | fade-subtle", "loading_style": "", "microinteraction_density": "" },
    "brand_voice_in_ui": { "tone": "", "formality": "", "cta_style": "direct imperative | friendly invitation | urgent scarcity | subtle suggestion", "empty_state_approach": "", "error_tone": "" }
  },

  "visual_effects": {
    "overview": { "effect_intensity": "none | subtle-accent | moderate | heavy-immersive", "performance_tier": "lightweight | medium | heavy", "fallback_strategy": "", "primary_technology": "CSS only | Canvas 2D | WebGL/Three.js | GSAP | Lottie | SVG SMIL | Pixi.js" },
    "background_effects": { "type": "gradient-animation | noise-field | mesh-gradient | video-bg | generative-art | none", "description": "", "technology": "", "params": { "color_palette": "", "speed": "", "density": "", "opacity": "", "blend_mode": "" } },
    "particle_systems": { "enabled": false, "type": "floating-dots | confetti | snow | fireflies | connected-nodes | custom", "description": "", "technology": "", "params": { "count": "", "shape": "", "size_range": "", "movement_pattern": "", "color_behavior": "", "interaction": "mouse-repel | mouse-attract | click-burst | none", "spawn_area": "" } },
    "3d_elements": { "enabled": false, "type": "hero-model | product-viewer | scene-bg | text-extrusion | abstract-geometry", "description": "", "technology": "", "params": { "renderer": "", "lighting": "", "camera": "", "materials": "", "geometry": "", "post_processing": [], "interaction_model": "" } },
    "shader_effects": { "enabled": false, "type": "noise-distortion | wave | morph | color-shift | custom-GLSL", "description": "", "technology": "", "params": { "uniforms": "", "vertex_manipulation": "", "fragment_output": "", "noise_type": "perlin | simplex | worley | fbm", "distortion": "" } },
    "scroll_effects": { "parallax": { "enabled": false, "layers": "", "depth_range": "", "speed_curve": "" }, "scroll_triggered_animations": { "enabled": false, "trigger_points": "", "animation_type": "fade-up | scale-in | clip-reveal | counter | draw-SVG", "scrub_behavior": "" }, "scroll_morphing": { "enabled": false, "description": "" } },
    "text_effects": { "type": "split-letter-animate | typewriter | glitch | gradient-fill | 3d-extrude | none", "description": "", "technology": "", "params": { "split_strategy": "by-char | by-word | by-line", "animation_per_unit": "", "stagger": "", "effect_style": "" } },
    "cursor_effects": { "enabled": false, "type": "custom-cursor | magnetic-buttons | spotlight | trail | none", "description": "", "params": { "shape": "", "size": "", "blend_mode": "", "trail": "", "interaction_zone": "" } },
    "image_effects": { "type": "hover-distortion | reveal-clip | parallax-tilt | rgb-shift | none", "description": "", "technology": "", "params": { "filter_pipeline": "", "hover_transform": "", "reveal_animation": "", "distortion_type": "barrel | wave | liquid | glitch" } },
    "glassmorphism_neumorphism": { "enabled": false, "style": "glass | neumorphic-light | neumorphic-dark | frosted-layers | none", "params": { "blur_radius": "", "transparency": "", "border_treatment": "", "shadow_type": "", "light_source_angle": "" } },
    "canvas_drawings": { "enabled": false, "type": "generative-lines | interactive-blobs | data-visualization | pattern-fill | none", "description": "", "technology": "", "params": { "draw_method": "", "animation_loop": "", "color_scheme": "", "responsiveness": "", "interaction": "" } },
    "svg_animations": { "enabled": false, "type": "path-draw | morph-shapes | logo-reveal | decorative-loop | none", "description": "", "params": { "animation_method": "", "path_morphing": "", "stroke_animation": "", "filter_effects": "" } },
    "composite_notes": ""
  }
}
```

## 和 WebGL 逆向分支的分工

- `visual_effects` 里标了 `heavy-immersive` / `WebGL/Three.js` / `shader_effects.enabled=true` 的站，**别用 DNA 去"近似"那个特效**——那是 `effect-extraction.md` + `reverse-engineering.md` 的活，要逆向真实现。
- DNA 在这种站里只负责"特效**之外**"的设计层（配色/排版/布局/普通动效），特效本身走逆向或委托 web-shader-extractor。
