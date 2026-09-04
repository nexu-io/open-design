import fs from 'node:fs';
import path from 'node:path';

import type { DesktopRenderSlidesInput, DesktopRenderSlidesResult } from '@open-design/sidecar-proto';
import { decodeSlideRenderFrame, SLIDE_RENDERER_HTTP_PATH } from '@open-design/sidecar-proto';

/**
 * Structurally identical to `DesktopSlideRenderer` in `server.ts`, spelled out
 * here so this module does not import from the composition root it is wired
 * into.
 */
type SlideRenderer = (
  input: DesktopRenderSlidesInput,
  options?: { signal?: AbortSignal },
) => Promise<DesktopRenderSlidesResult>;

// Optional extension point for deployments with no Electron sidecar.
//
// `desktopSlideRenderer` is injected only when the daemon runs as the desktop
// app's sidecar (apps/desktop). A headless daemon — `open-design` from a
// terminal, a container image — therefore has no slide renderer at all, so
// PPTX / raster-PDF / image export answer 501 and `capabilities.slideRenderer`
// advertises false. That is the correct answer for a plain install, but it also
// leaves an operator who IS willing to run a browser somewhere no way to say so.
//
// This fills the same binding from an operator-supplied HTTP endpoint. Unset
// (the default) it returns null and nothing about the daemon changes: same 501,
// same advertised capability, no new dependency, no new process.
//
// The two-process shape is not new here — the desktop build already asks
// another process to render, over unix-socket JSON IPC
// (packages/sidecar/src/json-ipc.ts). This swaps the transport for HTTP.
//
// The wire format an external renderer has to implement is specified and
// versioned in `@open-design/sidecar-proto` (slide-renderer-http.ts), which
// also owns the frame codec used below — the same one renderers and the tests
// encode with, so a producer and this decoder cannot drift apart.
const SLIDE_RENDERER_HTTP_TIMEOUT_MS = 600_000;

/**
 * Rewrites the origin of a daemon-built preview URL to one the renderer can
 * actually reach, keeping the scoped path untouched.
 *
 * The export route derives `baseHref` from the daemon's own recorded URL, which
 * for a container binding `0.0.0.0` is deliberately `http://127.0.0.1:<port>`.
 * That is correct for everything co-located, and useless to a renderer in a
 * different container: there, loopback is the renderer itself, so relative
 * images, fonts and stylesheets silently fail to load while an inline-only deck
 * still renders perfectly — the failure mode is a subtly wrong export, not an
 * error. Deployments that split the two need to say where the daemon is
 * reachable from the renderer's side.
 *
 * Deliberately its own setting rather than `OD_PUBLIC_BASE_URL`: that one is the
 * externally routable address browsers use, which may be a proxied public
 * hostname. What is needed here is the address one container uses to reach
 * another, which is usually an internal name and is not the same fact.
 *
 * Unset, or an unparseable value, leaves the URL exactly as built.
 */
function renderReachableBaseHref(baseHref: string, origin: string | undefined): string {
  const configured = (origin || '').trim();
  if (!configured) return baseHref;
  try {
    const target = new URL(configured);
    const url = new URL(baseHref);
    url.protocol = target.protocol;
    url.host = target.host;
    return url.toString();
  } catch {
    return baseHref;
  }
}

// Image encodings the daemon is willing to take as a hint from a renderer-
// supplied name. Anything else falls back to what the request asked for, so an
// odd or absent extension cannot decide the file type.
const SLIDE_RENDERER_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);

/**
 * The name the daemon gives a rendered payload. Positional and derived from the
 * request, so it is unique by construction and carries no meaning the renderer
 * could have got wrong. The advisory name contributes at most a validated image
 * extension.
 */
function slideRendererOutputName(
  input: DesktopRenderSlidesInput,
  advisoryName: string,
  index: number,
): string {
  if (input.editable) return 'deck.pptx';
  const advisory = path.extname(path.basename(advisoryName)).replace(/^\./, '').toLowerCase();
  const requested = input.pageImageFormat === 'jpeg' ? 'jpeg' : 'png';
  const ext = SLIDE_RENDERER_IMAGE_EXTENSIONS.has(advisory) ? advisory : requested;
  return `slide-${index}.${ext}`;
}

export function httpSlideRendererFromEnv(
  url = process.env.OD_SLIDE_RENDERER_URL,
  daemonOrigin = process.env.OD_SLIDE_RENDERER_DAEMON_URL,
): SlideRenderer | null {
  const base = (url || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return async (
    input: DesktopRenderSlidesInput,
    options?: { signal?: AbortSignal },
  ): Promise<DesktopRenderSlidesResult> => {
    const reachableBaseHref =
      input.baseHref === undefined ? undefined : renderReachableBaseHref(input.baseHref, daemonOrigin);
    const request: DesktopRenderSlidesInput =
      reachableBaseHref === undefined || reachableBaseHref === input.baseHref
        ? input
        : { ...input, baseHref: reachableBaseHref };
    // Two independent reasons to stop: the render is taking implausibly long,
    // and nobody is waiting for it any more. The second one matters here in a
    // way it does not for the co-located renderer — a remote one keeps
    // executing the artifact and holding tens of MB of response for a consumer
    // that has already gone.
    const timeout = AbortSignal.timeout(SLIDE_RENDERER_HTTP_TIMEOUT_MS);
    const signal = options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    const res = await fetch(`${base}${SLIDE_RENDERER_HTTP_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    // A non-2xx means the RENDERER is broken (down, overloaded, misconfigured) —
    // a different thing from "this HTML cannot be rendered", and it needs a
    // different action from whoever sees it. Throwing lets the export route
    // report it as an upstream failure instead of dressing it up as a render
    // result the user is expected to act on.
    if (!res.ok) {
      let detail = `slide renderer responded HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: unknown };
        if (body?.error) detail = String(body.error);
      } catch {
        // Not a JSON error body — keep the status-code wording.
      }
      throw new Error(detail);
    }
    // A render that legitimately failed (no slides, page too tall) comes back as
    // JSON in the contract's own shape, so the route maps it exactly as it maps
    // the desktop renderer's.
    if ((res.headers.get('content-type') || '').includes('application/json')) {
      return (await res.json()) as DesktopRenderSlidesResult;
    }
    // Decoding validates the whole frame before anything is written, so a
    // truncated response cannot leave half an export on disk.
    const { parts, result } = decodeSlideRenderFrame(await res.arrayBuffer());
    if (!input.outputDir) throw new Error('slide renderer handoff requires outputDir');
    // What came back is decided by what was ASKED for, never by what the renderer
    // called the files. `part.name` is advertised as advisory, so treating it as
    // meaningful would contradict the published protocol — and would make a
    // conforming renderer that returns `deck` or `deck.PPTX` produce a
    // successfully written export the route then rejects as having no PPTX.
    if (input.editable && parts.length !== 1) {
      throw new Error(`editable render returned ${parts.length} payloads, expected exactly 1`);
    }
    if (!input.editable && parts.length === 0) {
      throw new Error('slide render returned no payloads');
    }
    await fs.promises.mkdir(input.outputDir, { recursive: true });
    const written: string[] = [];
    for (const [index, part] of parts.entries()) {
      // The daemon names the files, from the request and the position in the
      // frame. Deriving them from `part.name` let two parts named `a/slide.png`
      // and `b/slide.png` collapse onto one basename, silently overwrite each
      // other and return the same path twice — a multi-slide export quietly
      // losing slides. Positional names cannot collide.
      const file = path.join(input.outputDir, slideRendererOutputName(input, part.name, index));
      await fs.promises.writeFile(file, part.body);
      written.push(file);
    }
    if (input.editable) return { ...result, pptxFile: written[0]! };
    return { ...result, slideFiles: written };
  };
}
