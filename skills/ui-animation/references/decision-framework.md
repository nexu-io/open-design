# Animation Decision Framework

## Contents
- [1. Should this animate at all?](#1-should-this-animate-at-all)
- [2. What is the purpose?](#2-what-is-the-purpose)
- [3. What easing should it use?](#3-what-easing-should-it-use)
- [4. How fast should it be?](#4-how-fast-should-it-be)
- [Finding opportunities: where motion is missing](#finding-opportunities-where-motion-is-missing)

Answer these four questions in order before writing animation code. SKILL.md carries the duration table, the named curves, and the pattern-to-recipe map; this file is the reasoning that picks between them.

## 1. Should this animate at all?

**How often will users see this animation?**

| Frequency | Examples | Decision |
|---|---|---|
| 100+ times/day | Keyboard shortcuts, command palette toggle | No animation. Ever. |
| Tens of times/day | Hover effects, list navigation | Remove or drastically reduce |
| Occasional | Modals, drawers, toasts | Standard animation |
| Rare / first-time | Onboarding, feedback forms, celebrations | Can add delight |

**Novelty budget.** Keep most of a surface familiar: about 90% expected motion (or none) and 10% novel treatment. Do not stack high-novelty beats in consecutive sections; put quiet structure between them.

**One-shot only.** First-run staggers, intro morphs, and login flourishes must not replay on every visit. Gate them with a cookie, local flag, or rewrite so a reload is instant.

## 2. What is the purpose?

Answer "why does this animate?" before writing code.

| Purpose | Description | Example |
|---|---|---|
| **Feedback** | Confirms user action was received | Button scale on press, toggle state |
| **Orientation** | Shows spatial relationship | Drawer slides from edge, menu scales from trigger |
| **Continuity** | Preserves context across state changes | Page transitions, layout shifts |
| **Delight** | Adds personality (use sparingly) | Stagger reveals, spring overshoot |

## 3. What easing should it use?

Two cases the named curves in SKILL.md do not cover:

- **Needs physics feel?** → spring ([spring-animations.md](spring-animations.md))
- **Constant motion (marquee, spinner)?** → `linear`

Match curve strength to size and frequency: weaker curves (quad, cubic) for small or frequent elements, stronger curves (quint, expo) for large or rare transitions. Full named catalogue at [easing.dev](https://easing.dev/), stronger custom variants at [easings.co](https://easings.co/).

### Asymmetric vs symmetric curves

Symmetric ease-in-out starts slow: a noticeable lag between the user's action and the element beginning to move. For interactive elements (drawers, panels, menus), use asymmetric curves, steep at the start and settling slowly, to preserve responsiveness while the slow deceleration adds quality. A steep curve covers most of its distance in the first third, so the same 200ms reads as significantly faster.

Duration and easing are inseparable: a steep curve affords a longer duration because the movement is front-loaded. Vaul's drawer uses 500ms with `cubic-bezier(0.32, 0.72, 0, 1)` but doesn't feel slow, covering most of its distance in the first 200ms.

## 4. How fast should it be?

Duration changes perceived performance independently of actual speed:

- A fast-spinning spinner makes loading feel faster (same elapsed time, different perception)
- `ease-out` at 200ms _feels_ faster than `ease-in` at 200ms: the user sees immediate movement
- Instant tooltips after the first opens (skip delay and animation) make the whole toolbar feel faster

## Finding opportunities: where motion is missing

For "where should this animate", not "animate this". The pass reports and never implements: a surviving suggestion goes back to the SKILL.md workflow to be built.

```text
Discovery progress:
- [ ] Step 1: Recon the stack, existing motion tokens, and product personality
- [ ] Step 2: Sweep every seam class below
- [ ] Step 3: Gate each candidate through questions 1 and 2
- [ ] Step 4: Report survivors and rejections
```

**Recon first.** Identify the motion library (if any), the easing and duration tokens already in use, and how often each surface is visited. Suggestions extend the existing vocabulary rather than introducing a parallel one, and a dense dashboard earns fewer and subtler suggestions than a playful consumer app.

Questions 1 and 2 above judge a candidate someone already proposed. The sweep produces candidates in the first place: given an interface, where would motion genuinely help? Run every hit back through questions 1 and 2, and expect to reject most of them. A short list of high-conviction opportunities beats a long wishlist, and an opportunity finder that suggests motion everywhere produces exactly the sluggish, over-animated interfaces the rest of this skill exists to prevent.

Sweep these seam classes. The skill is done sweeping when each has either yielded candidates with `file:line` evidence or been explicitly cleared.

| Seam | What it looks like | Where to grep |
|---|---|---|
| Feedback gap | A pressable control with no press state | `onClick` / `onPress` on elements with no `:active`, `active:`, or transition |
| Teleporting state | Content that swaps, appears, or vanishes with no bridge | `{isOpen &&`, `{show`, `display: none` toggles, accordions and collapses with no height or opacity transition |
| Missing spatial story | A surface with no connection to what opened it | Popovers, menus, and panels with no `transform-origin` at the trigger; dismissable surfaces that exit by a different path than they entered |
| Group entrance | An occasionally-viewed grid or list that pops in whole | `.map(` renders on first-load surfaces, where a 30-50ms stagger would help |
| Gesture seam | Draggable or swipeable elements that snap with no physics | Drag and pointer handlers with no spring, no velocity-based dismissal, no rubber-banding at boundaries |
| Flat delight moment | Rare, high-emotion states rendered without any motion | First-run, empty, success, and completion components |

The last row is where the delight budget lives, and it is the only tier where bounce, generous stagger, or a longer beat are welcome.

**Report both halves.** A discovery pass caps at five to seven suggestions ordered by leverage, each with `file:line`, what happens today, the named purpose, the frequency tier, and exact values (property, duration, curve) from the SKILL.md easing and transition tables, closing with the single highest-leverage one; and it must also list two to five places deliberately *not* suggested, each naming the question that killed it ("command palette open/close: keyboard-initiated, 100+/day, never animate"). The rejected list is what separates a discovery pass from an animation wishlist. Where the interface is already close to right, saying so is the correct result, not a failure.
