# Checklist

## P0

- `assets/template.html` exists and opens directly from disk.
- `example.html` renders both the editable template preview and the default MP4 showcase.
- Skill frontmatter uses `od.mode: template`, `od.surface: video`, and `od.type: hyperframes`.
- Base composition includes exactly 3 scenes and each scene hold is under 3 seconds.
- Template keeps deterministic logic (seeded randomness only, no `repeat: -1` loops).
- Template avoids sandbox-hostile APIs (`localStorage`, `sessionStorage`, `alert`, `confirm`, `prompt`).

## P1

- Retro 8-bit visual language remains consistent across all three scenes.
- Scene transitions and entrance choreography are clearly visible at normal playback speed.
- Generated artifact remains a single self-contained HTML file.

## P2

- Keyboard preview controls (`1`, `2`, `3`, `r`) work in local preview.
- Mouse glow/parallax interaction remains subtle and does not hurt readability.
