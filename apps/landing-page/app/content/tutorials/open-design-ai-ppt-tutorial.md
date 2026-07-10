---
title: 'How to Create an AI-Powered PPT with Open Design: A Hands-on Workshop Tutorial'
summary: A copy-ready written workshop guide for using Open Design to turn raw notes into an editable AI-powered PPT, from visual direction and deck mode through assets, charts, motion, and final QA.
date: 2026-07-09
category: Tutorial
author: Open Design
publicFormat: article
thumbnail: /tutorials/open-design-ai-ppt-tutorial-cover.webp
official: true
---

> **Core idea:** split AI deck creation into controlled steps: choose a style, build an editable deck, then refine it with assets, charts, motion, and comments.

# Before You Start
You can use this workflow for a research report, product pitch, lecture, portfolio presentation, internal strategy memo, event recap, or any other material that needs to become a visual deck. The source material can be one document, several notes, a transcript, a research summary, or even a messy collection of bullet points.

> **Recommended setup:** Open Design installed locally, one connected coding agent or AI agent, and a source document that contains the topic, audience, purpose, and raw content. If your agent can browse, download assets, generate images, and edit code, the workflow becomes much smoother.

## Define the Presentation Purpose First
A presentation is not just a beautiful set of slides. It should help the audience understand something and make a decision, form a judgment, or take action. Before asking Open Design to design anything, write down what the audience should understand and what conclusion they should reach.

### <span id="prompt-0"></span>Prompt 0: Clarify the deck purpose before design

```text
I want to create a presentation about [TOPIC].

Audience:
[DESCRIBE THE AUDIENCE]

The presentation should help the audience understand:
1. [WHAT THEY NEED TO UNDERSTAND]
2. [WHAT CONTEXT OR EVIDENCE THEY NEED]

The presentation should lead the audience to this judgment or decision:
[THE DECISION / BELIEF / ACTION YOU WANT]

Please help me clarify:
1. The core narrative of this presentation.
2. The most important argument.
3. The recommended slide order.
4. What information should be shown visually instead of only as text.

Do not design the slides yet. Do not write HTML yet. Focus only on the story, structure, and decision logic.
```

---

# Step 1: Use Image Mode to Generate One Reference Image with Multiple Styles
<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-image-mode-entry.webp" alt="Open Design Image Mode entry in the prompt composer" width="1600" height="824" loading="lazy" />
  <figcaption>Start from Image Mode when you want one visual reference before building the full deck.</figcaption>
</figure>

The first Open Design step is not to generate the full PPT. Instead, use **Image Mode** to generate one reference image that contains several possible visual directions. This gives the user a choice before committing to a deck style.
This matters because people often do not know the exact name of the style they want. They may not know whether they prefer Swiss typography, brutalist layouts, cyberpunk dashboards, editorial magazine design, product launch visuals, or a clean investor-deck style. A multi-style reference image lets the user compare options visually and choose the style that best matches the message.

> **Important:** in this step, generate only one image. The image should present multiple style options side by side. Do not ask Open Design to create the full deck yet.

### <span id="prompt-1"></span>Prompt 1: Image Mode - generate one image with multiple PPT style options

```text
I am preparing a presentation about [TOPIC].

The audience is:
[AUDIENCE]

The goal of the presentation is:
[GOAL / DECISION / MAIN ARGUMENT]

Please generate ONE single reference image that shows multiple possible visual styles for this PPT.

Requirements:
1. The image should contain 4 to 6 distinct style directions in one composition.
2. Each style direction should look like the cover slide or key visual of the same presentation.
3. The styles should be genuinely different in layout, typography, color, texture, and visual language.
4. Do not create the full PPT yet.
5. Do not make separate images. Put all style options into one image so I can compare them.
6. Each option should have a short style label, such as Swiss editorial, neo-brutalist, glassmorphism, cinematic technology, data magazine, or product launch.

Content to reflect:
[PASTE 5-10 KEY POINTS OR THE DECK OUTLINE]

Make the image useful for choosing the final PPT style.
```

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-style-light.webp" alt="A light Open Design slide image generated in Image Mode" width="1600" height="958" loading="lazy" />
  <figcaption>One reference image can explore a clean, bright presentation style before the deck is built.</figcaption>
</figure>

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-style-dark.webp" alt="A dark Open Design slide image generated in Image Mode" width="1600" height="958" loading="lazy" />
  <figcaption>A contrasting dark direction helps compare visual language, hierarchy, and mood side by side.</figcaption>
</figure>

## How to Choose the Style
After the image is generated, choose one style direction. Do not only choose the prettiest one. Choose the style that best supports the message. A startup pitch may need clarity and confidence. A research talk may need structure and data density. A creative community talk may benefit from stronger visual personality.

<table>
  <thead>
    <tr><th background-color="light-gray">If Your Deck Needs...</th><th background-color="light-gray">Choose a Style That Feels...</th></tr>
  </thead>
  <tbody>
    <tr><td>Trust, strategy, enterprise credibility</td><td>Clean, structured, restrained, editorial</td></tr>
    <tr><td>Energy, community, product momentum</td><td>Bold, vivid, high contrast, expressive</td></tr>
    <tr><td>Technical depth, data, research</td><td>Grid-based, modular, information-dense</td></tr>
    <tr><td>Futuristic AI or developer tooling</td><td>Digital, layered, code-inspired, cinematic</td></tr>
  </tbody>
</table>

### <span id="prompt-1b"></span>Prompt 1B: Ask AI to help choose the best direction

```text
Here is the reference image with multiple style directions.

My presentation topic is [TOPIC].
My audience is [AUDIENCE].
The conclusion I want the audience to reach is [CONCLUSION].

Please compare the style options and recommend the best one.

Evaluate each option by:
1. Whether it supports the message.
2. Whether it fits the audience.
3. Whether it can scale to a full deck.
4. Whether it leaves enough room for text, charts, screenshots, and logos.

Do not generate the deck yet. Help me choose one style direction and explain why.
```

---

# Step 2: Prepare the Slide Structure Before Designing
Before going into Deck Mode, define the slide-by-slide content. This is where many AI presentation workflows fail: they try to design too early. If the text, slide order, and narrative logic are still unclear, every later design edit becomes more expensive.
The goal here is to create a clean content skeleton: slide title, subtitle, key message, supporting points, and any visual requirement. You can use any AI chat tool for this step, or use Open Design chat if that is your preferred workspace.

### <span id="prompt-2"></span>Prompt 2: Create the slide-by-slide content plan

```text
I want to create a PPT about [TOPIC].

Audience:
[AUDIENCE]

The audience should understand:
[WHAT THEY SHOULD UNDERSTAND]

The audience should conclude or decide:
[WHAT THEY SHOULD BELIEVE / DECIDE / DO]

Source material:
[PASTE RAW NOTES, TRANSCRIPT, REPORT, OR BULLET POINTS]

Please create the slide-by-slide content plan.

Requirements:
1. Do not design the slides yet.
2. Do not write the final HTML yet.
3. Create [NUMBER] slides.
4. For each slide, provide:
   - Slide title
   - One-sentence key message
   - Main bullet points
   - Suggested visual element, if useful
   - Whether the slide needs a chart, logo, image, screenshot, or motion
5. Keep each slide focused on one idea.
6. Avoid putting too much text on each slide.

After the outline, create a simple HTML preview that places the text of each slide into a clean layout so I can review the structure before visual design starts.
```

> **Checkpoint:** edit the slide structure now. Change titles, remove weak slides, merge repeated points, and clarify the final conclusion before generating the designed deck.

---

# Step 3: Use Deck Mode to Rebuild the Chosen Image Style as an Editable PPT
<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-deck-mode-entry.png" alt="Open Design Deck Mode selected in the prompt composer" width="2754" height="1576" loading="lazy" />
  <figcaption>Switch to Deck Mode when the goal is an editable presentation, not a single reference image.</figcaption>
</figure>

Now switch to **Deck Mode**. Give Open Design the chosen reference image and the slide-by-slide content. Ask it to rebuild the deck in the visual style of the selected reference, but as editable HTML slides.
This is the key difference between a static image workflow and an Open Design workflow. The output should not be a flat picture. It should be a deck you can inspect, edit, comment on, and continue improving.

### <span id="prompt-3"></span>Prompt 3: Deck Mode - create the first editable deck

```text
I want to create a PPT deck.

Please use the attached reference image as the visual direction.

Important:
1. Recreate the selected style direction from the reference image.
2. Build the PPT as editable HTML-based slides.
3. Keep the slide ratio consistent with the reference image unless I specify otherwise.
4. Preserve the slide text and structure as much as possible.
5. Do not turn the whole deck into static images.
6. Make each slide visually polished, but keep it readable and presentable.

Selected visual style:
[DESCRIBE THE STYLE YOU CHOSE FROM THE IMAGE]

Slide content:
[PASTE THE FINAL SLIDE-BY-SLIDE CONTENT PLAN]

Please generate the first full version of the deck.
```

## What to Expect from the First Version
The first deck may already be useful, but it usually will not fully match the reference image. This is normal. It may have weaker spacing, less texture, less dramatic typography, inconsistent visual density, or simplified layouts. Do not treat the first result as final. Treat it as a working draft.

---

# Step 4: Compare the Generated Deck Against the Reference Image
Instead of saying "make it better", make the AI compare the generated deck with the reference image. This creates a much more specific improvement loop. Ask it to diagnose the gap in layout, typography, texture, visual hierarchy, density, and mood.

### <span id="prompt-4"></span>Prompt 4: Diagnose the visual gap and improve the deck

```text
Here is the original reference image again.

Please compare the current deck with the reference image.

Focus on:
1. Layout structure
2. Typography scale and personality
3. Color palette
4. Spacing and alignment
5. Visual hierarchy
6. Texture, depth, and atmosphere
7. Whether each slide feels like it belongs to the same design system

Do not only say what is different. Please improve the deck directly.

Use all available design and coding capabilities to close the gap while keeping the deck readable and editable.

After making changes, summarize:
1. What you changed.
2. Which slides improved the most.
3. What still needs manual review.
```

> **Workshop insight:** this self-comparison loop is often the moment when the deck starts to feel designed instead of merely generated.

---

# Step 5: Add Real Logos and Brand Assets
AI-generated decks often use text placeholders where real logos, product icons, screenshots, or brand assets should appear. This weakens credibility. Ask Open Design to identify where real assets are needed, search for them, download appropriate versions, and place them into the deck.
For logos, be explicit: use official logos, preserve the original colors, and do not restyle them to match the deck. The deck can have a strong visual style, but brand assets should remain recognizable.

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-brand-assets.webp" alt="A deck slide using real agent and model logos" width="1600" height="964" loading="lazy" />
  <figcaption>Real logos and product assets make the deck feel specific instead of placeholder-driven.</figcaption>
</figure>

### <span id="prompt-5"></span>Prompt 5: Add official logos and brand assets

```text
Please review the entire deck and identify where real external assets should be added.

Look for:
1. Company logos
2. Product logos
3. App icons
4. Platform screenshots
5. Public product images or interface references

Instructions:
1. Search for the appropriate official or high-quality assets.
2. Download and insert them into the relevant slides.
3. Keep logos in their original brand colors.
4. Do not recolor, distort, or redesign official logos.
5. Do not add assets to every slide. Only add them where they improve clarity, credibility, or recognition.
6. Make sure the inserted assets match the layout and do not make the slide crowded.

After updating the deck, tell me:
1. Which slides received new assets.
2. What assets were added.
3. Which assets may need manual verification.
```

## Quality Check for Logos
- [ ] Are all logos recognizable and not distorted?
- [ ] Are official brand colors preserved?
- [ ] Are low-resolution or blurry assets removed?
- [ ] Does each logo support the slide message instead of acting as decoration?

---

# Step 6: Add AI-Generated Images Where They Explain the Argument
After logos and real assets are added, the deck may still need conceptual visuals. These are not brand assets. They are images that help explain a point, create atmosphere, or make an abstract idea easier to understand.
The key is to avoid decorative overuse. Do not ask for images on every slide. Ask the AI to decide which slides actually benefit from image generation, what each image should express, and where it should be placed.

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-ai-visual-example.webp" alt="A slide using AI-generated visual material to support the presentation argument" width="1800" height="1087" loading="lazy" />
  <figcaption>AI-generated visuals should strengthen the slide's argument and make the final deck feel polished.</figcaption>
</figure>

### <span id="prompt-6"></span>Prompt 6: Generate supporting visuals only where useful

```text
Please review the whole deck and decide where AI-generated images would make the presentation clearer or more persuasive.

Instructions:
1. Do not add AI images to every slide.
2. Only add images where they help explain an idea, support an argument, or make a key moment more memorable.
3. Avoid adding images to slides that already have enough visual content.
4. Keep the image style consistent with the chosen deck style.
5. If image generation is available, generate the images and insert them into the deck.
6. If image generation is not available, write the image prompts I should use in another image generation tool.

For each image you add or recommend, tell me:
1. Slide number
2. Purpose of the image
3. The image prompt used
4. Why this slide benefits from an image
```

> **Rule of thumb:** visuals should explain the argument, not decorate the slide. If an image does not make the idea easier to understand, remove it.

---

# Step 7: Use ECharts for Data-Rich Slides
If the deck contains market comparisons, timelines, adoption trends, survey results, technical benchmarks, or research findings, add real charts instead of static images. ECharts is useful because the chart can be embedded into the HTML slide, styled to match the deck, and updated if the data changes.
Ask the AI to scan the deck and identify which slides should use charts. Again, the instruction should be selective. A chart on every slide makes the deck noisy. A few strong charts can make the deck much more credible.

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-echarts-example.webp" alt="A presentation slide with an embedded chart module" width="1600" height="901" loading="lazy" />
  <figcaption>Use charts where the slide needs a clear data story, not just decoration.</figcaption>
</figure>

### <span id="prompt-7"></span>Prompt 7: Add ECharts where data visualization helps

```text
Please scan the entire deck and identify slides where an ECharts visualization would improve understanding.

Use ECharts only where it is genuinely useful.

Consider charts for:
1. Comparisons
2. Trends over time
3. Rankings
4. Market share
5. Adoption curves
6. Survey results
7. Before/after metrics
8. Technical benchmarks

Instructions:
1. Do not add charts to every slide.
2. Choose the best chart type for each relevant slide.
3. Match the chart styling to the deck's visual system.
4. Use concrete data if available.
5. If exact data is missing, use clearly labeled illustrative data and tell me that it needs verification.
6. Place the chart so it supports the slide's key message.

After updating, summarize:
1. Which slides received charts.
2. What chart type was used.
3. What data was used.
4. Which data points need verification.
```

<table>
  <thead>
    <tr><th background-color="light-gray">Content Type</th><th background-color="light-gray">Suggested Chart</th><th background-color="light-gray">Why It Works</th></tr>
  </thead>
  <tbody>
    <tr><td>Market growth</td><td>Line chart or area chart</td><td>Shows direction and momentum.</td></tr>
    <tr><td>Competitive comparison</td><td>Bar chart or radar chart</td><td>Makes differences visible quickly.</td></tr>
    <tr><td>Category share</td><td>Pie, donut, or treemap</td><td>Shows distribution at a glance.</td></tr>
    <tr><td>Workflow stages</td><td>Funnel or stacked bar</td><td>Shows conversion or progression.</td></tr>
  </tbody>
</table>

---

# Step 8: Add Three.js Visual Effects Only Where It Helps
Because Open Design decks are HTML-based, you can add web-native visual effects that traditional slide tools do not easily support. Three.js can create particles, 3D objects, subtle background depth, or spatial motion. Animation libraries can create entrance transitions, hover effects, section changes, or emphasis moments.
Use this carefully. Motion should make the presentation more memorable or easier to understand. It should not make the slides harder to read.

<figure class="ppt-media">
  <video src="/tutorials/open-design-ai-ppt-threejs-demo.mp4" controls playsinline preload="metadata"></video>
  <figcaption>Use web-native motion only when it adds clarity, depth, or memorability to the deck.</figcaption>
</figure>

### <span id="prompt-8a"></span>Prompt 8A: Add subtle Three.js effects

```text
Please scan the deck and identify where a subtle Three.js effect could improve the presentation.

Use Three.js only when it supports the slide's message.

Good uses:
1. A subtle animated background for the opening slide.
2. A 3D metaphor for a key concept.
3. Particle effects that add atmosphere without reducing readability.
4. A spatial visual that helps explain a system, network, or flow.

Instructions:
1. Do not add 3D effects to every slide.
2. Avoid visual clutter.
3. Keep text readable.
4. Keep performance reasonable.
5. Make the effect match the deck's visual style.

After updating, tell me:
1. Which slides received Three.js effects.
2. What effect was added.
3. Why it supports the slide.
4. Whether any effect should be removed for clarity.
```

> **Do not overuse motion.** If the selected deck style is already colorful, dense, or highly expressive, use fewer 3D effects. If the deck style is minimal, subtle motion can add energy without making the design feel messy.

---

# Step 9: Fine-Tune with Comment, Mark, and Edit

## Comments
Use comments when the problem is attached to a specific slide element: a logo feels too large, a label needs different wording, a chart needs more breathing room, or a visual detail should be checked. This keeps feedback close to the exact object that needs work, so the next agent pass can act on the right part of the deck.

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-comment-tool.png" alt="Open Design comment box attached to a selected slide element" width="2154" height="1206" loading="lazy" />
  <figcaption>Element comments are useful for precise feedback on spacing, copy, assets, or visual hierarchy.</figcaption>
</figure>

## Mark
Use Mark when a visual area needs to be called out quickly. This is helpful for layout issues that are easier to show than describe, such as "this group feels too high", "this section should align with the title", or "the selected header needs more contrast".

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-mark-tool.png" alt="Open Design Mark tool highlighting a slide header area" width="2158" height="1210" loading="lazy" />
  <figcaption>Mark makes visual feedback concrete when a layout region needs adjustment.</figcaption>
</figure>

## Edit
Use Edit when you already know the exact local change you want. Select the element, edit the text or style properties directly, and save the refinement without regenerating the whole deck. This is best for final wording, typography, and small layout fixes after the main design system is stable.

<figure class="ppt-media">
  <img src="/tutorials/open-design-ai-ppt-edit-tool.png" alt="Open Design Edit panel editing selected slide text" width="2156" height="1206" loading="lazy" />
  <figcaption>Edit is the fastest path for precise text, typography, and element-level refinements.</figcaption>
</figure>

---

# Step 10: Add Presentation-Level Transitions and Interactions
After the deck content, visuals, charts, 3D details, and local fixes are in good shape, add the final layer: process animation and interaction across the whole PPT. This is different from adding one visual effect to one slide. Here, the goal is to make the deck feel smooth when it is presented from beginning to end.
Think of this as the presentation system: slide transitions, section changes, entrance timing, hover states, click interactions, and subtle emphasis animations. The best version should help the audience follow the story. It should not feel like a demo of animation effects.

> **Use this step last.** If you add global animation too early, later content and layout edits may break the timing. Finish the deck first, then animate the presentation flow.

<figure class="ppt-media">
  <video src="/tutorials/open-design-ai-ppt-motion-demo.mp4" controls playsinline preload="metadata" poster="/tutorials/open-design-ai-ppt-tutorial-cover.webp"></video>
  <figcaption>A short presentation preview shows how slide-level motion feels across the deck.</figcaption>
</figure>

### <span id="prompt-10a"></span>Prompt 10A: Add process animation and interactions to the whole PPT

```text
Please add presentation-level process animation and interaction to the entire deck.

This should make the PPT feel smooth and polished when presented from beginning to end.

Please add:
1. Slide-to-slide transition effects.
2. Section-level transition moments when the topic changes.
3. Entrance animations for key titles, cards, charts, and images.
4. Subtle emphasis animations for the most important message on each slide.
5. Hover or click interactions only where they make sense.
6. Lightweight interactive details for charts, cards, or visual modules where appropriate.

Constraints:
1. Do not animate every element.
2. Do not make the deck flashy or distracting.
3. Keep all text readable and stable.
4. Keep chart labels and data visible.
5. Keep interactions simple enough for a live presentation.
6. Make the animation rhythm consistent across the whole deck.
7. Optimize performance so the deck does not lag during presentation mode.

After adding the animations and interactions, please summarize:
1. The transition style used across the deck.
2. Which slides received custom interaction.
3. Which slides received special entrance or emphasis animation.
4. Any slides where animation should be reduced or manually checked.
```

<table>
  <thead>
    <tr><th background-color="light-gray">Animation Type</th><th background-color="light-gray">Good Use</th><th background-color="light-gray">Avoid</th></tr>
  </thead>
  <tbody>
    <tr><td>Slide transition</td><td>Signaling movement from one idea to the next</td><td>Using a different transition on every slide</td></tr>
    <tr><td>Section transition</td><td>Marking a major shift in the story</td><td>Making small topic changes feel too dramatic</td></tr>
    <tr><td>Entrance animation</td><td>Revealing hierarchy in titles, cards, and charts</td><td>Animating every paragraph or bullet point</td></tr>
    <tr><td>Hover / click interaction</td><td>Letting the speaker reveal optional detail</td><td>Hiding essential information behind interactions</td></tr>
  </tbody>
</table>

---

# Final Export and Presentation Notes
Because this workflow can include real assets, generated images, charts, 3D effects, and motion, export choices matter. If you export to a traditional slide format, some visual effects may be lost or rebuilt. If you export to static images or PDF, the visual design may be preserved but animations and interactions will not work.

<table>
  <thead>
    <tr><th background-color="light-gray">Format</th><th background-color="light-gray">Best For</th><th background-color="light-gray">Trade-off</th></tr>
  </thead>
  <tbody>
    <tr><td>Present in Open Design</td><td>Keeping motion, HTML layout, charts, and interactive effects</td><td>Requires presenting from the Open Design environment</td></tr>
    <tr><td>PDF or images</td><td>Sharing a stable visual version</td><td>Motion and interaction are lost</td></tr>
    <tr><td>PPTX</td><td>Compatibility with traditional presentation tools</td><td>Complex HTML visuals may not convert perfectly</td></tr>
    <tr><td>HTML</td><td>Web-native sharing and archiving</td><td>External assets and generated effects need careful verification</td></tr>
  </tbody>
</table>

> **Recommended approach:** if the deck uses charts, 3D, and motion, present directly in Open Design when possible. If you need a shareable backup, export a PDF or image version after the final QA pass.

---

# Complete Prompt Library
Use this section as a compact copy-and-paste reference. Replace the bracketed variables with your own topic, audience, content, and constraints.

<table>
  <thead>
    <tr><th background-color="light-gray">Prompt</th><th background-color="light-gray">Use It When</th><th background-color="light-gray">Where</th></tr>
  </thead>
  <tbody>
    <tr><td><a href="#prompt-0">Prompt 0</a></td><td>You need to clarify the story and decision logic.</td><td>Any AI chat</td></tr>
    <tr><td><a href="#prompt-1">Prompt 1</a></td><td>You need one image with multiple visual style options.</td><td>Open Design Image Mode</td></tr>
    <tr><td><a href="#prompt-1b">Prompt 1B</a></td><td>You want AI to help choose the best visual direction.</td><td>Open Design chat or any AI chat</td></tr>
    <tr><td><a href="#prompt-2">Prompt 2</a></td><td>You need a slide-by-slide content plan.</td><td>Any AI chat</td></tr>
    <tr><td><a href="#prompt-3">Prompt 3</a></td><td>You are ready to create the first editable deck.</td><td>Open Design Deck Mode</td></tr>
    <tr><td><a href="#prompt-4">Prompt 4</a></td><td>The first deck needs to become closer to the reference image.</td><td>Open Design chat</td></tr>
    <tr><td><a href="#prompt-5">Prompt 5</a></td><td>You need real logos and product assets.</td><td>Open Design chat</td></tr>
    <tr><td><a href="#prompt-6">Prompt 6</a></td><td>You want AI-generated images only where useful.</td><td>Open Design chat</td></tr>
    <tr><td><a href="#prompt-7">Prompt 7</a></td><td>You need charts for data-heavy slides.</td><td>Open Design chat</td></tr>
    <tr><td><a href="#prompt-8a">Prompt 8A</a></td><td>You want restrained 3D visual effects.</td><td>Open Design chat</td></tr>
    <tr><td><a href="#prompt-10a">Prompt 10A</a></td><td>You are ready to add final process animation and interaction to the whole PPT.</td><td>Open Design presentation / chat</td></tr>
  </tbody>
</table>
