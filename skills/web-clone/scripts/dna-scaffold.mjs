#!/usr/bin/env node
// dna-scaffold.mjs — 生成 design-dna.json 骨架，best-effort 从 recon-site.mjs 的输出预填。
// 用法:
//   node scripts/dna-scaffold.mjs --out <design-dna.json> [--recon <label-recon.json>] [--name <站名>]
// 产物:
//   <out>  完整 DNA 骨架；有 --recon 时预填字体/色候选/框架特效信号，其余留 "" 待人工 Analyze。
// 纪律: 只搬侦察里"真实抓到"的信号，绝不编造。拿不准角色(primary/accent)的色值统一丢进 _recon_signals 供人工指派。

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { recon: "", out: "", name: "", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--recon") out.recon = argv[++i] || "";
    else if (a === "--out") out.out = argv[++i] || "";
    else if (a === "--name") out.name = argv[++i] || "";
  }
  return out;
}

function usage() {
  console.log(`dna-scaffold.mjs — 生成 design-dna.json 骨架并 best-effort 预填

  node scripts/dna-scaffold.mjs --out <design-dna.json> [--recon <label-recon.json>] [--name <站名>]

只用在「视觉复刻 / 内容爆改」模式。忠实复刻分支不需要 DNA（真源码即真相）。
schema 与字段含义见 references/design-dna.md。`);
}

// 完整 DNA 骨架（与 references/design-dna.md 对齐）
function skeleton(name) {
  const ts = () => ({ size: "", weight: "", line_height: "", tracking: "" });
  return {
    meta: { name: name || "", description: "", source_references: "", created_at: "" },
    design_system: {
      color: {
        palette_type: "",
        primary: { hex: "", role: "" },
        secondary: { hex: "", role: "" },
        accent: { hex: "", role: "" },
        neutral: { scale: "", usage: "" },
        semantic: { success: "", warning: "", error: "", info: "" },
        surface: { background: "", card: "", elevated: "" },
        contrast_strategy: "",
      },
      typography: {
        type_scale: {
          display: ts(), heading_1: ts(), heading_2: ts(), heading_3: ts(),
          body: ts(), body_small: ts(), caption: ts(), overline: ts(),
        },
        font_families: { heading: "", body: "", mono: "" },
        font_style_notes: "",
      },
      spacing: { base_unit: "", scale: "", content_density: "", section_rhythm: "" },
      layout: { grid_system: "", max_content_width: "", columns: "", gutter: "", breakpoints: "", alignment_tendency: "" },
      shape: { border_radius: { small: "", medium: "", large: "", pill: "" }, border_usage: "", divider_style: "" },
      elevation: { shadow_style: "", levels: { low: "", medium: "", high: "" }, depth_cues: "" },
      iconography: { style: "", stroke_weight: "", size_scale: "", preferred_set: "" },
      motion: { easing: "", duration_scale: { micro: "", normal: "", macro: "" }, entrance_pattern: "", exit_pattern: "", philosophy: "" },
      components: { button_style: "", input_style: "", card_style: "", navigation_pattern: "", modal_style: "", list_style: "", component_notes: "" },
    },
    design_style: {
      aesthetic: { mood: [], visual_metaphor: "", era_influence: "", genre: "", personality_traits: [], adjectives: [] },
      visual_language: { complexity: "", ornamentation: "", whitespace_usage: "", visual_weight_distribution: "", focal_strategy: "", contrast_level: "", texture_usage: "" },
      composition: { hierarchy_method: "", balance_type: "", flow_direction: "", grouping_strategy: "", negative_space_role: "" },
      imagery: { photo_treatment: "", illustration_style: "", graphic_elements: "", pattern_usage: "", image_shape: "" },
      interaction_feel: { feedback_style: "", hover_behavior: "", transition_personality: "", loading_style: "", microinteraction_density: "" },
      brand_voice_in_ui: { tone: "", formality: "", cta_style: "", empty_state_approach: "", error_tone: "" },
    },
    visual_effects: {
      overview: { effect_intensity: "", performance_tier: "", fallback_strategy: "", primary_technology: "" },
      background_effects: { type: "", description: "", technology: "", params: { color_palette: "", speed: "", density: "", opacity: "", blend_mode: "" } },
      particle_systems: { enabled: false, type: "", description: "", technology: "", params: { count: "", shape: "", size_range: "", movement_pattern: "", color_behavior: "", interaction: "", spawn_area: "" } },
      "3d_elements": { enabled: false, type: "", description: "", technology: "", params: { renderer: "", lighting: "", camera: "", materials: "", geometry: "", post_processing: [], interaction_model: "" } },
      shader_effects: { enabled: false, type: "", description: "", technology: "", params: { uniforms: "", vertex_manipulation: "", fragment_output: "", noise_type: "", distortion: "" } },
      scroll_effects: { parallax: { enabled: false, layers: "", depth_range: "", speed_curve: "" }, scroll_triggered_animations: { enabled: false, trigger_points: "", animation_type: "", scrub_behavior: "" }, scroll_morphing: { enabled: false, description: "" } },
      text_effects: { type: "", description: "", technology: "", params: { split_strategy: "", animation_per_unit: "", stagger: "", effect_style: "" } },
      cursor_effects: { enabled: false, type: "", description: "", params: { shape: "", size: "", blend_mode: "", trail: "", interaction_zone: "" } },
      image_effects: { type: "", description: "", technology: "", params: { filter_pipeline: "", hover_transform: "", reveal_animation: "", distortion_type: "" } },
      glassmorphism_neumorphism: { enabled: false, style: "", params: { blur_radius: "", transparency: "", border_treatment: "", shadow_type: "", light_source_angle: "" } },
      canvas_drawings: { enabled: false, type: "", description: "", technology: "", params: { draw_method: "", animation_loop: "", color_scheme: "", responsiveness: "", interaction: "" } },
      svg_animations: { enabled: false, type: "", description: "", params: { animation_method: "", path_morphing: "", stroke_animation: "", filter_effects: "" } },
      composite_notes: "",
    },
  };
}

const COLOR_RE = /(#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\))/;

// recon-site.mjs 把信号按视口嵌在 captures[].signals 下；取最宽视口的 signals 摊平，
// 兼容已是扁平结构的 recon 输入。摊平失败则原样返回(enrich 对缺字段已容错)。
function flattenRecon(recon) {
  if (recon && Array.isArray(recon.captures) && recon.captures.length) {
    const widest = recon.captures
      .filter((c) => c && c.signals)
      .sort((a, b) => (b?.viewport?.width || 0) - (a?.viewport?.width || 0))[0];
    if (widest && widest.signals) {
      // 顶层 url 兜底进 href，便于 meta.source_references 预填
      return { href: recon.url, ...widest.signals };
    }
  }
  return recon;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

// 从 recon JSON best-effort 抽信号，并预填 skeleton 的明确字段
function enrich(dna, recon) {
  const signals = { fonts: [], color_candidates: [], frameworks: {}, canvas_count: 0, css_color_vars: [] };

  // 字体: fonts[] + sections[].style.fontFamily
  const fontList = uniq([
    ...(Array.isArray(recon.fonts) ? recon.fonts : []),
    ...((recon.sections || []).map((s) => s?.style?.fontFamily).filter(Boolean)),
  ]).map((f) => String(f).replace(/^["']|["']$/g, "").split(",")[0].trim()).filter(Boolean);
  signals.fonts = uniq(fontList);
  if (signals.fonts.length) {
    const mono = signals.fonts.find((f) => /mono|code|consol|courier/i.test(f)) || "";
    const nonMono = signals.fonts.filter((f) => f !== mono);
    dna.design_system.typography.font_families.heading = nonMono[0] || "";
    dna.design_system.typography.font_families.body = nonMono[1] || nonMono[0] || "";
    dna.design_system.typography.font_families.mono = mono;
  }

  // 颜色: CSS 变量里像颜色的 + sections 的 bg/color
  const cssVars = Array.isArray(recon.cssVariables) ? recon.cssVariables : [];
  for (const pair of cssVars) {
    const [name, val] = Array.isArray(pair) ? pair : [pair?.name, pair?.value];
    if (val && COLOR_RE.test(String(val))) signals.css_color_vars.push(`${name}: ${String(val).trim()}`);
  }
  const sectionColors = [];
  for (const s of recon.sections || []) {
    const bg = s?.style?.backgroundColor;
    const fg = s?.style?.color;
    if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/i.test(bg)) sectionColors.push(bg);
    if (fg) sectionColors.push(fg);
  }
  signals.color_candidates = uniq([
    ...signals.css_color_vars.map((v) => v.split(":").slice(1).join(":").trim()),
    ...sectionColors,
  ]).slice(0, 24);
  // body/header 背景作为 surface.background 候选(第一个非透明的 section bg)
  const firstBg = (recon.sections || []).map((s) => s?.style?.backgroundColor)
    .find((c) => c && !/rgba?\(0, 0, 0, 0\)|transparent/i.test(c));
  if (firstBg) dna.design_system.color.surface.background = firstBg;

  // 框架/特效信号
  const fw = recon.frameworks || {};
  signals.frameworks = fw;
  signals.canvas_count = (recon.canvases && recon.canvases.length) || recon?.counts?.canvas || 0;

  if (fw.three) {
    dna.visual_effects.overview.primary_technology = "WebGL/Three.js";
    dna.visual_effects.overview.performance_tier = "heavy";
    dna.visual_effects["3d_elements"].enabled = true;
    dna.visual_effects["3d_elements"].technology = "Three.js";
  } else if (signals.canvas_count > 0) {
    dna.visual_effects.overview.primary_technology = "Canvas 2D";
    dna.visual_effects.canvas_drawings.enabled = true;
  } else if (fw.gsap) {
    dna.visual_effects.overview.primary_technology = "GSAP";
  }
  if (fw.gsap || fw.lenis) {
    dna.visual_effects.scroll_effects.scroll_triggered_animations.enabled = true;
    dna.visual_effects.scroll_effects.scroll_triggered_animations.scrub_behavior =
      fw.lenis ? "lenis smooth-scroll detected" : "gsap detected";
  }

  // meta 预填
  if (recon.href) dna.meta.source_references = recon.href;
  if (!dna.meta.name && recon.title) dna.meta.name = recon.title;

  // 把原始信号留在顶层供人工指派角色(不编造 primary/accent)
  dna._recon_signals = signals;
  dna._scaffold_note =
    "best-effort 预填来自 recon。font_families/surface.background/visual_effects 已据真实信号填写；" +
    "color 的 primary/secondary/accent 角色需人工从 _recon_signals.color_candidates 指派；" +
    "所有 \"\" 字段需人工 Analyze 补全(见 references/design-dna.md)。确认无误后可删除 _recon_signals 与本说明。";
  return dna;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.out) {
    usage();
    process.exit(args.help ? 0 : 1);
  }
  let dna = skeleton(args.name);
  if (args.recon) {
    try {
      const recon = JSON.parse(fs.readFileSync(path.resolve(args.recon), "utf8"));
      dna = enrich(dna, flattenRecon(recon));
    } catch (e) {
      console.warn(`⚠️ 读 recon 失败(${e.message})，只输出空骨架。`);
    }
  }
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(dna, null, 2)}\n`);
  console.log(`✅ design-dna 骨架已写入: ${outPath}`);
  if (dna._recon_signals) {
    const s = dna._recon_signals;
    console.log(`   预填: 字体 ${s.fonts.length} 个 / 色候选 ${s.color_candidates.length} 个 / canvas ${s.canvas_count} / three=${!!s.frameworks.three} gsap=${!!s.frameworks.gsap} lenis=${!!s.frameworks.lenis}`);
  }
  console.log(`   下一步: 人工 Analyze 补全 ""，并从 _recon_signals 指派颜色角色。schema → references/design-dna.md`);
} catch (e) {
  console.error(`dna-scaffold 失败: ${e.message}`);
  process.exit(1);
}
