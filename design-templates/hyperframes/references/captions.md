# Captions

## Language Rule (Non-Negotiable)

**Never use `.en` models unless the user explicitly states the audio is English.** `.en` models TRANSLATE non-English audio into English instead of transcribing it.

1. User says the language → `--model small --language <code>` (no `.en`)
2. User says English → `--model small.en`
3. Language unknown → `--model small` (no `.en`, no `--language`) — auto-detects

---

Analyze spoken content to determine caption style. If user specifies a style, use that. Otherwise, detect tone from the transcript.

## Transcript Source

```json
[
  { "text": "Hello", "start": 0.0, "end": 0.5 },
  { "text": "world.", "start": 0.6, "end": 1.2 }
]
```

For transcription commands, whisper models, external APIs, see [transcript-guide.md](transcript-guide.md).

## Style Detection (When No Style Specified)

Read the full transcript before choosing. Four dimensions:

**1. Visual feel** — corporate→clean; energetic→bold; storytelling→elegant; technical→precise; social→playful.

**2. Color palette** — dark+bright for energy; muted for professional; high contrast for clarity; one accent color.

**3. Font mood** — heavy/condensed for impact; clean sans for modern; rounded for friendly; serif for elegance.

**4. Animation character** — scale-pop for punchy; gentle fade for calm; word-by-word for emphasis; typewriter for technical.

## Per-Word Styling

Scan for words deserving distinct treatment:

- **Brand/product names** — larger size, unique color
- **ALL CAPS** — scale boost, flash, accent color
- **Numbers/statistics** — bold weight, accent color
- **Emotional keywords** — exaggerated animation (overshoot, bounce)
- **Call-to-action** — highlight, underline, color pop
- **Marker highlight** — for beyond-color emphasis, see [css-patterns.md](css-patterns.md)

## Script-to-Style Mapping

| Tone         | Font mood                | Animation                          | Color                       | Size    |
| ------------ | ------------------------ | ---------------------------------- | --------------------------- | ------- |
| Hype/launch  | Heavy condensed, 800-900 | Scale-pop, back.out(1.7), 0.1-0.2s | Bright on dark              | 72-96px |
| Corporate    | Clean sans, 600-700      | Fade+slide, power3.out, 0.3s       | White/neutral, muted accent | 56-72px |
| Tutorial     | Mono/clean sans, 500-600 | Typewriter/fade, 0.4-0.5s          | High contrast, minimal      | 48-64px |
| Storytelling | Serif/elegant, 400-500   | Slow fade, power2.out, 0.5-0.6s    | Warm muted tones            | 44-56px |
| Social       | Rounded sans, 700-800    | Bounce, elastic.out, word-by-word  | Playful, colored pills      | 56-80px |

## Word Grouping

- **High energy:** 2-3 words. Quick turnover.
- **Conversational:** 3-5 words. Natural phrases.
- **Measured/calm:** 4-6 words. Longer groups.

Break on sentence boundaries, 150ms+ pauses, or max word count.

## Positioning

- **Landscape (1920x1080):** Bottom 80-120px, centered
- **Portrait (1080x1920):** Lower middle ~600-700px from bottom, centered
- Never cover the subject's face
- `position: absolute` — never relative
- One caption group visible at a time

## Text Overflow Prevention

Use `window.__hyperframes.fitTextFontSize()`:

```js
var result = window.__hyperframes.fitTextFontSize(group.text.toUpperCase(), {
  fontFamily: "Outfit",
  fontWeight: 900,
  maxWidth: 1600,
});
el.style.fontSize = result.fontSize + "px";
```

Options: `maxWidth` (1600 landscape, 900 portrait), `baseFontSize` (78), `minFontSize` (42), `fontWeight`, `fontFamily`, `step` (2).

CSS safety nets: `max-width` on container, `overflow: visible` (**not** `hidden` — hidden clips scaled emphasis words and glow effects), `position: absolute`, explicit `height`. When per-word styling uses `scale > 1.0`, compute `maxWidth = safeWidth / maxScale` to leave headroom.

**Container pattern:** Full-width absolute container, centered. Do **not** use `left: 50%; transform: translateX(-50%)` — causes clipping at composition edges.

## Caption Exit Guarantee

Every group **must** have a hard kill after exit animation:

```js
tl.to(groupEl, { opacity: 0, scale: 0.95, duration: 0.12, ease: "power2.in" }, group.end - 0.12);
tl.set(groupEl, { opacity: 0, visibility: "hidden" }, group.end); // deterministic kill
```

Self-lint after building timeline — place **before** `window.__timelines[id] = tl` so it runs at composition init:

```js
GROUPS.forEach(function (group, gi) {
  var el = document.getElementById("cg-" + gi);
  if (!el) return;
  tl.seek(group.end + 0.01);
  var computed = window.getComputedStyle(el);
  if (computed.opacity !== "0" && computed.visibility !== "hidden") {
    console.warn(
      "[caption-lint] group " + gi + " still visible at t=" + (group.end + 0.01).toFixed(2) + "s",
    );
  }
});
tl.seek(0);
```

## Further References

- [dynamic-techniques.md](dynamic-techniques.md) — karaoke, clip-path reveals, slam words, scatter exits, elastic, 3D rotation
- [transcript-guide.md](transcript-guide.md) — transcription commands, whisper models, external APIs
- [css-patterns.md](css-patterns.md) — CSS+GSAP marker highlighting (deterministic, fully seekable)

## Constraints

- Deterministic. No `Math.random()`, no `Date.now()`.
- Sync to transcript timestamps.
- One group visible at a time.
- Every group must have a hard `tl.set` kill at `group.end`.
- The compiler embeds supported fonts automatically — just declare `font-family` in CSS.
