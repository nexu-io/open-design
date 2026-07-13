# Open Design Manual Edit Mode Requirements

## Purpose

This document records the accepted manual edit-mode model from `apps/edit-mode-demo` so it can be migrated into the main Open Design web app.

The key product decision is:

- `Comment AI` is the AI-assisted editing path.
- `Edit` is the manual HTML/CSS editing path.
- `Tweaks` is the global parameter/token editing path.
- `Draw` is a visual annotation path, not direct source editing.

Manual edit mode must let users modify the rendered page directly while keeping the project source file as the only source of truth.

## Product Boundary

### Edit Mode

Edit mode is a manual editor for the current artifact.

Users should be able to:

- Select elements from the live preview canvas.
- Select elements from a left-side layer list.
- Edit element content.
- Edit element style.
- Edit element attributes.
- Edit selected element HTML.
- Edit the full artifact source when necessary.
- Apply, cancel, undo, redo, reset, and inspect changes.

Edit mode must not call an AI agent automatically. Any AI-assisted change belongs to `Comment AI`.

### Comment AI Mode

Comment AI mode is the scoped agent-edit path:

- User selects a preview element.
- User writes an instruction.
- The comment is attached to chat.
- Agent patches source.
- User reviews the result.

This feature must remain separate from manual edit mode.

### Tweaks Mode

Tweaks mode is for global or generated parameters:

- CSS tokens.
- Theme parameters.
- Density.
- Type scale.
- Accent colors.

Tweaks can share the same patch/history infrastructure as edit mode, but the UX should be global, not selected-element specific.

### Draw Mode

Draw mode is for annotation and review input. It should not mutate HTML/CSS directly in v1.

## Layout Requirements

The accepted layout uses a three-region editor composition.

### Left Rail

Purpose: mode switching and layer navigation.

Required sections:

- Product/header block.
- Mode buttons:
  - `Preview`
  - `Edit`
  - `Comment AI`
  - `Tweaks`
  - `Draw`
- `Layers` list showing selectable elements from the artifact.

Layer rows must show:

- Human-readable label.
- Element kind.
- Stable id or generated path.
- Selected state.

The layer list should prioritize meaningful elements but may include generated container layers when source elements do not have explicit ids.

### Center Canvas

Purpose: live artifact preview.

Required behavior:

- Render artifact in sandboxed iframe.
- Preserve Open Design's existing preview model.
- In edit mode, selectable elements show subtle outlines.
- Hovered/selectable elements should feel discoverable without overwhelming the artifact.
- Center toolbar includes:
  - active mode/status
  - source line count or file identity
  - undo
  - redo
  - show/hide source
  - reset

The canvas stays primary. The editor should not feel like a code-only page.

### Right Edit Modal

Purpose: focused properties editor for the selected element.

Required parts:

- Modal header:
  - small kicker: `Manual editor`
  - selected element label
  - element kind badge
- Selected element metadata:
  - tag name
  - element id/path
  - class name if present
- Tabs:
  - `Content`
  - `Style`
  - `Attributes`
  - `Html`
  - `Source`
- Pinned action footer:
  - `Cancel`
  - tab-specific apply button

The modal should be visually separated from the canvas and left rail, using a stronger shadow and clear header/footer zones.

### Changes Panel

Purpose: lightweight patch history.

Required behavior:

- Shows patch count.
- Shows newest changes first.
- Shows readable patch label.
- Shows raw patch payload for debugging during development.
- In production, raw payload can be folded behind a details control.

## Selection Model

The preview iframe is the selection surface, not the state owner.

Selection bridge requirements:

- Inject an edit bridge into the iframe `srcDoc`.
- Host sends `od-edit-mode` to enable or disable edit mode.
- Iframe sends:
  - `od-edit-targets`
  - `od-edit-select`
- The bridge must discover meaningful body elements.
- Explicitly annotated elements are preferred:
  - `data-od-id`
  - `data-od-edit`
  - `data-od-label`
- If no explicit id exists, generate a stable DOM-path id such as `path-0-1-2`.

Supported target kinds:

- `text`
- `link`
- `image`
- `container`
- `token`

Each target should include:

- `id`
- `kind`
- `label`
- `tagName`
- `className`
- `text`
- `rect`
- `fields`
- `attributes`
- `styles`
- `outerHtml`

## Editing Capabilities

### Content Tab

For text-like elements:

- Edit text content.
- Apply via `set-text`.

For links/buttons:

- Edit label.
- Edit `href` when applicable.
- Apply via `set-link`.

For images:

- Edit `src`.
- Edit `alt`.
- Apply via `set-image`.

Container text editing is allowed in the prototype, but production should be careful: editing container `textContent` may collapse child structure. For production, prefer content editing only for leaf or mostly-text elements.

### Style Tab

Style edits should write inline styles to the selected element in v1.

Supported fields:

- text color
- background color
- font size
- font weight
- text alignment
- padding
- margin
- border radius
- border
- width
- min height

Apply via `set-style`.

Rules:

- Empty style values remove that inline property.
- Non-empty values set the corresponding CSS property.
- Browser-normalized CSS serialization is acceptable.
- Style controls should be small and scannable.

Future production improvement:

- Prefer CSS variable/token editing when the artifact exposes safe tokens.
- Offer class/style extraction later, not in v1.

### Attributes Tab

Attributes are edited as JSON in the prototype.

Apply via `set-attributes`.

Rules:

- Attribute updates are additive/update-only by default.
- Omitted attributes must not be deleted.
- Empty string values remove that attribute.
- Protected attributes must not be removed or overwritten by ordinary attribute edits:
  - `data-od-id`
  - `data-od-edit`
  - `data-od-label`
  - runtime-only ids
- Invalid attribute names are ignored.

This rule is important because attribute edits must not accidentally remove style/content changes made earlier.

### Html Tab

Allows editing the selected element's `outerHTML`.

Apply via `set-outer-html`.

Rules:

- Replacement HTML must parse to one element.
- Preserve existing `data-od-id` when replacement omits it.
- Preserve existing `data-od-edit` when replacement omits it.
- Do not use this as the default editing path for casual users.
- Treat it as an advanced escape hatch.

### Source Tab

Allows editing the full artifact source.

Apply via `set-full-source`.

Rules:

- This is an advanced escape hatch.
- It should be available when the inspector cannot express the desired edit.
- Production should add validation and recovery before writing the file.

## Patch Model

The source file is the source of truth.

Patch types:

```ts
type EditPatch =
  | { id: string; kind: 'set-text'; value: string }
  | { id: string; kind: 'set-link'; text: string; href: string }
  | { id: string; kind: 'set-image'; src: string; alt: string }
  | { id: string; kind: 'set-token'; token: string; value: string }
  | { id: string; kind: 'set-style'; styles: Partial<EditableStyles> }
  | { id: string; kind: 'set-attributes'; attributes: Record<string, string> }
  | { id: string; kind: 'set-outer-html'; html: string }
  | { kind: 'set-full-source'; source: string };
```

History entry shape:

```ts
interface EditHistoryEntry {
  id: string;
  label: string;
  patch: EditPatch;
  beforeSource: string;
  afterSource: string;
  createdAt: number;
}
```

Undo/redo can initially use full-source snapshots. Later it can be optimized to patch inversion.

## Source Patching Rules

Source patching should be handled outside the iframe.

Patch flow:

1. User selects target from iframe or layer list.
2. Host reads the current source document.
3. Host fills inspector draft from source and target metadata.
4. User edits fields.
5. User applies a patch.
6. Patch transforms the source string.
7. Host updates source state.
8. Preview iframe reloads from updated `srcDoc`.
9. History records before/after source.

Production migration should move this from demo state into project file persistence:

- Read active project file.
- Apply patch.
- Save file through existing project file API/provider.
- Refresh preview.
- Add history entry.

## Validation Requirements

Minimum v1 validation:

- Do not apply patches if target cannot be found.
- Reject invalid attributes.
- Preserve protected attributes.
- Reject `outerHTML` replacement that does not produce one element.
- Preserve selected id after HTML replacement where possible.
- Keep undo/redo usable after every patch.

Recommended validation before production:

- HTML parse check.
- Basic artifact lint after full-source or HTML edits.
- Detect and warn if editing container text would erase child markup.
- Warn when image URL is empty.
- Warn when `href` is empty or malformed.

## Persistence Requirements

The prototype stores source in React state. Production must persist to the active project file.

Required production persistence behavior:

- Patch the active file content.
- Save through existing project file write API.
- Refresh file list and active tab content.
- Refresh preview.
- Keep current selection if the selected id still exists.
- Clear selection if the target no longer exists.
- Record change history in memory initially.

Optional later:

- Persist edit history per conversation/project.
- Add named snapshots.
- Add compare/diff view.

## Accessibility and Interaction Requirements

Required:

- Mode buttons use tab semantics.
- Inspector tabs use tab semantics.
- Inputs have labels.
- Keyboard users can apply/cancel from the inspector.
- Undo/redo buttons reflect disabled state.
- Selected layer is visually distinct.

Recommended:

- Keyboard shortcut for edit mode.
- Escape cancels active draft.
- Enter or Cmd/Ctrl+Enter applies draft where safe.
- Search/filter layers.

## Visual Design Requirements

The accepted design direction:

- Quiet editor UI.
- Canvas-first.
- Figma-like structure:
  - left layers
  - center canvas
  - right properties modal
- Open Design-specific mode rail:
  - Preview
  - Edit
  - Comment AI
  - Tweaks
  - Draw
- Right modal should feel focused and slightly elevated.
- Avoid marketing-page styling.
- Avoid decorative gradients or large hero styling.
- Keep controls dense but readable.
- Use 8px radius or less.

## Migration Targets

Prototype files to migrate from:

- `apps/edit-mode-demo/src/editTypes.ts`
- `apps/edit-mode-demo/src/editBridge.ts`
- `apps/edit-mode-demo/src/sourcePatches.ts`
- `apps/edit-mode-demo/src/EditModeDemo.tsx`
- `apps/edit-mode-demo/app/styles.css`

Likely production destinations:

- `apps/web/src/edit-mode/types.ts`
- `apps/web/src/edit-mode/bridge.ts`
- `apps/web/src/edit-mode/sourcePatches.ts`
- `apps/web/src/components/EditModePanel.tsx`
- `apps/web/src/components/EditLayersPanel.tsx`
- `apps/web/src/components/FileViewer.tsx`
- `apps/web/src/index.css`

Existing Open Design integration points:

- `FileViewer` already owns preview iframe and mode toolbar.
- Existing comment mode already injects a preview bridge.
- Existing project file providers already read/write project files.
- Existing tab state already tracks active files.
- Existing artifact preview already rebuilds `srcDoc`.

## Phased Implementation Plan

### Phase 1: Source-Backed Manual Edit Infrastructure

Deliver:

- Edit target types.
- Edit patch types.
- Source patch helpers.
- Iframe edit bridge.
- Target discovery and selection.
- Manual edit mode state in `FileViewer`.

Exit criteria:

- Selecting a target in preview populates inspector data.
- Applying `set-text`, `set-link`, `set-image`, and `set-style` updates the project file.
- Preview refreshes after save.

### Phase 2: UI Migration

Deliver:

- Left layers list for active artifact.
- Right edit modal.
- Inspector tabs.
- Action footer.
- Changes panel or lightweight edit log.

Exit criteria:

- The production app matches the accepted demo layout.
- `Comment AI` and `Edit` are visually and behaviorally distinct.

### Phase 3: Advanced Source Controls

Deliver:

- Attributes JSON tab.
- Selected element HTML tab.
- Full source tab.
- Basic validation and error display.

Exit criteria:

- Advanced edits are possible without breaking simple edit workflows.
- Invalid input does not silently corrupt source.

### Phase 4: Robustness

Deliver:

- Undo/redo.
- Keep selection after patch when id survives.
- Target missing state.
- Artifact lint after risky edits.
- Optional diff preview.

Exit criteria:

- Manual edit mode can be used repeatedly on a real generated artifact without losing work.

## Non-Goals for v1

- Drag-and-drop layout editing.
- Freeform vector editing.
- Multi-user collaboration.
- Auto-layout system.
- Component extraction.
- Class-based CSS refactoring.
- AI agent calls from manual edit mode.

These can be designed later after the source-backed manual edit loop is stable.

## Acceptance Checklist

- [ ] `Edit` mode does not call AI.
- [ ] `Comment AI` remains the only agent-assisted edit path.
- [ ] Preview element selection works.
- [ ] Layer list selection works.
- [ ] Right edit modal shows selected layer identity.
- [ ] Content edits work.
- [ ] Style edits work.
- [ ] Attribute edits work without deleting unrelated attributes.
- [ ] Selected HTML edits work.
- [ ] Full source edits work.
- [ ] Undo/redo works.
- [ ] Source view reflects applied changes.
- [ ] Preview refreshes after applied changes.
- [ ] Invalid patches do not corrupt the artifact.
- [ ] UI remains canvas-first and simple.
