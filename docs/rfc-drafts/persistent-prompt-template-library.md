# Persistent Prompt Template Library

## Status

Proposed

## Summary

OpenDesign already lets users choose a curated image or video prompt template and edit its prompt before creating a project. The edited prompt is currently useful only for that project session. This proposal adds a small personal library so users can save a refined prompt, find it later, and reuse it without copying text between projects.

## User problem

A prompt often improves through several iterations. When a user gets a good result, they need a reliable way to keep the prompt together with its surface, model, aspect ratio, category, and tags. Without that, useful work remains in chat history or local notes and is difficult to retrieve.

## Proposed experience

1. The user chooses an existing image or video prompt template, or starts with a blank prompt.
2. The prompt body remains editable before project creation.
3. A `Save as template` action opens a small confirmation form for the title and optional metadata.
4. The user confirms the save.
5. The prompt is stored in the user's OpenDesign data directory and appears in the same picker on future projects.
6. Saved prompts are marked as personal, while bundled prompts remain read-only.
7. Selecting a saved prompt loads its full body for further editing before use.

Saving must be an explicit action. Editing or selecting a prompt must never write to disk automatically.

## Suggested data shape

Keep the current JSON registry shape so the existing picker and API can be reused:

```json
{
  "id": "landing-product-shot",
  "surface": "image",
  "title": "Landing product shot",
  "summary": "Product still life with editorial lighting.",
  "category": "Personal",
  "tags": ["saved", "product", "landing"],
  "prompt": "Create a product image with...",
  "model": "gpt-image-2",
  "aspect": "16:9",
  "source": {
    "repo": "local",
    "license": "Internal"
  }
}
```

The user library should live under the resolved daemon data root, separate from bundled `prompt-templates/` resources. Bundled resources remain the fallback catalog; personal entries take precedence when their surface and id collide.

## API direction

- `GET /api/prompt-templates` lists bundled and personal summaries without prompt bodies.
- `GET /api/prompt-templates/:surface/:id` returns the selected prompt body.
- `POST /api/prompt-templates` validates and writes a personal template.
- Future update and delete endpoints should be limited to personal entries and require explicit confirmation in the UI.

The write route should validate the surface, title, prompt length, safe id, and JSON path. It must reject traversal, invalid ids, and writes to bundled resources.

## Implementation phases

### Phase 1: Save and reuse

- Add a personal prompt-template directory derived from `RUNTIME_DATA_DIR`.
- Extend the registry reader to merge personal and bundled roots.
- Add a save confirmation flow beside the editable prompt body.
- Refresh the picker after a successful save.
- Add daemon and web tests for validation, precedence, persistence, and the confirmation boundary.

### Phase 2: Personal library management

- Add personal/bundled source labels.
- Add rename and delete actions for personal entries only.
- Add search filters for surface, category, model, and tags.
- Show a clear error when a prompt cannot be loaded or saved.

### Phase 3: Retrieval signals

- Add favorites and recently used ordering.
- Track local usage counts without treating usage as a review or quality score.
- Consider optional user-authored notes.

## Safety and privacy

- Never send prompt bodies to a remote service as part of local saving.
- Keep personal prompts under the daemon's resolved data directory and honor `OD_DATA_DIR`.
- Treat imported prompt text as user content; do not execute it as code.
- Keep bundled attribution and license metadata intact.
- Do not call usage count, featured status, or preview availability a review or rating.

## Acceptance criteria

- A user can save an edited image or video prompt after explicit confirmation.
- The saved prompt appears in the picker after refresh and after restarting OpenDesign.
- Selecting it retrieves the same prompt body and metadata.
- Bundled templates remain unchanged and cannot be overwritten through the personal save flow.
- Invalid titles, empty prompts, traversal ids, and unsupported surfaces are rejected.
- Existing bundled prompt-template tests continue to pass.
- The web UI clearly distinguishes saving a prompt from using it to create a project.

## Open questions

- Should personal templates be scoped to the current project, account, or local daemon data root?
- Should team workspaces eventually support shared prompt libraries with permissions?
- Should the first release expose model and aspect metadata in the save form, or infer them from the current selection?
- Should favorites and recent usage remain local-only, or become part of a future shared catalog?
