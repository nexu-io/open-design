---
name: skill-mengto-landing
description: High-converting single-offer landing page: outcome headline, one primary CTA, proof next to claims, benefits over features, 3-step flow, FAQ objection handling, risk reversal.
---

# High-Conversion Landing Page

A landing page is not a homepage. It wins one intent: one offer, one audience, one primary action. Structure and copy do the converting; the visual design's job is hierarchy and pacing.

## When to use

- Briefs mentioning "landing page", "conversion", "signup page", "waitlist", "trial", "sales page"
- Single-offer SaaS/app/service pages, ad or launch destinations
- Rewriting a page that lists features but does not convert

## Structure (in order)

1. **Above the fold:** headline (outcome + audience), subheadline (clarifies how, adds specificity), primary CTA (verb + what they get), one proof signal (logo strip / stat / short testimonial), product visual.
2. **Mid page:** problem to solution section; 3-5 outcome-driven benefits ("Benefit, then proof/detail"); how it works in 3 steps; social proof (testimonials with names, roles, specifics).
3. **Bottom:** FAQ (6-12 real objections answered plainly); risk reversal (trial / no card / cancel anytime / guarantee); final CTA repeating the top offer.

## Style rules

- **One primary CTA** repeated top and bottom; secondary actions are visually quiet. Never two competing CTAs above the fold. CTA copy = verb + outcome ("Start free trial", "Get the checklist"), never "Learn more" or "Submit".
- **Specificity beats adjectives.** "Cut weekly reporting from 4 hours to 15 minutes", not "save time and streamline". Concrete numbers in headline, stats, and testimonials.
- **Proof sits next to the claim it supports**, not buried in the footer. Stat chips, named testimonials with role and company, a customer count under the CTA.
- **Benefit-first copy.** Features say what it does; each section leads with what that means for the visitor.
- **Visual pacing.** Alternate section rhythm (text-left/visual-right, full-width proof band, tight FAQ column ~640px). Strong type hierarchy: hero ~clamp(2.4rem, 5vw, 3.8rem) bold tight-tracked, section titles ~1.9rem, body 16-17px muted. Single accent color used for CTA, links, and key numbers only.
- **Risk reversal is explicit:** its own strip near the final CTA (free tier, no card, cancel anytime, or guarantee), plus a one-line reassurance under every CTA button.
- **FAQ is objection handling,** not documentation: price, migration, security, "what if it doesn't work for us", cancellation.

## Anti-patterns

- Multiple offers or competing CTAs above the fold
- Vague value props ("streamline", "optimize", "empower your workflow")
- Big feature lists with no outcomes; proof hidden at the bottom
- Design spectacle that outshouts the CTA (busy gradients, five accent colors)
- Weak closers: pages that end in a footer instead of a final CTA

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Adapted from https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/landing-page (MIT)
