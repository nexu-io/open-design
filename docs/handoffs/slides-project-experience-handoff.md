# Slides project experience handoff

Date: 2026-07-02
Repo: `/Users/pftom/.superset/worktrees/d3aab1a3-c696-403f-9692-7e5bc2dfa1f3/jumpy-centipede`

This handoff summarizes the full user feedback thread for the Slides / PPT HTML project experience. The goal is to give the next agent enough context to continue product polish without re-deriving the requirements from screenshots.

## Product Goal

Slides are a distinct project type, not just generic HTML preview. A slide-deck HTML file should get a slide-specific viewing, presenting, speaker-notes, thumbnail, and generation flow.

Core principle:

- Deck controls should be programmatic host/template chrome, not bespoke per generated deck.
- Fullscreen and new-tab presentation should feel like a real presentation surface, not an editable preview with visible app controls.
- Speaker notes are first-class per slide: generated when requested, shown in preview/presenter mode, editable in place, and saved per page.
- Thumbnail navigation, current page, presenter notes, and prev/next preview state should all stay synchronized.

## User Feedback Timeline

### 1. Define slides as a unique project type

User asked to focus first on the `slides` scene and described the expected boundary:

- Slides HTML has slide preview with programmatic open/focus controls.
- Left thumbnails can highlight the current slide and switch slides.
- Speaker notes and page count are explicit, editable, and previewable.
- Present mode supports normal fullscreen and speaker mode.
- Presenter view has timer, pause/reset, current page, notes edit, previous/next preview.
- Generation confirmation form should ask whether speaker notes are needed.
- If requested, every generated slide should get speaker notes.

Images:

- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-dZhJSs.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-k6B77f.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-gIwCnU.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-6o0RlS.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-25Uioa.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-XGBFU5.png`

### 2. Deck navigation chrome should be host/template-owned

User clarified that page-turn controls should not be generated dynamically by each deck body. They should come from the PPT skills HTML template or host layer. The same deck should work consistently across project preview, fullscreen, new tab, and presenter mode.

Specific asks:

- Hide unnecessary page-turn button overlays in presentation surfaces.
- Reset should return to slide 1.
- In project preview, do not show duplicate navigation if top toolbar/thumbnails already provide navigation.
- Add thumbnail expand/collapse and thumbnail navigation.
- Navigation control should be small, polished, hover-revealed, and fade away after focus/mouse inactivity.

Images:

- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-NhYkDS.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-HzSIVF.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-F7yJEs.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-jJL97r.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-Va33Fu.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-2NWQ9t.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-zBAucz.png`

### 3. Speaker notes panel requirements

User specified the desired speaker-notes behavior:

- Edit control is a switch button.
- Title row and notes body are separated by a line.
- Notes region should be taller and visually cleaner.
- Editing happens in place.
- On blur, editing should close and auto-save.
- Notes are saved per slide.
- Presenter mode notes text was too large and needed to be reduced.
- Avoid having two different note-edit states.

Images:

- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-y6XSR3.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-M8xXd0.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-4KJkAx.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-5Abte2.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-RTxHk4.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-Osr8jX.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-4arGmf.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-t2BUC1.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-JN82jm.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-umiUzq.png`

### 4. Presentation and fullscreen behavior

User clarified the presentation modes:

- Presenter view should not show extra page-turn overlays on the slide preview itself.
- On first slide in presenter view, show only Next preview; do not show Previous.
- From second slide onward, show both Previous and Next previews.
- Timer, pause, and reset must work; reset returns to slide 1.
- Main presentation/fullscreen should fill the full window and cover the app chrome.
- Esc exits fullscreen.
- In fullscreen and new-tab presentation, do not show exit button or page-turn controls.
- Navigation should happen through keyboard and click zones:
  - Left arrow / click left half goes previous.
  - Right arrow / click right half goes next.
- Fullscreen can show a toast such as "Press Esc to exit".

Images:

- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-OWTXoU.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-DOiMc1.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-Tra8Xt.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-UBdFqC.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-InBoHO.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-eZXB1z.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-Ep6DDk.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-IOW1Me.png`

### 5. Generation and template integration

User asked for generation/template changes:

- The PPT generation question form needs a field asking whether speaker notes are needed.
- The blank `Slide deck` template in the create-page modal should use the same unified base HTML capability, including:
  - programmatic navigation,
  - slide recognition,
  - thumbnails,
  - speaker notes,
  - presenter/fullscreen support.
- The preview/code toggle should be removed for this experience so users perceive the result as a real design, not code.

Images:

- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-ckmKXI.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-hM5kJF.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-nuY6sn.png`

### 6. Late bug reports after implementation

User reported remaining gaps:

- Thumbnail expand/collapse control was in the wrong place. It should be in the top toolbar row; once collapsed, the internal rail button disappears and cannot reopen the rail.
- Presenter view previous/next preview did not update as slides changed. On initialization, first slide should not show Previous.
- Speaker notes edit switch double-triggered and could not toggle.
- Preview fullscreen could not exit via Esc.

Images:

- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-L7mOyP.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-vkdvDp.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-81E3Am.png`
- `/var/folders/5j/fb63hyxj11nblszkmd3vfcjm0000gn/T/codex-clipboard-Ethkx4.png`

## Current Implementation State

The latest patch in this workspace addressed the late bugs above.

Changed areas:

- `apps/web/src/components/FileViewer.tsx`
  - Moved deck thumbnail expand/collapse button into the top viewer toolbar.
  - Kept thumbnail toggle available after the rail is collapsed.
  - Replaced host speaker-note edit label/input with a single switch button.
  - Added in-tab presentation handling for `od:present-escape` messages from the active iframe.
  - Built per-slide presenter preview HTML so Previous/Next can stay synchronized.

- `apps/web/src/runtime/speaker-notes.ts`
  - Added optional `previewHtmlBySlide`.
  - Presenter view uses the correct per-slide frame for current, previous, and next previews.
  - Presenter edit control is a single `button role="switch"`.
  - Edit blur saves and closes.
  - Slide changes clear active editing.

- `apps/web/src/runtime/srcdoc.ts`
  - Injected Escape forwarding from deck iframes to the host via `od:present-escape`.
  - Covers both framework decks and legacy/non-framework deck HTML.

- `apps/web/src/styles/viewer/theater.css`
  - Styled top-toolbar thumbnail toggle.
  - Updated speaker-notes switch styling for button-based switch.
  - Reduced unnecessary rail top padding after moving the toggle.

- `apps/web/src/styles/viewer/composio.css`
  - Kept `.present-exit` hidden so fullscreen/in-tab presentation does not show an exit button.

- Tests updated:
  - `apps/web/tests/runtime/speaker-notes.test.ts`
  - `apps/web/tests/runtime/srcdoc-deck-bridge-framework-deck.test.ts`
  - `apps/web/tests/components/FileViewer.test.tsx`

## Validation Already Run

Run with Node 24:

```bash
PATH=/Users/pftom/.nvm/versions/node/v24.15.0/bin:$PATH pnpm --filter @open-design/web typecheck
PATH=/Users/pftom/.nvm/versions/node/v24.15.0/bin:$PATH pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/runtime/speaker-notes.test.ts tests/runtime/srcdoc-deck-bridge-framework-deck.test.ts tests/components/FileViewer.test.tsx
PATH=/Users/pftom/.nvm/versions/node/v24.15.0/bin:$PATH pnpm guard
PATH=/Users/pftom/.nvm/versions/node/v24.15.0/bin:$PATH pnpm typecheck
git diff --check
```

All passed. The full typecheck emitted existing Astro landing-page hints/warnings but exited successfully.

Manual UI verification was not completed after the last fixes because the machine showed a macOS out-of-application-memory warning, with Electron/Superset processes using unusually high memory. Before heavy browser QA, free memory or restart the relevant app runtime.

## Acceptance Checklist for Next Agent

Use this checklist before considering the slides work complete.

### Deck detection and preview

- Opening a slide-deck HTML shows slide-specific chrome.
- The current slide index is read from URL/hash and persists across reloads where applicable.
- Top toolbar page count/navigation works.
- Left thumbnail rail shows slide thumbnails and highlights the current slide.
- Thumbnail clicks switch the slide.
- Thumbnail rail can be collapsed and reopened from the top toolbar.
- Collapsed rail does not leave an orphan internal toggle button.

### Host navigation chrome

- In normal preview, deck navigation chrome is small and polished.
- Navigation appears on hover/focus and fades after inactivity.
- It does not overlap critical slide content more than necessary.
- Reset returns to slide 1.
- Duplicate deck-body controls are not shown in preview/presentation surfaces.

### Speaker notes in preview

- Speaker notes panel shows `SPEAKER NOTES` plus `Slide X / N`.
- Header and notes body have a clear separator line.
- Notes area is tall enough to be useful.
- Edit is a switch button, not a label-wrapped checkbox that can double-toggle.
- Clicking Edit changes the same region into editable state.
- Blurring the text area auto-saves and exits editing.
- Switching slides saves notes per slide and loads the correct notes for the new slide.

### Presenter view

- Presenter window opens with timer, pause, reset, current page, current slide preview, notes, and adjacent previews.
- Timer counts up and pause freezes/resumes it.
- Reset returns to slide 1.
- First slide shows only Next preview, no Previous preview.
- Middle slides show both Previous and Next previews.
- Last slide shows only Previous preview, no Next preview.
- Previous/Next preview thumbnails update every time the slide changes.
- Speaker notes text size is readable but not oversized.
- Presenter notes edit switch does not double-trigger.
- Presenter note edits save by slide.

### Fullscreen and new tab

- Fullscreen presentation covers the app chrome and browser tab area when native fullscreen is granted.
- No exit button is shown in fullscreen.
- No visible page-turn button overlay is shown in fullscreen.
- `Esc` exits fullscreen/presentation.
- Fullscreen shows only a minimal toast such as `Press Esc to exit` when appropriate.
- Click left half navigates previous; click right half navigates next.
- Left/right keyboard navigation works.
- New tab presentation follows the same no-visible-controls navigation model.

### Generation and templates

- The question form for slide generation asks whether speaker notes are needed.
- If notes are requested, generated deck pages include per-slide speaker notes.
- The blank `Slide deck` template in create-page uses the same slide base capability.
- Preview/Code segmented control is not exposed in the user-facing design preview path if the intent is to present it as a real design artifact.

## High-Risk Areas to Recheck

- Iframe source filtering: `od:present-escape` should only close the active deck presentation iframe, not unrelated iframes.
- Notes save semantics: preserve existing persistence pipeline and avoid writing only to local component state.
- Presenter window sync: if host and popup both navigate, ensure they do not race or drift.
- Memory usage: thumbnails and presenter preview frames can be expensive for large decks. Avoid keeping many live iframes mounted if not necessary.
- Cross-mode consistency: preview, presenter, fullscreen, and new-tab modes should use one shared slide-state model.
- Template integration: generated decks and blank slide templates must use the same base script contract, otherwise behavior will regress for newly created files.

## Suggested Next Optimization Pass

1. Start the app with a clean memory state and manually walk the acceptance checklist.
2. Record short screenshots/GIFs for:
   - thumbnail rail expand/collapse,
   - speaker note edit/blur/save,
   - presenter first/middle/last slide previews,
   - fullscreen Esc exit,
   - new-tab click-zone navigation.
3. Add or extend an e2e test if the repository already has a stable deck-preview Playwright harness.
4. Profile memory if Electron/Superset/Chrome still grow unexpectedly when opening presenter/fullscreen views.
5. Confirm generation prompts and the blank slide-deck template both produce/use the unified slide base capability.
