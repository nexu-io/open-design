# Interface SFX

Sparse confirmation sounds for rare, high-stakes, or physical-feeling interactions.

## Scope

- **IS:** sparse confirmation sounds for rare, high-stakes, or physical-feeling interactions (toggle lock, payment confirm, drag release, success moment).
- **IS NOT:** background music, autoplay, looping UI beds, or replacing visual feedback.

## Rules

1. **Unlock from a user gesture.** Create or resume `AudioContext` only inside a click, tap, or keydown handler. Never on page load or in `useEffect` without a gesture.
2. **Stay quiet.** Keep volume well below content audio. Respect system mute and tab mute; if the tab is muted, do not play.
3. **Additive only.** Pair every sound with visual feedback (scale, color, icon swap). Sound confirms what the user already sees; it never carries the message alone.
4. **Same frequency rule as motion.** High-frequency actions stay silent: typing, hover, scrolling, list navigation, repeated toggles. If the user does it dozens of times per session, no sound.
5. **Honor `prefers-reduced-motion`.** Treat it as a signal to skip optional SFX unless the user explicitly enabled sounds in settings.
6. **Keep clips tiny.** Tens of milliseconds, soft attack, no peak that clips. One-shot, non-looping.
7. **One owner.** Route all playback through a tiny `play(id)` helper (preload, volume, mute checks, reduced-motion gate). No ad-hoc `new Audio()` at call sites.

## Implementation sketch

```javascript
let ctx;

function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
}

function playSfx(id) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!ctx || ctx.state !== 'running') return;
  // fetch decoded buffer for id, set gain ~0.1-0.2, play once
}
```

Wire `unlockAudio` to the first meaningful interaction on the surface that uses SFX.

## Sources

Informed by Craft (gustavo-fior Interface SFX) and Raphael Salaja's writing on web sound. Original prose; not copied.
