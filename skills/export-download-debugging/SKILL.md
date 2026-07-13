---
name: export-download-debugging
description: |
  Diagnose and fix browser, preview, or Electron export/download failures, especially image export issues involving Save As, Blob/Data URLs, the File System Access API, createWritable failures, and 0 KB files.
triggers:
  - "export image failed"
  - "image export"
  - "download is 0kb"
  - "0 KB file"
  - "showSaveFilePicker"
  - "createWritable"
  - "blob URL"
  - "Electron download"
od:
  mode: utility
  category: web-artifacts
---

# Export Download Debugging

Use this when an export or download appears to run but produces an empty,
missing, or unusable file. It is tuned for browser previews, iframe capture,
and Electron shells.

## Core rule

Separate capture from save. Prove the export payload has non-zero bytes before
debugging the destination path. A 0 KB file often means the native picker or
host created the target file, then the write failed or was blocked.

## Evidence

- Record the payload type, MIME type, byte length, object URL or data URL path,
  and thrown error name/message.
- Check browser console output and app logs around `showSaveFilePicker`,
  `createWritable`, `<a download>`, `URL.createObjectURL`, and URL revocation.
- In Electron, inspect the `will-download` path: filename, MIME, file extension,
  save dialog filters, cancellation, and final file size.
- Confirm the actual downloaded file size on disk and whether it opens in a
  normal image viewer.

## Fix order

1. Prepare and validate the export payload first; disable Save until bytes are
   available.
2. Prefer the simplest stable save channel for the host. If
   `showSaveFilePicker().createWritable()` fails, is sandboxed, or creates empty
   files, route to `<a download>` or Electron's download manager instead.
3. Avoid opening a native picker before the payload is ready. This prevents the
   host from creating an empty destination file on later write failure.
4. For PNG fallback, prefer a verified non-empty data URL when blob URLs,
   revocation timing, CSP, or iframe sandboxing are suspicious.
5. In Electron, add explicit Save As filters for exported image extensions
   (`.png`, `.jpg`, `.jpeg`, `.webp`) so users can choose a real image target.
6. Keep the UI restrained: format selection, filename/path hint, clear pending
   and error states, and one primary save action.

## Validation

- Add or update tests for non-empty payload preparation, fallback save behavior,
  file extension/MIME mapping, and UI disabled/error states.
- Run focused export tests, then `pnpm --filter @open-design/web typecheck`.
- If Electron download handling changed, also run
  `pnpm --filter @open-design/desktop typecheck`.
- Before landing, run `pnpm guard`, inspect the staged diff for unrelated files,
  generated artifacts, and accidental secrets, then use the repository's PR
  quality-gate workflow if the fix is being prepared for review.
