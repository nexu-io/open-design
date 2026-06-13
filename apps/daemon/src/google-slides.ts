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
    auth,
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
    } catch (err) {
      const wrapped = new Error('Your Google Workspace administrator has blocked public file sharing. Image insertion is disabled.');
      wrapped.code = 'GOOGLE_WORKSPACE_DLP_BLOCKED';
      wrapped.cause = err;
      throw wrapped;
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
    err.code = 'GOOGLE_API_BAD_REQUEST';
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
// Style preservation (Round 7 finding): a naive [deleteText, insertText]
// drops the original textRun.style — Closing P110's 200pt "Thank you."
// hero collapsed to layout default (~18pt).
//
// Codex review (2026-05-05) finding: applying first-run style to ALL with
// fields:'*' collapses mixed-style placeholders (e.g. T+IMG P31's title
// placeholder which holds "title\nparagraph...\nparagraph..." in one
// shape with different per-run styles). Fix: capture per-paragraph style
// from the original, then re-apply each paragraph's style to its
// corresponding range in the new text.
//
// Honors the design principle "templates are the promise, text is the
// variable" — typography belongs to the template, not to the agent's
// runtime decisions.
export async function updateTextByObjectId(deckId, objectId, text) {
  const { slides } = await authedClients();
  if (typeof text !== 'string') {
    const err = new Error('text must be a string');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }

  // Read original textElements and group them into per-paragraph style
  // hints. A "paragraph" is a sequence of textRuns terminated by a \n
  // (Slides keeps the \n inside textRun.content). For each paragraph we
  // pick the first non-empty textRun.style as the representative.
  let paragraphStyles = [];
  let hadPriorText = false;
  try {
    const res = await slides.presentations.get({
      presentationId: deckId,
      fields: 'slides(pageElements(objectId,shape(text(textElements))))',
    });
    outer: for (const slide of res.data.slides || []) {
      for (const el of slide.pageElements || []) {
        if (el.objectId !== objectId) continue;
        const elements = el.shape?.text?.textElements || [];
        let currentRunStyles = [];
        for (const te of elements) {
          if (!te.textRun) continue;
          const content = te.textRun.content || '';
          if (content.length > 0) {
            hadPriorText = true;
            if (content.trim().length > 0 && te.textRun.style) {
              currentRunStyles.push(te.textRun.style);
            }
          }
          if (content.endsWith('\n')) {
            paragraphStyles.push(currentRunStyles[0] || null);
            currentRunStyles = [];
          }
        }
        if (currentRunStyles.length > 0) {
          paragraphStyles.push(currentRunStyles[0] || null);
        }
        break outer;
      }
    }
  } catch (readErr) {
    // proceed without style preservation
  }

  const newParagraphs = text.split('\n');

  const requests = [];
  if (hadPriorText) {
    requests.push({ deleteText: { objectId, textRange: { type: 'ALL' } } });
  }
  requests.push({ insertText: { objectId, text, insertionIndex: 0 } });

  // Per-paragraph style reapply. For each new paragraph, use the
  // corresponding original paragraph's style (by index). If the new text
  // has more paragraphs than the original, extra ones inherit the last
  // available style (or layout default if none).
  let charPos = 0;
  for (let i = 0; i < newParagraphs.length; i++) {
    const paraText = newParagraphs[i];
    const startIndex = charPos;
    const endIndex = charPos + paraText.length;
    charPos = endIndex + 1; // +1 for the \n separator
    if (paraText.length === 0) continue;
    const style =
      paragraphStyles[i] ||
      paragraphStyles[paragraphStyles.length - 1] ||
      null;
    if (style && Object.keys(style).length > 0) {
      requests.push({
        updateTextStyle: {
          objectId,
          textRange:
            newParagraphs.length === 1
              ? { type: 'ALL' }
              : { type: 'FIXED_RANGE', startIndex, endIndex },
          style,
          fields: '*',
        },
      });
    }
  }

  try {
    await slides.presentations.batchUpdate({
      presentationId: deckId,
      requestBody: { requests },
    });
    return {
      ok: true,
      preservedParagraphStyles: paragraphStyles.length,
      newParagraphs: newParagraphs.length,
    };
  } catch (err) {
    if (hadPriorText) {
      try {
        // Slides batchUpdate is atomic, so the failed styled batch
        // above left the original placeholder text in place. The
        // fallback must clear it before inserting — otherwise the
        // shape ends up with old + new text concatenated. Bundle
        // deleteText + insertText (+ optional first-paragraph
        // style) into a single batch so they apply atomically.
        const fallbackRequests: any[] = [
          {
            deleteText: {
              objectId,
              textRange: { type: 'ALL' },
            },
          },
          { insertText: { objectId, text, insertionIndex: 0 } },
        ];
        const firstStyle = paragraphStyles[0];
        if (firstStyle && Object.keys(firstStyle).length > 0) {
          fallbackRequests.push({
            updateTextStyle: {
              objectId,
              textRange: { type: 'ALL' },
              style: firstStyle,
              fields: '*',
            },
          });
        }
        await slides.presentations.batchUpdate({
          presentationId: deckId,
          requestBody: { requests: fallbackRequests },
        });
        return { ok: true, fallback: 'delete-insert' };
      } catch (inner) {
        throw wrapApiError(inner);
      }
    }
    throw wrapApiError(err);
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
//
// Codex review (2026-05-05): Google requires (a) idMap source keys to
// exist on the source slide, (b) destination IDs to be 5-50 chars and
// match `[A-Za-z0-9_-]+`, (c) destination IDs to be unique within the
// presentation. Without preflight these become opaque Google 502 errors.
// We validate destinations locally and existence of source keys against
// the actual source slide.
const DUPLICATE_SLIDE_ID_RE = /^[A-Za-z0-9_-]+$/;
export async function duplicateSlide(deckId, slideObjectId, idMap) {
  const { slides } = await authedClients();
  if (idMap !== undefined && idMap !== null) {
    if (typeof idMap !== 'object' || Array.isArray(idMap)) {
      const err = new Error('idMap must be a plain object');
      err.code = 'GOOGLE_API_BAD_REQUEST';
      throw err;
    }
    const destSeen = new Set();
    for (const [src, dest] of Object.entries(idMap)) {
      if (typeof src !== 'string' || !src) {
        const err = new Error(`idMap source key invalid: ${src}`);
        err.code = 'GOOGLE_API_BAD_REQUEST';
        throw err;
      }
      if (typeof dest !== 'string' || dest.length < 5 || dest.length > 50) {
        const err = new Error(
          `idMap destination "${dest}" must be 5-50 chars (got ${dest?.length ?? 'non-string'})`,
        );
        err.code = 'GOOGLE_API_BAD_REQUEST';
        throw err;
      }
      if (!DUPLICATE_SLIDE_ID_RE.test(dest)) {
        const err = new Error(
          `idMap destination "${dest}" must match [A-Za-z0-9_-]+`,
        );
        err.code = 'GOOGLE_API_BAD_REQUEST';
        throw err;
      }
      if (destSeen.has(dest)) {
        const err = new Error(`idMap destination "${dest}" duplicated within idMap`);
        err.code = 'GOOGLE_API_BAD_REQUEST';
        throw err;
      }
      destSeen.add(dest);
    }
    try {
      const res = await slides.presentations.get({
        presentationId: deckId,
        fields: 'slides(objectId,pageElements(objectId))',
      });
      const allObjectIds = new Set();
      let sourceSlide = null;
      for (const s of res.data.slides || []) {
        allObjectIds.add(s.objectId);
        for (const el of s.pageElements || []) {
          allObjectIds.add(el.objectId);
        }
        if (s.objectId === slideObjectId) sourceSlide = s;
      }
      if (!sourceSlide) {
        const err = new Error(`source slide ${slideObjectId} not found in deck`);
        err.code = 'GOOGLE_API_BAD_REQUEST';
        throw err;
      }
      const sourceIds = new Set([
        sourceSlide.objectId,
        ...(sourceSlide.pageElements || []).map((e) => e.objectId),
      ]);
      for (const src of Object.keys(idMap)) {
        if (!sourceIds.has(src)) {
          const err = new Error(
            `idMap source "${src}" is not on source slide ${slideObjectId}`,
          );
          err.code = 'GOOGLE_API_BAD_REQUEST';
          throw err;
        }
      }
      for (const dest of destSeen) {
        if (allObjectIds.has(dest)) {
          const err = new Error(
            `idMap destination "${dest}" collides with existing object in deck`,
          );
          err.code = 'GOOGLE_API_BAD_REQUEST';
          throw err;
        }
      }
    } catch (err) {
      if (err.code === 'GOOGLE_API_BAD_REQUEST') throw err;
      throw wrapApiError(err);
    }
  }
  // v4 (Round 11): when idMap is omitted, capture the source slide's
  // element order before duplication, then post-duplication read the new
  // slide's element order, and build elementIdMap by index. Slides API
  // duplicateObject preserves child order, so index-based pairing is
  // safe. This saves callers a second `readPresentation` round-trip.
  let sourceElementIds = null;
  if (!idMap) {
    try {
      const beforeRes = await slides.presentations.get({
        presentationId: deckId,
        fields: 'slides(objectId,pageElements(objectId))',
      });
      const src = (beforeRes.data.slides || []).find(
        (s) => s.objectId === slideObjectId,
      );
      if (src) {
        sourceElementIds = (src.pageElements || []).map((e) => e.objectId);
      }
    } catch {
      // proceed without source pairing; reply just won't include elementIdMap
    }
  }

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
    const newSlideId = reply?.objectId;
    let elementIdMap = null;
    if (!idMap && sourceElementIds && newSlideId) {
      try {
        const afterRes = await slides.presentations.get({
          presentationId: deckId,
          fields: 'slides(objectId,pageElements(objectId))',
        });
        const newSlide = (afterRes.data.slides || []).find(
          (s) => s.objectId === newSlideId,
        );
        const newElementIds = (newSlide?.pageElements || []).map((e) => e.objectId);
        if (newElementIds.length === sourceElementIds.length) {
          elementIdMap = {};
          for (let i = 0; i < sourceElementIds.length; i++) {
            elementIdMap[sourceElementIds[i]] = newElementIds[i];
          }
        }
      } catch {
        // proceed without elementIdMap
      }
    }
    return { ok: true, newSlideId, ...(elementIdMap ? { elementIdMap } : {}) };
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Reorder slides in the deck. Phase 5 finding: the previous flow
// constrained the skill to use canonicals in template-physical order
// (because the kept slides naturally line up that way after delete).
// Decoupling layout selection from narrative order requires this.
//
// Codex review (2026-05-05) finding: Google's UpdateSlidesPositionRequest
// requires `slideObjectIds` to be in existing-presentation order without
// duplicates. The previous implementation forwarded an arbitrary narrative
// order directly and relied on undocumented API leniency. Rewritten to
// take a single `narrativeOrder` argument (the desired final order) and
// move slides one-at-a-time — single-slide moves never violate the
// in-order constraint because the array has length 1.
//
// `narrativeOrder` is the final desired order of the slides to be
// reordered (typically the kept narrative slides after delete-pages).
// Slides not in the list are left in place; their relative order is
// preserved between any anchored narrative slides.
export async function updateSlidesPosition(deckId, narrativeOrder) {
  if (!Array.isArray(narrativeOrder) || narrativeOrder.length === 0) {
    return { ok: true, reordered: 0, moves: 0 };
  }
  if (narrativeOrder.some((id) => typeof id !== 'string' || !id)) {
    const err = new Error('narrativeOrder entries must be non-empty strings');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }
  if (new Set(narrativeOrder).size !== narrativeOrder.length) {
    const err = new Error('narrativeOrder contains duplicates');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }
  const { slides } = await authedClients();
  try {
    const res = await slides.presentations.get({
      presentationId: deckId,
      fields: 'slides(objectId)',
    });
    const currentOrder = (res.data.slides || []).map((s) => s.objectId);
    const missing = narrativeOrder.filter((id) => !currentOrder.includes(id));
    if (missing.length > 0) {
      const err = new Error(`slideIds not found in deck: ${missing.join(', ')}`);
      err.code = 'GOOGLE_API_BAD_REQUEST';
      throw err;
    }
    let moves = 0;
    for (let targetIdx = 0; targetIdx < narrativeOrder.length; targetIdx++) {
      const targetId = narrativeOrder[targetIdx];
      const currentIdx = currentOrder.indexOf(targetId);
      if (currentIdx === targetIdx) continue;
      await slides.presentations.batchUpdate({
        presentationId: deckId,
        requestBody: {
          requests: [
            {
              updateSlidesPosition: {
                slideObjectIds: [targetId],
                insertionIndex: targetIdx,
              },
            },
          ],
        },
      });
      currentOrder.splice(currentIdx, 1);
      currentOrder.splice(targetIdx, 0, targetId);
      moves += 1;
    }
    return { ok: true, reordered: narrativeOrder.length, moves };
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

// Fetch a thumbnail PNG URL for the first page of a deck. Used by the
// web UI to render real preview images on Designs cards instead of a
// generic folder icon. Slides API returns a 30-minute expiring HTTPS
// URL (`contentUrl`); we surface it directly and let the browser cache.
//
// `size` controls the requested thumbnail dimensions; valid values are
// 'SMALL' | 'MEDIUM' | 'LARGE' (Google's preset enum). Defaults to MEDIUM.
const THUMBNAIL_CACHE = new Map(); // deckId -> { url, expiresAt }
const THUMBNAIL_TTL_MS = 25 * 60 * 1000; // 25 minutes (Google URL valid 30)
export async function getDeckThumbnailUrl(deckId, size = 'MEDIUM') {
  if (typeof deckId !== 'string' || !deckId) {
    const err = new Error('deckId required');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }
  const cached = THUMBNAIL_CACHE.get(deckId);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, cached: true };
  }
  const { slides } = await authedClients();
  try {
    const meta = await slides.presentations.get({
      presentationId: deckId,
      fields: 'slides(objectId)',
    });
    const firstSlide = meta.data.slides?.[0];
    if (!firstSlide?.objectId) {
      const err = new Error(`deck ${deckId} has no slides`);
      err.code = 'GOOGLE_API_BAD_REQUEST';
      throw err;
    }
    const thumb = await slides.presentations.pages.getThumbnail({
      presentationId: deckId,
      pageObjectId: firstSlide.objectId,
      'thumbnailProperties.thumbnailSize': size,
      'thumbnailProperties.mimeType': 'PNG',
    });
    const url = thumb.data.contentUrl;
    if (!url) {
      const err = new Error('Slides API returned empty thumbnail contentUrl');
      err.code = 'GOOGLE_API_ERROR';
      throw err;
    }
    THUMBNAIL_CACHE.set(deckId, {
      url,
      expiresAt: Date.now() + THUMBNAIL_TTL_MS,
    });
    return { url, cached: false };
  } catch (err) {
    if (err.code === 'GOOGLE_API_BAD_REQUEST') throw err;
    throw wrapApiError(err);
  }
}

// Stream a high-resolution PNG render of a single deck page. The
// Slides API getThumbnail tops out at 1600px wide which looks soft
// on retina displays — the Drive export/png endpoint serves the
// page at native resolution. Append &w=<px> to ask Google for an
// upscaled render (default ~1920 → up to 3840 with the param).
// We OAuth-fetch server-side and stream bytes back, so the UI can
// just <img src="/api/projects/:id/page-image?pageId=..."> without
// exposing auth.
export async function fetchPageImage(deckId, pageObjectId, widthPx = 7680) {
  if (typeof deckId !== 'string' || !deckId) {
    const err = new Error('deckId required');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }
  if (typeof pageObjectId !== 'string' || !pageObjectId) {
    const err = new Error('pageObjectId required');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }
  const w = Number.isFinite(widthPx) && widthPx > 0 ? Math.min(7680, Math.floor(widthPx)) : 3840;
  const { auth } = await authedClients();
  const accessTokenInfo = await auth.getAccessToken();
  const accessToken =
    typeof accessTokenInfo === 'string' ? accessTokenInfo : accessTokenInfo?.token;
  if (!accessToken) {
    const err = new Error('Google access token missing');
    err.code = 'GOOGLE_AUTH_REQUIRED';
    throw err;
  }
  const url = `https://docs.google.com/presentation/d/${encodeURIComponent(
    deckId,
  )}/export/png?id=${encodeURIComponent(deckId)}&pageid=${encodeURIComponent(
    pageObjectId,
  )}&w=${w}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const err = new Error(`Drive export PNG returned ${r.status}`);
    err.code = 'GOOGLE_API_ERROR';
    throw err;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

// Read all slide IDs in deck order. Cheaper helper than
// readPresentation when callers only need the IDs (e.g. building
// per-page image URLs in the gallery viewer).
export async function listSlideIds(deckId) {
  if (typeof deckId !== 'string' || !deckId) {
    const err = new Error('deckId required');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }
  const { slides } = await authedClients();
  try {
    const res = await slides.presentations.get({
      presentationId: deckId,
      fields: 'slides(objectId)',
    });
    return (res.data.slides || [])
      .map((s) => s.objectId)
      .filter((id) => typeof id === 'string' && id.length > 0);
  } catch (err) {
    throw wrapApiError(err);
  }
}

// Fetch thumbnail URLs for every page of a deck. Used by the
// gallery-style slide viewer that replaced Google's embed iframe so
// the UI can render each page as a 16:9 PNG with its own prev/next
// controls (Google embed insisted on bundling chrome that produced
// letterbox bands no matter how the iframe was sized).
const ALL_THUMBNAILS_CACHE = new Map(); // deckId -> { urls, expiresAt }
export async function getDeckAllThumbnailUrls(deckId, size = 'LARGE') {
  if (typeof deckId !== 'string' || !deckId) {
    const err = new Error('deckId required');
    err.code = 'GOOGLE_API_BAD_REQUEST';
    throw err;
  }
  const cacheKey = `${deckId}:${size}`;
  const cached = ALL_THUMBNAILS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { urls: cached.urls, cached: true };
  }
  const { slides } = await authedClients();
  try {
    const meta = await slides.presentations.get({
      presentationId: deckId,
      fields: 'slides(objectId)',
    });
    const slideIds = (meta.data.slides || [])
      .map((s) => s.objectId)
      .filter((id) => typeof id === 'string' && id.length > 0);
    if (slideIds.length === 0) {
      const err = new Error(`deck ${deckId} has no slides`);
      err.code = 'GOOGLE_API_BAD_REQUEST';
      throw err;
    }
    const urls = await Promise.all(
      slideIds.map(async (pageObjectId) => {
        const thumb = await slides.presentations.pages.getThumbnail({
          presentationId: deckId,
          pageObjectId,
          'thumbnailProperties.thumbnailSize': size,
          'thumbnailProperties.mimeType': 'PNG',
        });
        return thumb.data.contentUrl ?? null;
      }),
    );
    const filtered = urls.filter((u) => typeof u === 'string');
    ALL_THUMBNAILS_CACHE.set(cacheKey, {
      urls: filtered,
      expiresAt: Date.now() + THUMBNAIL_TTL_MS,
    });
    return { urls: filtered, cached: false };
  } catch (err) {
    if (err.code === 'GOOGLE_API_BAD_REQUEST') throw err;
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
