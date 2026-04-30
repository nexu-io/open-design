# File Workflow

This module covers project file workflows.

## Automated Cases

- `file-mention`: select a project file through the mention popover and stage it for the prompt.
- `file-upload-send`: upload a file through the composer and preserve it in the sent user message.
- `deep-link-preview`: route directly to a generated artifact and restore the preview.
- `design-files-upload`: upload an image in Design Files, show metadata, and open it as a tab.
- `design-files-delete`: delete a Design Files item and clean up any matching open tab.
- `design-files-tab-persistence`: restore multiple open file tabs and the active tab after refresh.

## Future Coverage

- Per-file deck pagination isolation.
- Uploaded image rendering inside generated artifacts.
- Source preview for Python and other text-like files.
- Image thumbnails.
- Staged attachment cleanup after refresh.
