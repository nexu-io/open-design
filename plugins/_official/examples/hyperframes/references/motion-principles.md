# Motion Principles

## Guardrails

You know these rules but you violate them. Stop.

- **Don't use the same ease on every tween.** You default to `power2.out` on everything. Vary eases like you vary font weights — no more than 2 independent tweens with the same ease in a scene.
- **Don't use the same speed on everything.** You default to 0.4-0.5s for everything. The slowest scene should be 3× slower than the fastest. Vary duration deliberately.
- **Don't enter everything from the same direction.** You default to `y: 30, opacity: 0` on every element. Vary: from left, from right, from scale, opacity-only, letter-spacing.
- **Don't use the same stagger on every scene.** Each scene needs its own rhythm.
- **Don't use ambient zoom on every scene.** Pick different ambient motion per scene: slow pan, subtle rotation, scale push, color shift, or nothing. Stillness after motion is powerful.
- **Don't start at t=0.** Offset the first animation 0.1-0.3s. Zero-delay feels like a jump cut.

## What You Don't Do Without Being Told

### Easing is emotion, not technique

The transition is the verb. The easing is the adverb. A slide-in with `expo.out` = confident. With `sine.inOut` = dreamy. With `elastic.out` = playful. Same motion, different meaning. Choose the adverb deliberately.

**Direction rules — these are not optional:**

- `.out` for elements entering. Starts fast, decelerates. Feels responsive. This is your default.
- `.in` for elements leaving. Starts slow, accelerates away. Throws them off.
- `.inOut` for elements moving between positions.

You get this backwards constantly. Ease-in for entrances feels sluggish. Ease-out for exits feels reluctant.

### Speed communicates weight

- Fast (0.15-0.3s) — energy, urgency, confidence
- Medium (0.3-0.5s) — professional, most content
- Slow (0.5-0.8s) — gravity, luxury, contemplation
- Very slow (0.8-2.0s) — cinematic, emotional, atmospheric

### Scene structure: build / breathe / resolve

Every scene has three phases. You dump everything in the build and leave nothing for breathe or resolve.

- **Build (0-30%)** — elements enter, staggered. Don't dump everything at once.
- **Breathe (30-70%)** — content visible, alive with ONE ambient motion.
- **Resolve (70-100%)** — exit or decisive end. Exits are faster than entrances.

### Transitions are meaning

- **Crossfade** = "this continues"
- **Hard cut** = "wake up" / disruption
- **Slow dissolve** = "drift with me"

You crossfade everything. Use hard cuts for disruption and register shifts.

### Choreography is hierarchy

The element that moves first is perceived as most important. Stagger in order of importance, not DOM order. Don't wait for completion — overlap entries. Total stagger sequence under 500ms regardless of item count.

### Asymmetry

Entrances need longer than exits. A card takes 0.4s to appear but 0.25s to disappear.

## Visual Composition

You build for the web. Video frames are not pages.

- **Two focal points minimum per scene.** The eye needs somewhere to travel. Never a single text block floating in empty space.
- **Fill the frame.** Hero text: 60-80% of width. You will try to use web-sized elements. Don't.
- **Three layers minimum per scene.** Background treatment (glow, oversized faded type, color panel). Foreground content. Accent elements (dividers, labels, data bars).
- **Background is not empty.** Radial glows, oversized faded type bleeding off-frame, subtle border panels, hairline rules. Pure solid #000 reads as "nothing loaded."
- **Anchor to edges.** Pin content to left/top or right/bottom. Centered-and-floating is a web pattern.
- **Split frames.** Data panel on the left, content on the right. Top bar with metadata, full-width below. Zone-based layouts, not centered stacks.
- **Use structural elements.** Rules, dividers, border panels. They create paths for the eye and animate well (scaleX from 0).
