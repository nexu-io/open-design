# Renderer & media-skill verification record

Per-skill verification evidence and hand-off details moved out of the SKILL.md
frontmatter (kept there as one-liners). Machine-readable support levels live in
`registry/renderer_registry.json` and move only on real output.

## Downstream renderers

### guizang-ppt-skill (Chinese HTML)

Required when the deck language is Chinese. The brief writer references
`~/.agents/skills/guizang-ppt-skill/SKILL.md`; without it the next agent cannot
render. The v0.6.5 brief writer emits a stderr warning if the skill is not
detected.

### frontend-slides (English HTML)

Recommended when the deck language is English. Same hand-off pattern as
guizang. v1.0 `support_level: full` — brief exit works, full presentation
checkup ran on a real deck on 2026-06-17 (`docs/showcase/v0.9-frontend-slides/`),
and 5 renderer-specific failure-mode rules added (horizontal overflow, low
contrast, hyphenation noise, font contract, image alt).

### beautiful-html-templates (English HTML alternative)

Same hand-off pattern. v1.0 `support_level: full` — brief exit works, full
presentation checkup ran on a real Neo-Grid deck on 2026-06-13
(`docs/showcase/hermes-agent-mastery/en/`), same 5 renderer-specific
failure-mode rules as frontend-slides.

### ppt-master (native editable PPTX)

Humanize emits `ppt-master-production-prompt.md` + `ppt-master-source.md`; PPT
Master keeps its mandatory confirmation, main SVG/native DrawingML export, and
raw `.pptx` template-fill routes. `support_level: full` after the 2026-07-10
real 10-slide main export plus 5-slide template-fill export, office interop
render, and OOXML checkups
(`docs/showcase/ppt-master-native/verification-2026-07-10.md`).

## Media-slot skills

### remotion-video-production

Recommended (main) for the video media slot. Orchestrates the whole Remotion
video pipeline — renders the real mp4 (deterministic loop, no narration) to the
slot's `asset_path`. Verified in v0.9 (`docs/showcase/v0.9-visual-enhancement/`).

### remotion-best-practices

Pair with remotion-video-production while writing Remotion code — avoids
unstable patterns (misused CSS / Tailwind animation, wrong asset paths).

### remotion-video-toolkit

Add only for complex video work — captions, charts, 3D, batch templates,
automated render pipelines. Source: github.com/shreefentsar/remotion-video-toolkit.

### baoyu-image-gen

Recommended for the image media slot. Drives the local Codex CLI
(`--provider codex-cli`) using the logged-in Codex/ChatGPT subscription — no
`OPENAI_API_KEY` needed. Generates the real hero/concept image to the slot's
`asset_path`. Source: github.com/JimLiu/baoyu-skills. Verified in v0.9.

## Additional trigger phrases

Besides the two examples kept in the frontmatter description, these user
utterances also mean the presentation checkup: "帮我盯一下渲染出来的 PPT
有没有翻车", "告诉我哪几页只能看不能讲".
