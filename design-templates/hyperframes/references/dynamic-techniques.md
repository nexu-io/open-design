# Dynamic Caption Techniques

You are here because SKILL.md told you to read this file before writing animation code. Pick your technique combination from the table below based on the energy level you detected from the transcript, then implement using standard GSAP patterns.

## Technique Selection by Energy

| Energy level | Highlight                             | Exit                | Cycle pattern                             |
| ------------ | ------------------------------------- | ------------------- | ----------------------------------------- |
| High         | Karaoke with accent glow + scale pop  | Scatter or drop     | Alternate highlight styles every 2 groups |
| Medium-high  | Karaoke with color pop                | Scatter or collapse | Alternate every 3 groups                  |
| Medium       | Karaoke (subtle, white only)          | Fade + slide        | Alternate every 3 groups                  |
| Medium-low   | Karaoke (minimal scale change)        | Fade                | Single style, vary ease per group         |
| Low          | Karaoke (warm tones, slow transition) | Collapse            | Alternate every 4 groups                  |

**All energy levels use karaoke highlight as the baseline.** The difference is intensity — high energy gets accent color + glow + 15% scale pop on active words, low energy gets a gentle white shift with 3% scale.

**Emphasis words always break the pattern.** When a word is flagged as emphasis (emotional keyword, ALL CAPS, brand name), give it a stronger animation than surrounding words (larger scale, accent color, overshoot ease). This creates contrast.

**Marker highlight modes add a visual layer on top of karaoke.** For emphasis words that need more than color/scale, add a marker-style effect — highlight sweep, circle, burst, or scribble — using the `/marker-highlight` skill. Match mode to energy: burst for hype, circle for key terms, highlight for standard, scribble for subtle.

## Audio-Reactive Captions (Mandatory for Music)

**If the source audio is music (vocals over instrumentation, beats, any musical content), you MUST extract audio data and add audio-reactive animations.** This is not optional — music without audio reactivity looks disconnected. Even low-energy ballads get subtle bass pulse and treble glow.

No special wiring is needed. The group loop already iterates over every caption group to build entrance, karaoke, and exit tweens. At that point, read the audio data for each group's time range and use it to modulate the group's animation intensity with regular GSAP tweens.

```js
// Load audio data inline (same pattern as TRANSCRIPT)
var AUDIO = JSON.parse(audioDataJson); // { fps, totalFrames, frames: [{ bands: [...] }] }

GROUPS.forEach(function (group, gi) {
  var groupEl = document.getElementById("cg-" + gi);
  if (!groupEl) return;

  // Read peak energy for this group's time range
  var startFrame = Math.floor(group.start * AUDIO.fps);
  var endFrame = Math.min(Math.floor(group.end * AUDIO.fps), AUDIO.totalFrames - 1);
  var peakBass = 0;
  var peakTreble = 0;
  for (var f = startFrame; f <= endFrame; f++) {
    var frame = AUDIO.frames[f];
    if (!frame) continue;
    peakBass = Math.max(peakBass, frame.bands[0] || 0, frame.bands[1] || 0);
    peakTreble = Math.max(peakTreble, frame.bands[6] || 0, frame.bands[7] || 0);
  }

  // Modulate entrance — louder groups enter bigger and glowier
  tl.to(
    groupEl,
    {
      scale: 1 + peakBass * 0.06,
      textShadow:
        "0 0 " + Math.round(peakTreble * 12) + "px rgba(255,255,255," + peakTreble * 0.4 + ")",
      duration: 0.3,
      ease: "power2.out",
    },
    group.start,
  );

  // Reset at exit so audio-driven values don't persist
  tl.set(groupEl, { scale: 1, textShadow: "none" }, group.end - 0.15);
});
```

This shapes the animation at build time, not playback time — no per-frame callbacks, no `tl.call()` loops, no async fetch timing issues. Loud groups come in with more weight and glow; quiet groups come in soft. The audio data modulates _how much_, the content determines _what_.

Keep audio reactivity subtle — 3-6% scale variation and soft glow. Heavy pulsing makes text unreadable.

To generate the audio data file:

```bash
python3 skills/gsap-effects/scripts/extract-audio-data.py audio.mp3 --fps 30 --bands 8 -o audio-data.json
```

## Combining Techniques

Don't use the same highlight animation on every group — cycle through styles using the group index. Don't combine multiple competing animations on the same word at the same timestamp. Vary techniques across groups to match the content's pace changes.

**Marker highlight effects** (from the `/marker-highlight` skill) layer well with karaoke — use karaoke for the word-by-word reveal, then add a marker effect on emphasis words only. For example: karaoke highlights each word in white, but brand names get a yellow highlight sweep and stats get a red circle. Cycle marker modes across groups for visual variety (see the mode-to-energy mapping in the marker-highlight skill).

## Available Tools

These tools are available in the HyperFrames runtime. Use them when they solve a real problem — not every composition needs all of them.

| Tool                | What it does                                                              | Access                                                                                         | When it's useful                                                             |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **pretext**         | Pure-arithmetic text measurement without DOM reflow. 0.0002ms per call.   | `window.__hyperframes.pretext.prepare(text, font)` / `.layout(prepared, maxWidth, lineHeight)` | Per-frame text reflow, shrinkwrap containers, computing layout before render |
| **fitTextFontSize** | Finds the largest font size that fits text on one line. Built on pretext. | `window.__hyperframes.fitTextFontSize(text, { maxWidth, fontFamily, fontWeight })`             | Overflow prevention for long phrases, portrait mode, large base sizes        |
| **audio data**      | Pre-extracted per-frame RMS energy and frequency bands.                   | Extract with `extract-audio-data.py`, load inline or via `fetch("audio-data.json")`            | Audio-reactive visuals — modulate intensity based on the music               |
| **GSAP**            | Animation timeline with tweens and callbacks.                             | `gsap.to()`, `gsap.set()`, `tl.to()`, `tl.set()`                                               | All caption animation                                                        |
