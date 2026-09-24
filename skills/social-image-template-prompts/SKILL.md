---
name: social-image-template-prompts
description: Create high-performing social-media graphics and reusable image prompts from a person's reference photo. Use when a user needs Facebook, Instagram, LinkedIn, or short-form social visuals with supplied copy or automatically generated viral hooks based on a niche and topic.
---

# Social Image Template Prompts

Create premium, scroll-stopping social graphics from an uploaded reference photo. Use the image as the subject reference, preserve the person’s recognizable identity, and build a new composition or safely localize a matching existing graphic according to the request.

## Input Decision

Collect the reference image, platform/aspect ratio, niche, topic, audience, and either custom copy or permission to generate copy. Use the reference aspect ratio when no destination is named.

- If the user supplies headline copy, reproduce it exactly.
- If no copy is supplied, generate one concise viral hook plus supporting text based on the niche, topic, and intended audience.
- If the user asks to reuse an existing graphic, preserve the visual system and change only the requested text.
- If the user provides a person photo, create a new composition around that person; do not treat a face reference as a text-edit target.

## Hook Generation

Write copy that earns attention without bait-and-switch claims.

1. Make the headline concrete, specific, and legible in five to ten words when possible.
2. Use a single hook angle: curiosity, warning, contrarian insight, result, comparison, or transformation.
3. Add a short supporting line that clarifies the payoff.
4. Avoid unsupported guarantees, fake urgency, vague superlatives, and excessive punctuation.

## Prompt Schema

```text
Use case: <identity-preserve | text-localization>
Asset type: <platform> social-media graphic
Input image: <person reference | existing graphic edit target>
Primary request: <new graphic or exact text replacement>
Niche/topic/audience: <details>
Text (verbatim): "<headline>" / "<supporting text>"
Scene and composition: <new setting/layout, or the reference layout to preserve>
Style: cinematic, premium, scroll-stopping; match the requested palette and typography treatment.
Constraints: preserve the person's recognizable identity; preserve all named reference elements and unchanged copy exactly.
Avoid: misspellings, extra words, altered faces, distorted hands, watermarks, logos not in the reference, cropped text, unreadable small type, misleading claims.
```

## Mobile Readability

- Keep essential copy inside the central 80% of a square or feed graphic; for vertical formats, keep it inside the central 70%.
- Use the fewest lines that remain readable at thumbnail size; split long phrases by meaning.
- Preserve safe margins of at least 6–8% from every edge.
- Maintain high contrast between text and background. Never cover the subject’s face with the headline.

Read [platform-formats.md](references/platform-formats.md) when the user names a destination platform.

## Reusable Facebook Example

Use this pattern when replacing multiple text blocks in an existing creator graphic. Preserve the creator, composition, lighting, typography style, and layout while changing only the named copy.

```text
Use case: text-localization
Asset type: Facebook viral social graphic
Input image: edit target
Primary request: Replace all headline text while preserving the existing visual style.
Text (verbatim):
Badge: "10X MORE LEADS"
Main Headline: "THIS AI AGENT" / "RUNS MY" / "ENTIRE BUSINESS"
Subheadline: "WHILE I SLEEP"
Bottom Banner: "HERE'S HOW TO BUILD YOURS"
Layout: Maintain the reference hierarchy. Keep the badge upper-right, the username badge beneath the subject, the oversized headline centered, supporting text directly below it, and the CTA banner across the bottom.
Style: Preserve the cinematic lighting, orange and pink neon glow, bold 3D typography, dramatic contrast, facial expression, background, composition, color palette, and premium social-media aesthetic.
Constraints: Preserve the subject's identity, pose, hands, clothing, camera angle, background, lighting, depth of field, typography style, spacing, and composition. Only replace the requested text.
Avoid: misspellings, cropped text, unreadable typography, altered face, changed pose, extra graphics, watermarks, logos not already present, or changes to any visual element other than the requested copy.
```

## High-Authority Press-Conference Example

Use this pattern for a high-authority editorial graphic. Preserve the subject, composition, camera angle, setting, lighting, typography style, and visual hierarchy while replacing only the named copy.

```text
Use case: text-localization
Asset type: Facebook viral social graphic
Input image: edit target
Primary request: Replace all copy while preserving the existing design and composition.
Text (verbatim):
Headline: "R.I.P." / "YOUR COMPETITION."
Supporting Copy: "I BUILT AN AI SYSTEM" / "THAT RUNS MY" / "ENTIRE BUSINESS."
Accent Text: "WITHOUT HIRING"
Bottom CTA: "HERE'S HOW TO BUILD YOURS FREE"
Layout: Keep the oversized headline on the left occupying approximately the same space. Preserve the stacked hierarchy, spacing, margins, and overall balance. Keep the CTA lower-left and maintain safe mobile margins.
Style: Preserve the premium cinematic press-conference aesthetic, dramatic flash photography, black wardrobe, realistic skin tones, luxury editorial lighting, bold condensed typography, metallic and gold accent treatments, shallow depth of field, microphone foreground, and overall visual language.
Constraints: Preserve the subject's identity, facial features, sunglasses, hairstyle, pose, clothing, camera angle, press background, microphones, lighting, color grading, composition, and typography style. Replace only the requested text.
Avoid: misspellings, altered identity, different pose, cropped text, unreadable typography, extra graphics, watermarks, logos not already present, or unnecessary layout changes.
```

## Deliverable

Return the final production prompt and, when image generation is available, generate exactly one final image. State whether the copy was supplied or generated and provide the saved image path.
