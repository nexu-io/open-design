// @ts-nocheck
//
// High-level Slides + Drive operations the wix-ja-slide skill (and any
// future google-slides skill) calls through `/api/google/slides/*`.
// Each operation gets a fresh authenticated client from google-auth.ts —
// callers don't need to know about OAuth.
//
// Operations:
//   copyDeck(sourceId, title)            → { deckId, deckUrl, embedUrl }
//   applyTextReplacements(deckId, map)   → { occurrences }
//   insertImageIntoPlaceholder(...)      → { ok }
//   uploadImage(localPath, mimeType?)    → { driveFileId, webViewLink }
//   updateMasterText(deckId, find, ...)  → { occurrences }
//   readPresentation(deckId)             → presentation metadata
//
// Error shape: throws Error with .code so the route handler maps to a
// stable HTTP status. Codes: GOOGLE_AUTH_REQUIRED, GOOGLE_API_ERROR.

import { createReadStream } from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { getAuthClient } from './google-auth.js';

async function authedClients() {
  const auth = await getAuthClient();
  if (!auth) {
    const err = new Error('Google OAuth not yet authorized — call /api/google/auth/start first.');
    err.code = 'GOOGLE_AUTH_REQUIRED';
    throw err;
  }
  return {
    slides: google.slides({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

function wrapApiError(err) {
  // googleapis surfaces structured errors via err.errors / err.code
  const msg = err?.errors?.[0]?.message || err?.message || 'unknown Google API error';
  const wrapped = new Error(`Google API: ${msg}`);
  wrapped.code = 'GOOGLE_API_ERROR';
  wrapped.cause = err;
  return wrapped;
}

export function buildEmbedUrl(deckId) {
  // Aligned with skills/wix-ja-slide/assets/config.json.embed_url_template
  return `https://docs.google.com/presentation/d/${encodeURIComponent(deckId)}/embed?start=false&loop=false&delayms=3000`;
}

export function buildEditUrl(deckId) {
  return `https://docs.google.com/presentation/d/${encodeURIComponent(deckId)}/edit`;
}

// Copy a Drive file (deck) and return identifiers + URLs ready to write
// into result.json.
export async function copyDeck(sourceDeckId, newTitle) {
  const { drive } = await authedClients();
  try {
    const res = await drive.files.copy({
      fileId: sourceDeckId,
      requestBody: { name: newTitle },
      fields: 'id, name',
    });
    const deckId = res.data.id;
    return {
      deckId,
      deckTitle: res.data.name,
      deckUrl: buildEditUrl(deckId),
      embedUrl: buildEmbedUrl(deckId),
    };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Apply a map of text replacements deck-wide. Used by the skill to fill
// the JP copy's `字数上限：48字` style placeholders.
//
// `replacements` is { "<find>": "<replace>" } — keys are matched exactly
// (matchCase=true). Returns total replacement count per key.
export async function applyTextReplacements(deckId, replacements) {
  const { slides } = await authedClients();
  const requests = Object.entries(replacements).map(([find, replace]) => ({
    replaceAllText: {
      containsText: { text: find, matchCase: true },
      replaceText: replace,
    },
  }));
  if (requests.length === 0) return { occurrences: {} };
  try {
    const res = await slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: { requests },
    });
    const replies = res.data.replies || [];
    const occurrences = {};
    Object.keys(replacements).forEach((key, i) => {
      occurrences[key] = replies[i]?.replaceAllText?.occurrencesChanged ?? 0;
    });
    return { occurrences };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Update text inside the slide master(s) — used to rewrite the
// "Presentation name / YYYY" header that lives on the master, not on
// any individual slide.
export async function updateMasterText(deckId, find, replace) {
  // replaceAllText with no `pageObjectIds` already touches masters too,
  // but to be explicit we list them so we can return a clear count.
  const { slides } = await authedClients();
  try {
    const presentation = await slides.presentations.get({
      presentationId: deckId,
      fields: 'masters(objectId)',
    });
    const masterIds = (presentation.data.masters || []).map((m) => m.objectId).filter(Boolean);
    if (masterIds.length === 0) return { occurrences: 0 };
    const res = await slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: { text: find, matchCase: true },
              replaceText: replace,
              pageObjectIds: masterIds,
            },
          },
        ],
      },
    });
    return { occurrences: res.data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0 };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Upload a local image file to Drive. Returns the file ID + a URL the
// Slides API can read.
//
// Sharing model: we DO NOT make the file public. Wix Workspace (and many
// other enterprise Workspaces) block "anyone-with-link" sharing via DLP
// policy. Instead we rely on the fact that the same OAuth token used to
// upload the image is also used by Slides to render it via createImage —
// Slides fetches user-owned Drive files through the user's auth without
// needing public access.
//
// As a best-effort we attempt the public-sharing grant anyway (some
// orgs don't have the DLP policy and the resulting URL is more
// universally embeddable), but a 403 / publishOutNotPermitted is
// silently absorbed.
export async function uploadImage(localPath, mimeType) {
  const { drive } = await authedClients();
  const name = path.basename(localPath);
  try {
    const res = await drive.files.create({
      requestBody: { name },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: createReadStream(localPath),
      },
      fields: 'id, name, webViewLink',
    });
    const fileId = res.data.id;
    let publiclyShared = false;
    try {
      await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
      });
      publiclyShared = true;
    } catch {
      // Best-effort. Wix Workspace DLP rejects "anyone-with-link" with
      // `publishOutNotPermitted` (HTTP 400) and other orgs may have
      // different policies. Either way Slides API can still read the
      // file via the user's own OAuth token, so we proceed silently.
    }
    return {
      driveFileId: fileId,
      name: res.data.name,
      webViewLink: res.data.webViewLink,
      publiclyShared,
      // Used as Slides API `image.url` source. Slides accepts this
      // format whether or not the file is publicly shared, as long as
      // the calling OAuth token can read the file.
      slidesAccessibleUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
    };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Insert (or replace) an image into a specific picture placeholder on a
// slide. Picture placeholders are detected by their `placeholder` property
// on PageElement.shape. If the target object already has an image (i.e.
// is a Slides Image element rather than an empty placeholder), we use
// `replaceImage` to swap it in place; otherwise we create a new image
// sized to the placeholder's existing transform.
//
// The skill calls this after `uploadImage`; pass the
// `slidesAccessibleUrl` as `imageUrl`.
export async function insertImageIntoPlaceholder({
  deckId,
  slideId,
  placeholderObjectId,
  imageUrl,
}) {
  const { slides } = await authedClients();
  try {
    // Look up the placeholder so we know whether to replaceImage or
    // createImage, and (for createImage) what size/transform to use.
    const presentation = await slides.presentations.get({
      presentationId: deckId,
      fields: 'slides(objectId,pageElements(objectId,size,transform,shape(placeholder),image))',
    });
    const slide = (presentation.data.slides || []).find((s) => s.objectId === slideId);
    if (!slide) throw new Error(`slide ${slideId} not found in deck`);
    const target = (slide.pageElements || []).find((el) => el.objectId === placeholderObjectId);
    if (!target) throw new Error(`element ${placeholderObjectId} not found on slide ${slideId}`);

    let request;
    if (target.image) {
      // Existing image — use replaceImage to keep transform pixel-perfect.
      request = {
        replaceImage: {
          imageObjectId: placeholderObjectId,
          url: imageUrl,
          imageReplaceMethod: 'CENTER_CROP',
        },
      };
    } else {
      // Empty placeholder — create a new image sized to the placeholder.
      request = {
        createImage: {
          url: imageUrl,
          elementProperties: {
            pageObjectId: slideId,
            size: target.size,
            transform: target.transform,
          },
        },
      };
    }
    const res = await slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: { requests: [request] },
    });
    return { ok: true, response: res.data.replies?.[0] || null };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Set font size on ALL text inside a given placeholder element. The
// visual self-check loop in the wix-ja-slide skill calls this when text
// overflows even after shortening — full-width JP chars are roughly twice
// the width of latin half-width chars, so a placeholder sized for "Thank
// you." (5 latin chars) won't fit "ありがとう" (5 fullwidth) at the
// same font size. Shrinking ~20% is usually enough.
//
// fontSizePt is a number in points (e.g. 36 for typical body, 96+ for
// hero closer). The Slides API expects fontSize.{magnitude, unit:"PT"}.
export async function updateFontSize(deckId, slideObjectId, fontSizePt) {
  const { slides } = await authedClients();
  if (typeof fontSizePt !== 'number' || !Number.isFinite(fontSizePt) || fontSizePt <= 0 || fontSizePt > 400) {
    const err = new Error(`fontSizePt out of range: ${fontSizePt}`);
    err.code = 'GOOGLE_API_ERROR';
    throw err;
  }
  try {
    await slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: {
        requests: [
          {
            updateTextStyle: {
              objectId: slideObjectId,
              textRange: { type: 'ALL' },
              style: { fontSize: { magnitude: fontSizePt, unit: 'PT' } },
              fields: 'fontSize',
            },
          },
        ],
      },
    });
    return { ok: true, appliedFontSizePt: fontSizePt };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Replace ALL text inside a single placeholder (or any shape with text)
// by objectId, bypassing deck-wide find/replace. Phase 5 finding: the
// skill needs this to (a) reuse a canonical layout across multiple slides
// without bleed, (b) fill canonicals whose placeholders share the same
// filler string (e.g. T+5B's three "Lorem ipsum dolor sit amet" copies),
// and (c) write into placeholders whose original text contains control
// chars like \x0b that defeat replaceAllText's exact-match.
//
// Strategy: deleteText(range: ALL) then insertText(at index 0) in one
// batchUpdate. If the placeholder is empty (deleteText fails), retry
// insert-only.
export async function updateTextByObjectId(deckId, objectId, text) {
  const { slides } = await authedClients();
  if (typeof text !== 'string') {
    const err = new Error('text must be a string');
    err.code = 'GOOGLE_API_ERROR';
    throw err;
  }
  const runBatch = (requests) =>
    slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: { requests },
    });
  try {
    await runBatch([
      { deleteText: { objectId, textRange: { type: 'ALL' } } },
      { insertText: { objectId, text, insertionIndex: 0 } },
    ]);
    return { ok: true };
  } catch (firstErr) {
    try {
      await runBatch([{ insertText: { objectId, text, insertionIndex: 0 } }]);
      return { ok: true, fallback: 'insert-only' };
    } catch (secondErr) {
      throw wrapApiError(secondErr);
    }
  }
}

// Duplicate a slide (and all its child page elements) and return the
// new slide ID. Phase 5 finding: needed so the skill can reuse a
// "verified clean" canonical (e.g. T+3B P53) across multiple narrative
// pages without being forced into 8 distinct canonicals.
//
// `idMap` (optional) lets the caller pin deterministic IDs for the
// duplicated children: { "<oldObjectId>": "<newObjectId>", ... }. If
// omitted, IDs auto-generate and the caller must re-read the deck to
// discover the new placeholder objectIds.
export async function duplicateSlide(deckId, slideObjectId, idMap) {
  const { slides } = await authedClients();
  const request = { duplicateObject: { objectId: slideObjectId } };
  if (idMap && typeof idMap === 'object') {
    request.duplicateObject.objectIds = idMap;
  }
  try {
    const res = await slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: { requests: [request] },
    });
    const reply = res.data.replies?.[0]?.duplicateObject;
    return { ok: true, newSlideId: reply?.objectId };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Reorder slides in the deck. Phase 5 finding: the previous flow
// constrained the skill to use canonicals in template-physical order
// (because the kept slides naturally line up that way after delete).
// Decoupling layout selection from narrative order requires this.
//
// `slideIds` is the list to move; `insertionIndex` is the 0-based index
// in the new ordering where the first of `slideIds` should land.
export async function updateSlidesPosition(deckId, slideIds, insertionIndex) {
  if (!Array.isArray(slideIds) || slideIds.length === 0) {
    return { ok: true, reordered: 0 };
  }
  if (typeof insertionIndex !== 'number' || !Number.isFinite(insertionIndex) || insertionIndex < 0) {
    const err = new Error(`insertionIndex must be a non-negative number, got ${insertionIndex}`);
    err.code = 'GOOGLE_API_ERROR';
    throw err;
  }
  const { slides } = await authedClients();
  try {
    await slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: {
        requests: [
          {
            updateSlidesPosition: {
              slideObjectIds: slideIds,
              insertionIndex,
            },
          },
        ],
      },
    });
    return { ok: true, reordered: slideIds.length };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Delete a list of slides from a deck in a single batchUpdate. The skill
// uses this to drop the 124-or-so unused template pages after populating
// the 6-10 it actually wants. Slides API limits batches; we chunk to 200
// requests per call to stay well under the documented 1000-request cap.
export async function deletePages(deckId, slideIds) {
  if (!Array.isArray(slideIds) || slideIds.length === 0) {
    return { deleted: 0 };
  }
  const { slides } = await authedClients();
  let deleted = 0;
  const CHUNK = 200;
  try {
    for (let i = 0; i < slideIds.length; i += CHUNK) {
      const chunk = slideIds.slice(i, i + CHUNK);
      const requests = chunk.map((slideId) => ({
        deleteObject: { objectId: slideId },
      }));
      await slides.presentations.batchUpdate({
        presentationId: deckId,
        requestBody: { requests },
      });
      deleted += chunk.length;
    }
    return { deleted };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Export the deck to PDF and stream the bytes back. Used by the skill's
// visual self-check loop: after populating, dump the deck to PDF, Read
// each page, and verify the rendered text fits the placeholders. If a
// page overflows, the agent regenerates with shorter copy and re-applies.
export async function exportPdf(deckId) {
  const { drive } = await authedClients();
  try {
    const res = await drive.files.export(
      {
        fileId: deckId,
        mimeType: 'application/pdf',
      },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(res.data);
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Read the deck's high-level structure (slide count, slide IDs, page
// element summary). Used by the skill to verify a copy succeeded and to
// look up real placeholder object IDs after copy (object IDs are stable
// across a copy via Drive `files.copy`, but we surface this for sanity
// checks).
export async function readPresentation(deckId) {
  const { slides } = await authedClients();
  try {
    const res = await slides.presentations.get({
      presentationId: deckId,
      fields: 'presentationId,title,slides(objectId,pageElements(objectId))',
    });
    return {
      deckId: res.data.presentationId,
      title: res.data.title,
      slides: (res.data.slides || []).map((s) => ({
        slideId: s.objectId,
        elementCount: s.pageElements?.length || 0,
        elementIds: (s.pageElements || []).map((el) => el.objectId),
      })),
    };
  } catch (err) {
    throw wrapApiError(err);
  }
}
