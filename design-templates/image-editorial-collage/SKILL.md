---
name: "image-editorial-collage"
en_name: "Editorial Cut-Paper Collage"
zh_name: "编辑拼贴海报"
description: "Create a physically assembled editorial collage for fashion, culture, art, and brand stories. Use when a hero subject, cut-paper layers, sparse exact typography, and tactile imperfections should feel authored rather than digitally stickered together."
zh_description: "生成手工剪纸质感的时尚、文化、艺术类编辑拼贴图，强调真实拼贴感而非数字贴纸感。"
triggers:
  - "collage"
  - "cut-paper"
  - "editorial collage"
  - "fashion editorial"
  - "zine"
  - "拼贴"
  - "剪纸"
  - "杂志拼贴"
  - "时尚大片"
od:
  mode: "image"
  task_type: "image"
  surface: "image"
  scenario: "marketing"
  category: "editorial-collage"
  preview:
    type: "image"
    poster: "example.webp"
  design_system:
    requires: false
  example_prompt: "Create a vertical editorial fashion collage: one hero portrait, torn-paper layers, two exact headline strings, and visible tape and paper fibers."
---
# Editorial Cut-Paper Collage

Turn one story into one flat editorial page that looks assembled by hand. Every fragment must support the story or composition.

## Inputs

- story thesis, hero subject, and supporting materials
- exact title, section label, caption, or annotation
- desired crop, reading order, and page ratio
- palette, paper stocks, print processes, and marks to preserve
- subject identity or garment invariants when references are supplied

Never imitate a named publication or invent mastheads, credits, source lines, or filler paragraphs.

## Art direction

1. Choose one hero cutout that carries the page at thumbnail size.
2. Build depth with four to seven materially distinct layers: paper, photograph, botanical print, foil, acetate, tracing paper, or photocopy.
3. Use one geometric color field to anchor the composition and one hand-made mark to break the grid.
4. Describe real construction evidence: scissor nicks, torn fibers, glue wrinkles, tape edge, graphite, grease pencil, halftone, or photocopy grain.
5. Quote all requested text verbatim and assign clear placement.
6. Keep empty paper visible; do not fill every gap with decorative scraps.

Use the host image-generation capability and save one finished editorial-page bitmap.

## Reject generic AI styling

No smooth digital sticker shadows, scrapbook clip-art overload, fake handwriting, glossy 3D fragments, random washi tape, repeated face crops, extra limbs, luxury-logo imitation, filler text, or perfectly clean vector edges.

## Quality gate

- One hero subject leads; supporting materials create rhythm and evidence.
- Paper layers overlap believably with consistent shadows and scale.
- Imperfections follow the stated physical process.
- Exact text is sparse, readable, and not repeated.
- The page feels bright, tactile, and editorial—not like a template full of stickers.

## Demo brief

Create a vertical fashion-material collage using only **SECOND SKIN** and **MATERIAL STUDY 02**. Feature one adult woman in an azure architectural suit with coral organza, a sun-yellow circle, botanical paper, silver torn foil, and hot-pink grease-pencil marks.
