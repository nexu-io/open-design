import { KIT_RUNTIME_JS } from "./kit-runtime.js";
import { KIT_MATH_JS } from "./kit-math.generated.js";
import { XRAY_MODES } from "./xray-modes.js";

/**
 * One asset in a kit page.
 */
export interface KitEntry {
  /** Display name, e.g. "Crate". */
  name: string;
  /** Group heading, e.g. "Built" / "Structures". */
  category: string;
  /** URL of the GLB to render. Relative paths resolve against the page. */
  glb: string;
  /**
   * Issues the compiler raised against individual parts, keyed by part name.
   *
   * A diagnostic that lives only in some other panel means the user can be
   * looking straight at the broken part without knowing it is broken. The
   * card is where they are already looking.
   */
  partIssues?: Record<string, Array<{ code: string; severity: string; message: string }>>;
  parts?: number;
  /**
   * The part hierarchy, for the rail's tree view — this is the USD stage
   * breakdown (`n` name, `p` parent name or null, `t` census type such as
   * "MESH"/"EMPTY", `f` face count for meshes). Kept to single-letter keys
   * because it is inlined into the page once per scene, and bounded by the
   * writers: the rail is a browser, not an inspector.
   */
  tree?: Array<{
    n: string;
    p: string | null;
    t: string;
    f?: number;
    /** World-space dimensions in metres, 3dp. */
    d?: [number, number, number];
    /** Triangles. */
    r?: number;
    /** Bound material names (first few). */
    m?: string[];
    /**
     * Nature glyph flags, census-derived: `a` animated (keyframed),
     * `w` watertight, `x` textured.
     */
    y?: string;
    /** scene.json line that authored this part (clones → base's line). */
    o?: number;
    /** Ground gap in metres when the part floats past tolerance. */
    g?: number;
    /** Bone count, on armature rows. */
    b?: number;
    /** Mean texel density in px/m, on textured meshes. */
    x?: number;
  }>;
  /**
   * Material name → display hex colour, for the part card's swatches.
   * Entry-level (not per row) so a material bound to thirty parts costs
   * its colour once.
   */
  matColors?: Record<string, string>;
  /**
   * Material name → census-measured PBR facts, for the card's material
   * panel. Colours are LINEAR floats (matching the glTF factors the
   * renderer draws with and the Principled inputs a tweak writes back);
   * the page owns the sRGB conversion for swatches. Every key optional,
   * every absence a fact the census did not measure: `c` baseColor,
   * `r` roughness, `m` metallic, `e` emission colour + `s` strength
   * (present only when the material actually emits), `a` alpha when < 1,
   * `t` textured, `u` bound-object count.
   */
  mats?: Record<
    string,
    {
      c?: [number, number, number];
      r?: number;
      m?: number;
      e?: [number, number, number];
      s?: number;
      a?: number;
      t?: 1;
      u?: number;
    }
  >;
  /** Animation clip names in the scene, shown on rig rows' cards. */
  clips?: string[];
  /** The claims ledger, for the ident's quiet badge. `checked` gates the
   *  badge: unadjudicated claims (no census) are not held. */
  claims?: { declared: number; failed: number; checked?: number };
  /** Scene path the entry compiled from — also the tweak write-back target. */
  scenePath?: string;
  issueCodes?: string[];
  ok?: boolean;
  /**
   * Derived asset kind (`animation`, `prop`, `texture`, …). The rail shows
   * a small kind glyph per row when the kit MIXES kinds — a rail of twelve
   * identical cubes is noise, a mixed kit earns the differentiation — and
   * the ident hands it to the host so its toolbar chip can draw the same
   * glyph the compile panel does.
   */
  kind?: string;
}

export interface KitPage {
  title: string;
  entries: KitEntry[];
  /**
   * Catalog roll-up: the kit's grade and the codes that recur across scenes.
   * Rendered as a static banner in the rail head — the portfolio verdict for
   * the whole set, distinct from the per-scene identity chip. Absent, or a
   * clean `pass` with nothing systemic, renders nothing.
   */
  rollup?: { grade: string; systemic: Array<{ code: string; scenes: number; title?: string }> };
  /**
   * API root for this project, e.g. `/api/projects/<id>`.
   *
   * Baked in by whichever writer knows the project, because the page cannot
   * always work it out for itself: a host that renders the preview through
   * an iframe's `srcDoc` leaves `location` pointing somewhere other than
   * this file, and the page would silently conclude it has nowhere to save.
   * When absent the page still falls back to reading its own URL.
   */
  apiBase?: string;
}

/**
 * Render a self-contained kit browser and editor.
 *
 * Layout follows the pattern every serious viewer converges on (O3DE,
 * Substance Viewer, Sketchfab): the viewport IS the page, and everything
 * else is a floating overlay it can reclaim. The catalogue is a collapsible
 * left rail, the identity/verdict line is a slim top-left chip, and the
 * controls hint is a bottom bar. Downloads are deliberately NOT in-page:
 * the host's Export menu owns them (fed by the artifact sidecar's
 * `metadata.deliverables`), so the page never grows a second download
 * control that drifts out of sync with the host's.
 *
 * Editing is deliberately Tinkercad-shaped, not Blender-shaped: click
 * selects, dragging the selected part slides it on the ground plane,
 * PageUp/PageDown (or Shift-drag) lifts it, holding Ctrl snaps to 5mm.
 * There is no rotation, no scaling, and no free 3D handle — one gesture
 * that cannot produce a state you can't see. Edits accumulate locally,
 * "Save" writes them to the compiler's tweaks.json through the daemon, and
 * "Reset" clears them. The compile loop replays saved tweaks, so the next
 * agent turn sees exactly what the user did.
 */
export function renderKitHtml(page: KitPage): string {
  // The payload is injected raw into an inline <script> below, and
  // JSON.stringify does NOT escape '<' — so a part name, title, or prim name
  // carrying "</script>" would close the tag and break (or hijack) the page.
  // Escape the HTML-significant characters at this boundary, where the string
  // meets the markup: the renderer owns its own safety rather than trusting
  // every upstream name to be HTML-clean. < etc. are valid JSON escapes
  // that parse back to the same characters, so the data is unchanged; the two
  // line separators are escaped because they are legal in JSON but were not in
  // JS string literals historically.
  const data = JSON.stringify(page)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  // The shared x-ray mode catalogue, serialised into the page so the menu
  // is built from the same source the host panel's mirror pins against.
  const xrayModesJson = JSON.stringify(XRAY_MODES)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  // String.raw, not a plain template: the viewer's script is authored in
  // here, and a plain literal silently eats every backslash — so a regex
  // written as \d compiles as d and quietly matches the wrong thing. That
  // failure is invisible until the page misbehaves at runtime.
  return String.raw`<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(page.title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f4f2ee; --panel: #fdfcfa; --line: #e3ded6; --ink: #1b1815; --muted: #6f6862;
    --chip: #efebe4; --chip-on: #2c2723; --chip-on-ink: #ffffff;
    --ok: #1f8a5f; --bad: #c0392b; --accent: #2c2723;
    --ease: cubic-bezier(0.23, 1, 0.32, 1);
    --shadow: 0 2px 12px rgba(20, 15, 8, 0.08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14120f; --panel: #1d1a16; --line: #2b2620; --ink: #ece7e0; --muted: #9b938a;
      --chip: #241f1a; --chip-on: #ece7e0; --chip-on-ink: #14120f; --accent: #ece7e0;
      --shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--ink); overflow: hidden;
    font: 13px/1.5 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  }

  /* The viewport owns the page; everything else floats over it. */
  #c { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
  #c.dragging { cursor: grabbing; }
  #c.editing { cursor: move; }

  /* Layer scale.
     Three bands, in the order the user reasons about them: the scene, the
     things drawn INTO the scene, and the application chrome. Chrome is
     always on top — a handle that paints over the asset list makes the list
     unclickable and looks broken. The gap between bands leaves room to
     insert a layer without renumbering everything. */
  .overlay { position: absolute; z-index: 10; }

  /* Identity chip: JUST the name. The verdict is the name's colour, the
     stats live in the hover title — every extra word here is viewport the
     asset does not get. When the page runs inside the Open Design host the
     host acks the ident message and this chip hides entirely, because the
     host toolbar shows the same line beside Preview/Code. */
  .ident {
    top: 12px; left: 12px; display: flex; align-items: center;
    /* The three children are set independently and any of them can be
       empty, so the separation has to come from the layout rather than
       from padding baked into a string. Without it the chip reads
       "crate6 parts" and the flagged button touches the triangle count. */
    gap: 8px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 9px;
    padding: 6px 11px; box-shadow: var(--shadow); max-width: calc(100% - 24px);
  }
  .ident[hidden] { display: none; }
  .ident .name {
    font-weight: 600; font-size: 13.5px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 46vw;
  }
  .ident .name.ok { color: var(--ok); }
  .ident .name.bad { color: var(--bad); }
  .ident .meta {
    color: var(--muted); font-size: 12px; white-space: nowrap; flex: none;
    font-variant-numeric: tabular-nums;
  }

  /* Catalogue rail.
     Sized to the longest realistic asset name and no wider — the viewport
     is the point of the page, and a rail that reserves a third of it to
     show eight short words is taking space from the thing being judged.
     It hugs its content rather than stretching, so a two-asset kit does
     not render as a tall empty card. */
  .rail {
    top: 58px; left: 12px; width: 172px;
    max-height: calc(100% - 116px);
    /* Hosted (body.hosted): the Open Design host acked the ident message
       and owns the identity line, the in-page chip is gone — so the rail
       anchors to the top instead of leaving a dead band where the chip
       used to sit. */
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--panel); border: 1px solid var(--line); border-radius: 9px;
    box-shadow: var(--shadow);
    transition: transform 180ms var(--ease), opacity 180ms var(--ease);
  }
  .rail.hidden { transform: translateX(-8px); opacity: 0; pointer-events: none; }
  .hosted .ident { display: none; }
  .hosted .rail { top: 12px; max-height: calc(100% - 70px); }
  /* The toggle is the rail's other half and has to move with it. Shifting
     only the rail left the button stranded at the chip's old offset, so
     collapsing the list revealed a dead band above it — the exact gap the
     hosted rule exists to remove. Anything anchored to that chip's height
     belongs in this rule. */
  .hosted .rail-toggle { top: 12px; }
  .rail-head {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 8px 7px 11px; border-bottom: 1px solid var(--line);
    font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
  }
  .rail-head .count { margin-left: auto; font-variant-numeric: tabular-nums; }
  /* Catalog roll-up: the portfolio verdict for the whole kit, distinct from the
     per-scene identity chip. A clean pass renders nothing, so it never adds
     chrome to a healthy set. */
  .rollup {
    padding: 7px 10px 8px; border-bottom: 1px solid var(--line);
    font-size: 10px; color: var(--muted);
  }
  .rollup-grade {
    font-weight: 600; letter-spacing: .09em; text-transform: uppercase; font-size: 9.5px;
  }
  .rollup-fail .rollup-grade { color: var(--bad); }
  .rollup-attention .rollup-grade { color: #c8901e; }
  .rollup-pass .rollup-grade { color: var(--ok); }
  .rollup-label {
    margin: 6px 0 3px; font-size: 9px; letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted);
  }
  .rollup-list { list-style: none; margin: 0; padding: 0; }
  .rollup-list li {
    display: flex; justify-content: space-between; gap: 8px;
    padding: 1px 0; font-variant-numeric: tabular-nums;
  }
  .rollup-code { color: var(--ink); }
  .rollup-n { color: var(--muted); white-space: nowrap; }
  /* The fade tells you there is more below without stealing a scrollbar's
     worth of width from an already-narrow rail. */
  .rail-scroll { overflow-y: auto; padding: 5px 5px 6px; scrollbar-width: thin; }
  /* The fade means "there is more below". Applying it unconditionally
     dimmed the last row of a list that fitted perfectly, which reads as a
     rendering fault rather than an affordance. */
  .rail-scroll.scrollable {
    padding-bottom: 10px;
    mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent 100%);
  }
  .group {
    font-size: 9.5px; letter-spacing: .11em; text-transform: uppercase; color: var(--muted);
    margin: 9px 0 3px; padding: 0 6px;
  }
  .group:first-child { margin-top: 2px; }

  /* Rows, not chips: a vertical list reads as a list, wraps nothing, and
     lets a long name ellipsize instead of widening the whole rail.
     Font is set in longhands, never the "font:" shorthand — "inherit" is
     not a valid family inside the shorthand, so the whole declaration
     silently drops and the generic button rule (12px/1 + shadow) takes
     over, clipping every descender in the list. box-shadow and the
     :active transform are reset for the same reason: list rows must not
     wear button chrome. */
  .chip {
    display: flex; align-items: center; gap: 6px; width: 100%;
    font-family: inherit; font-size: 12.5px; font-weight: 400; line-height: 1.45;
    text-align: left;
    background: transparent; color: var(--ink);
    border: 0; border-radius: 6px; box-shadow: none;
    padding: 6px 7px; cursor: pointer;
    transition: background 160ms var(--ease);
  }
  .chip:active, .tree-row:active { transform: none; }
  /* Hiding overflow for the ellipsis also clips the line box, so the line
     must be tall enough to contain descenders — otherwise every name with
     a j/y/g/p loses its tail. */
  .chip .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.45; }
  .chip .n { margin-left: auto; font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .chip:hover { background: var(--chip); }
  .chip[aria-pressed="true"] { background: var(--chip-on); color: var(--chip-on-ink); }
  .chip[aria-pressed="true"] .n { color: color-mix(in srgb, var(--chip-on-ink) 65%, transparent); }
  .chip .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--bad); flex: none; }
  .chip .dot.ok { display: none; }
  /* Per-row kind glyph (mixed-kind kits only): quiet, after the name. */
  .chip .kindg { flex: none; display: inline-flex; color: var(--muted); opacity: 0.75; }
  .chip .kindg svg { display: block; }
  .chip[aria-pressed="true"] .kindg { color: color-mix(in srgb, var(--chip-on-ink) 70%, transparent); }

  /* Part tree under a scene row — the USD stage breakdown. Rows carry the
     prim name only; type, face count, and the full prim path live in the
     hover title, and alt-click copies the path for usdview/scripting. */
  .chip .caret {
    width: 14px; height: 14px; flex: none; display: inline-flex;
    align-items: center; justify-content: center; border-radius: 4px;
    color: var(--muted); transition: transform 160ms var(--ease);
  }
  .chip .caret:hover { background: var(--chip); color: var(--ink); }
  .chip[aria-pressed="true"] .caret { color: inherit; }
  .chip .caret.open { transform: rotate(90deg); }
  .tree { margin: 0 0 3px; }
  .tree[hidden] { display: none; }
  .tree-row {
    display: flex; align-items: center; gap: 5px; width: 100%;
    font-family: inherit; font-size: 11.5px; font-weight: 400; line-height: 1.5;
    text-align: left;
    background: transparent; color: var(--ink);
    border: 0; border-radius: 5px; box-shadow: none;
    padding: 2.5px 6px; cursor: pointer;
  }
  .tree-row:hover { background: var(--chip); }
  .tree-row.sel { background: var(--chip-on); color: var(--chip-on-ink); }
  .tree-row .tname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Nature glyphs: quiet by default, legible on the selected row. */
  .tree-row .tglyphs {
    flex: none; display: inline-flex; align-items: center; gap: 2.5px;
    color: color-mix(in srgb, var(--muted) 75%, transparent);
  }
  .tree-row .tglyphs svg { width: 7px; height: 7px; fill: currentColor; display: block; }
  .tree-row.sel .tglyphs { color: color-mix(in srgb, var(--chip-on-ink) 60%, transparent); }
  /* The float whisper: a placement fact, amber-leaning but never loud. */
  .tree-row .tfloat {
    flex: none; font-size: 9px; color: #a8730f; opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }
  .tree-row.sel .tfloat { color: var(--chip-on-ink); opacity: 0.75; }
  .tree-row .ttype {
    margin-left: auto; flex: none; font-size: 9px; letter-spacing: .04em;
    text-transform: lowercase; color: var(--muted);
  }
  .tree-row.sel .ttype { color: color-mix(in srgb, var(--chip-on-ink) 65%, transparent); }
  /* Instance count on a prototype row: the "x8" that replaced eight
     identical rows. Quiet pill, tabular so counts align down the rail. */
  .tree-row .tcount {
    flex: none; font-size: 9.5px; font-weight: 600; color: var(--muted);
    background: var(--chip); border-radius: 999px; padding: 0 5px;
    line-height: 1.5; font-variant-numeric: tabular-nums;
  }
  .tree-row:hover .tcount { background: color-mix(in srgb, var(--muted) 18%, transparent); }
  .tree-row.sel .tcount {
    background: color-mix(in srgb, var(--chip-on-ink) 20%, transparent);
    color: var(--chip-on-ink);
  }

  .rail-toggle {
    top: 58px; left: 12px; z-index: 11;
    width: 28px; height: 28px; display: grid; place-items: center;
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    cursor: pointer; box-shadow: var(--shadow); color: var(--muted);
    padding: 0;
  }
  /* An author display value beats the UA sheet's [hidden] rule, so a
     grid/flex control stays visible after being hidden unless this is
     restated. */
  .rail-toggle[hidden] { display: none; }
  .rail-toggle.rail-open { opacity: 0; pointer-events: none; }
  .rail-hide {
    display: grid; place-items: center;
    background: transparent; border: 0; box-shadow: none; padding: 3px;
    color: var(--muted); cursor: pointer; border-radius: 5px;
  }
  .rail-hide:hover { background: var(--chip); border-color: transparent; }
  /* Icons are inline SVG, never font glyphs: a box-drawing or arrow
     character silently renders as tofu wherever the font lacks it, and the
     control then looks broken rather than plain. */
  .icon { width: 13px; height: 13px; display: block; fill: none;
    stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .caret { width: 11px; height: 11px; color: var(--muted); }

  /* Selection + edit state, floated near the top right. */
  .selection {
    top: 12px; right: 12px; display: flex; align-items: center; gap: 8px;
  }
  .picked {
    font: 500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--chip-on); color: var(--chip-on-ink);
    border-radius: 6px; padding: 6px 9px; box-shadow: var(--shadow);
  }
  .picked:empty { display: none; }

  /* In-world label. Anchored to the selection and offset just enough to
     clear it, so it reads as belonging to the geometry rather than to the
     window. It never blocks the pointer — the model stays draggable
     underneath, which is the difference between a hint and a panel. */
  /* Placed beside the selection's screen bounds, never centred over it:
     the gizmo's vertical arrow rises from exactly that point, and a card
     sitting on the handle you are reaching for is worse than no card. */
  .tip {
    position: absolute; z-index: 2; pointer-events: none;
    background: var(--panel); border: 1px solid var(--line); border-radius: 9px;
    box-shadow: var(--shadow); padding: 8px 10px; min-width: 150px; max-width: 210px;
    opacity: 0; transition: opacity 160ms var(--ease);
  }
  .tip.on { opacity: 1; }
  /* Title row: the name takes the space, the controls take what they
     need. Laid out rather than absolutely positioned, so the name
     ellipsises against the buttons instead of running underneath them. */
  .tip .thead { display: flex; align-items: center; gap: 6px; }
  .tip .tname {
    font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1 1 auto; min-width: 0;
  }
  /* Two glyphs, no chrome.
     A button here competes with a part name, a measurement, a compiler
     finding and a neighbourhood map inside 210px — so it is drawn as
     nothing but its own outline, quiet enough to ignore and present enough
     to find. It brightens on hover, and stays bright while it is holding a
     non-default state, because "the handles are hidden" is something the
     card has to keep saying or the viewport looks broken. */
  .tip .tools { display: flex; align-items: center; gap: 1px; flex: none; margin-right: -3px; }
  .tip .tbtn {
    pointer-events: auto; cursor: pointer;
    background: none; border: 0; padding: 3px; border-radius: 5px;
    color: var(--muted); opacity: .4; line-height: 0;
    transition: opacity 120ms var(--ease), background 120ms var(--ease);
  }
  .tip .tbtn svg { width: 13px; height: 13px; display: block; }
  .tip .tbtn svg path, .tip .tbtn svg circle {
    fill: none; stroke: currentColor; stroke-width: 1.5;
    stroke-linecap: round; stroke-linejoin: round;
  }
  .tip .tbtn:hover { opacity: 1; background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .tip .tbtn:focus-visible { opacity: 1; outline: 1.5px solid var(--accent); outline-offset: 1px; }
  /* Pressed = the handles are hidden. The slash appears and the eye stays
     lit, so the state is legible without reading a tooltip. */
  .tip .tbtn[aria-pressed="false"] { opacity: .9; }
  /* The pin holds a non-default state while ENGAGED, so that is when it
     stays lit — inverse polarity from the eye, same principle: the card
     keeps saying "you pinned me" or the ignored deselects look broken. */
  .tip .tbtn-pin[aria-pressed="true"] { opacity: 1; color: var(--ink); }
  .tip .tbtn .off-glyph { opacity: 0; }
  .tip .tbtn[aria-pressed="false"] .off-glyph { opacity: 1; }
  .tip .tbtn[aria-pressed="false"] .on-glyph { opacity: .45; }
  /* The chevron points the way the card will move. */
  .tbtn-fold svg { transition: transform 140ms var(--ease); }
  .tip .tbtn-fold[aria-expanded="false"] svg { transform: rotate(-90deg); }
  /* Collapsed: the name and its controls, nothing else. The card keeps its
     anchor and its leader, so the part stays identified while the view of
     it is unobstructed. */
  .tip.folded .terr, .tip.folded .tdim, .tip.folded .tedit, .tip.folded .tnear,
  .tip.folded .tfacts {
    display: none;
  }
  /* nowrap: the card's measured size is cached, so a dimension string that
     wrapped to a second line would make the cached height a lie and the
     bottom-edge clamp under-reserve space. */
  /* nowrap keeps the cached card height honest, so this must also clip
     rather than spill — a nowrap line with nowhere to go runs straight out
     of the card, which is exactly what happened once a second fact was
     appended to it. */
  .tip .tdim {
    font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums;
    margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* Compiler facts for the selected part: triangles, materials, nature
     glyphs, source line. One quiet row under the dimensions — same voice,
     same nowrap/clip contract so the cached card height stays honest. */
  .tip .tfacts {
    font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums;
    margin-top: 2px;
    /* Wrap, never clip: a facts row that ends in a cut-off swatch or a
       half source-line reads as broken. Filled only in updateTip, which
       re-measures the card afterwards, so wrapping keeps the cached
       height honest. */
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px;
  }
  .tip .tfacts[hidden] { display: none; }
  .tip .tfacts .tsw {
    display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent);
    flex: none; vertical-align: middle;
  }
  .tip .tfacts .tsrc {
    color: inherit; background: none; border: 0; padding: 0; font: inherit;
    cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px;
  }
  .tip .tfacts .tsrc:hover { color: var(--ink); }
  /* The material chip is a DOOR, not a label: it opens the card's material
     panel, so it has to read as pressable without shouting over the other
     facts. Same quiet voice, plus a hover that promises the click. */
  .tip .tfacts .tmatchip {
    display: inline-flex; align-items: center; gap: 3px; min-width: 0;
    background: none; border: 0; padding: 1px 4px; margin: -1px -4px;
    border-radius: 5px; font: inherit; color: inherit; cursor: pointer;
    pointer-events: auto;
    transition: background 120ms var(--ease), color 120ms var(--ease);
  }
  .tip .tfacts .tmatchip:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink);
  }
  .tip .tfacts .tmatchip:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }

  /* Material panel — the card, gone deep on one material.
     The SAME card expands rather than a second window appearing: the fold
     chevron pivots into a back arrow (one control, two directions of the
     same journey — the design language for anything "in depth" within a
     part), the shallow facts hide, and the panel takes the space. Native
     primitives only: a color input is the platform's picker, a range is
     the platform's slider — no reinvented widgets to drift or break. */
  /* FIXED width, not max-width: the panel is full of live numeric
     readouts, and a content-sized card re-measured itself on every value
     change — the whole panel flickered skinny/wide as "0.9" became
     "0.85 · 1". A fixed footprint means a changing number changes ONLY
     that number. */
  .tip.mat { width: 246px; max-width: 246px; }
  .tip.mat .terr, .tip.mat .tdim, .tip.mat .tedit, .tip.mat .tnear, .tip.mat .tfacts {
    display: none;
  }
  /* In mat mode the chevron points BACK the way you came, and stays lit:
     it is now the only way home. The same 140ms transform transition that
     animates the fold animates the pivot, so collapse-into-back reads as
     one control turning, not two controls swapping. Depth is COUNTED on
     the control itself: a second chevron fades in per extra level (one for
     the panel, two for the gallery), and falls away as you surface — the
     button is a breadcrumb you can read without moving your eyes. */
  .tip.mat .tbtn-fold { opacity: .9; }
  .tip.mat .tbtn-fold svg { transform: rotate(90deg); }
  .tbtn-fold .chev2 { opacity: 0; transition: opacity 140ms var(--ease); }
  .tip.gal .tbtn-fold .chev2 { opacity: 1; }
  .tip .tmat { margin-top: 7px; border-top: 1px solid var(--line); padding-top: 7px; }
  .tip .tmat[hidden] { display: none; }
  .tip .tmat, .tip .tmat * { pointer-events: auto; }
  .tmat .mhead { display: flex; align-items: center; gap: 8px; min-width: 0; }
  /* The head preview is a RENDERED ball — the same shader, lights and
     textures as the viewport, so it cannot lie — and it turns slowly while
     the panel is open, because a material is an angular phenomenon: a
     static thumbnail of brushed metal is just grey. */
  .tmat .mhead .msw {
    width: 30px; height: 30px; flex: none; display: block;
    filter: drop-shadow(0 1px 2px rgba(20, 15, 8, 0.25));
  }
  .tmat .mhead .mname {
    font: 600 11.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  }
  .tmat .mhead .muse { color: var(--muted); font-size: 10px; flex: none; margin-left: auto; }
  /* The picker: every material the compile shipped, as swatch dots. The
     current binding wears the accent ring; hover lifts. This is "assign",
     the cheapest possible restyle — no values invented, just rebinding to
     something that already exists in the kit. */
  .tmat .mswap { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  /* Each option is a small rendered ball of that material — its real
     factors AND its real texture, spun on hover. Assignment is picking a
     ball off the shelf, which is exactly what it looks like. */
  .tmat .mswap .mopt {
    width: 24px; height: 24px; border-radius: 50%; cursor: pointer; padding: 0;
    border: 0; background: none; position: relative;
    transition: transform 140ms var(--ease);
  }
  .tmat .mswap .mopt canvas { width: 100%; height: 100%; display: block; }
  .tmat .mswap .mopt:hover { transform: scale(1.22); }
  .tmat .mswap .mopt:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }
  .tmat .mswap .mopt.on::after {
    content: ''; position: absolute; inset: -3px; border-radius: 50%;
    border: 1.5px solid var(--accent); pointer-events: none;
  }
  /* Divider between the scene's own shelf and the rest of the kit's. */
  .tmat .mswap .mshelf-div {
    width: 1px; height: 18px; align-self: center; flex: none;
    background: var(--line);
  }
  /* The gallery door: dashed, quiet, always last on the shelf. Opens the
     browsable material gallery — the shelf shows a taste, this shows
     everything. */
  .tmat .mswap .mbrowse {
    border: 1.2px dashed color-mix(in srgb, var(--ink) 30%, transparent);
    color: var(--muted); display: flex; align-items: center; justify-content: center;
  }
  .tmat .mswap .mbrowse:hover { color: var(--ink); border-style: solid; }
  .tmat .mswap .mbrowse svg { width: 12px; height: 12px; display: block; fill: currentColor; }

  /* Material gallery — the panel, gone one level deeper again. The same
     journey grammar: the chevron stays the way back, the search is a
     native input, the grid scrolls INSIDE the card so the page never
     grows a second window. Group headers stick while their group scrolls. */
  .tip.gal { width: 268px; max-width: 268px; }
  .tmat .mgal-head { display: flex; align-items: center; gap: 6px; }
  .tmat .mgal-head input {
    flex: 1 1 auto; min-width: 0; background: var(--chip);
    border: 1px solid transparent; border-radius: 6px; padding: 3px 8px;
    font: inherit; font-size: 11px; color: var(--ink); outline: none;
  }
  .tmat .mgal-head input:focus { border-color: var(--accent); }
  .tmat .mgal-head .mgal-count {
    flex: none; color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums;
  }
  .tmat .mgal {
    max-height: 238px; overflow-y: auto; overscroll-behavior: contain;
    margin-top: 6px; padding-right: 2px;
  }
  .tmat .mgal .mgroup {
    font-size: 9px; text-transform: uppercase; letter-spacing: .07em;
    color: var(--muted); padding: 6px 0 4px;
    position: sticky; top: 0; background: var(--panel); z-index: 1;
  }
  .tmat .mgal .mgroup[hidden] { display: none; }
  .tmat .mgal .mgrid { display: flex; flex-wrap: wrap; gap: 5px 7px; }
  .tmat .mgal .mitem {
    width: 46px; background: none; border: 0; padding: 3px 1px 2px;
    border-radius: 7px; cursor: pointer; position: relative;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    transition: background 120ms var(--ease);
  }
  .tmat .mgal .mitem[hidden] { display: none; }
  .tmat .mgal .mitem:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .tmat .mgal .mitem:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }
  .tmat .mgal .mitem canvas { width: 26px; height: 26px; display: block; }
  .tmat .mgal .mitem .mlab {
    font-size: 8.5px; color: var(--muted); max-width: 46px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tmat .mgal .mitem.on::after {
    content: ''; position: absolute; inset: 0; border-radius: 7px;
    border: 1.5px solid var(--accent); pointer-events: none;
  }
  .tmat .mgal .mempty { color: var(--muted); font-size: 10px; padding: 8px 0; }
  /* The surface pad: roughness and metallic are ONE appearance space —
     polished dielectric, matte, brushed, mirror metal are its corners —
     so they get one 2D instrument, not two abstract sliders. The field
     behind the dot is computed with the viewport's own lighting math, so
     the pad shows appearance, not axes. */
  .tmat .mpad { position: relative; margin-top: 7px; }
  .tmat .mpad canvas {
    display: block; width: 100%; height: 64px; border-radius: 7px;
    border: 1px solid var(--line); cursor: crosshair; touch-action: none;
  }
  .tmat .mpad .mdot {
    position: absolute; width: 11px; height: 11px; border-radius: 50%;
    border: 1.5px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
    transform: translate(-50%, -50%); pointer-events: none;
  }
  .tmat .mpad .mtag {
    position: absolute; font-size: 7.5px; letter-spacing: .07em;
    text-transform: uppercase; color: #fff; opacity: .5; pointer-events: none;
    text-shadow: 0 0 2px rgba(0,0,0,0.6);
  }
  /* One row per property: a 46px label, then the platform's own control.
     accent-color hands the range and color chrome to the theme. */
  .tmat .mrow { display: flex; align-items: center; gap: 7px; margin-top: 6px; }
  .tmat .mrow label {
    flex: none; width: 48px; color: var(--muted); font-size: 10px;
    letter-spacing: .04em; text-transform: uppercase;
    /* The touched dot rides the label; wrapping it to a second line reads
       as a stray bullet, so the label never wraps. */
    white-space: nowrap;
  }
  .tmat .mrow input[type="range"] {
    flex: 1 1 auto; min-width: 0; height: 14px; margin: 0; accent-color: var(--accent);
  }
  .tmat .mrow input[type="color"] {
    flex: none; width: 26px; height: 18px; padding: 0; border: 1px solid var(--line);
    border-radius: 5px; background: none; cursor: pointer;
  }
  .tmat .mrow .mnum {
    flex: none; width: 30px; text-align: right; color: var(--muted);
    font: 500 10px/1 ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums;
  }
  /* An overridden row says so: the label brightens and wears a dot, so
     "which of these did I touch" never needs remembering. Clicking the
     label puts the property back — the dot is also the undo. */
  .tmat .mrow label { cursor: default; }
  .tmat .mrow.touched label { color: var(--ink); cursor: pointer; }
  .tmat .mrow.touched label::after { content: ' •'; color: var(--accent); }
  .tmat .mnote { margin-top: 7px; color: var(--muted); font-size: 10px; line-height: 1.45; }
  .tip .tnear { margin-top: 7px; border-top: 1px solid var(--line); padding-top: 6px; }
  /* Neighbourhood map.
     A flat list of names says which parts touch; it cannot say how they
     are stacked. This lays the neighbours out the way they actually sit in
     the world — supports below, supported above, siblings to the sides —
     so an asset the user has never opened before still reads structurally
     at a glance. Selection happens by clicking the map, which is why there
     are no longer any buttons here. */
  .tip .tmap { display: block; width: 168px; height: 96px; pointer-events: auto; overflow: visible; }
  .tip .tmap .edge { stroke: var(--muted); stroke-width: 1.4; stroke-linecap: round; }
  /* Dashed and rising = this neighbour is carried BY the selected part.
     Solid = it carries the selected part. One glance answers "what happens
     if I move this". */
  .tip .tmap .edge.up { stroke-dasharray: 2.5 2.5; }
  .tip .tmap .tmore { font: 500 8px ui-monospace, Menlo, monospace; fill: var(--muted); text-anchor: end; }
  .tip .tmap .node rect {
    fill: var(--chip); stroke: transparent; stroke-width: 1.2; rx: 4;
    transition: fill 120ms var(--ease), stroke 120ms var(--ease);
  }
  .tip .tmap .node text {
    font: 500 8.5px/1 ui-monospace, Menlo, monospace; fill: var(--ink);
    text-anchor: middle; dominant-baseline: middle; pointer-events: none;
  }
  .tip .tmap .node { cursor: pointer; }
  .tip .tmap .node:hover rect { stroke: var(--muted); }
  .tip .tmap .node.self rect { fill: var(--chip-on); }
  .tip .tmap .node.self text { fill: var(--chip-on-ink); }
  .tip .tmap .node.picked rect { stroke: var(--accent); stroke-width: 1.6; }
  /* The card's hint line is gone. It repeated the bottom bar and never
     changed, so from the second selection onward it was permanent noise
     occupying the card's densest corner. Its two facts that were taught
     nowhere else moved to the bar. */
  /* While a drag is live the card steps back: the measurements box is the
     live readout, and two numeric readouts in one field — one moving, one
     stale — is a "which do I trust" problem. It stays visible enough to
     say WHICH part is in hand. */
  /* The leader sits between the scene and the card: above the gizmo so it
     is never buried, below the card so it appears to run underneath it. */
  .lead { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: visible; }
  .lead-line, .lead-dot {
    stroke: var(--muted); fill: none; opacity: 0;
    transition: opacity 140ms var(--ease);
  }
  .lead-line { stroke-width: 1.1; }
  .lead-dot { fill: var(--muted); stroke: none; }
  /* Unsaved edits. Muted, because it reports a fact rather than a problem,
     but always present when true so the card never shows an edited part as
     if it were untouched. */
  /* A finding against THIS part. Conditional, so a clean part pays
     nothing. It WRAPS instead of ellipsizing: this line is the one thing
     on the card the user actually has to read, and a finding cut to
     "claim grounded is adjudicated at…" says nothing. Wrapping is safe
     for the cached-size contract because the finding text only changes
     inside updateTip, which re-measures the card after filling it — the
     nowrap rule stays reserved for the dimension line, which IS updated
     live mid-drag without a re-measure. */
  .tip .terr {
    font: 600 10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
    margin-top: 2px; white-space: normal; overflow-wrap: anywhere;
  }
  .tip .terr.bad { color: var(--bad); }
  .tip .terr.warn { color: #a8730f; }
  /* Reported against geometry the user has since changed. Still worth
     showing — it may be why they are editing — but it no longer
     describes what is on screen, so it stops shouting. */
  .tip .terr.stale { color: var(--muted); font-weight: 500; }

  /* The route to a broken part. Deliberately quiet — it is a count, not an
     alarm — but it is a button, because its whole point is that it goes
     somewhere. Absent entirely when the scene is clean. */
  .jump {
    font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
    color: var(--bad); background: transparent; border: 1px solid transparent;
    border-radius: 6px; padding: 3px 6px; margin-left: 2px;
    cursor: pointer; box-shadow: none;
  }
  .jump::after { content: ' ›'; opacity: .7; }
  .jump:hover { border-color: var(--bad); }
  .jump[hidden] { display: none; }
  .tip .terr[hidden] { display: none; }
  .tip .tedit {
    font-size: 10px; color: var(--accent); margin-top: 3px; opacity: .85;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tip .tedit[hidden] { display: none; }
  /* Dimmed, not gutted, while a drag is in flight: the card steps back so
     the model and the gizmo read clearly, but every line it holds stays
     true. The size used to be blanked here — and the size is live, updated
     from applyEditsToDraws on every drag frame, so hiding it threw away
     the one number that is actually changing while you scale. */
  .tip.busy { opacity: .34; }

  /* Translate gizmo.
     Drawn as an SVG overlay rather than in the scene: handles stay crisp at
     any zoom, never z-fight with the geometry they sit on, and hit-testing
     is the browser's job instead of a second raycast. Axis colours follow
     the convention every DCC shares — X red, Y green, Z blue — so the
     widget is legible before it is explained. */
  .gizmo { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: visible; }
  .gizmo.off { display: none; }
  /* The whole widget sits on a soft drop shadow so it stays legible
     against both a pale floor and a dark prop without either outlining
     every edge or washing the colours out. One shadow on the container is
     cheaper than a stroke per element and reads cleaner. */
  .gizmo .axis, .gizmo .hub-arc { filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / .28)); }
  .gizmo .shaft {
    stroke-width: 2.5; stroke-linecap: round;
    transition: stroke-width 120ms var(--ease);
  }
  /* A fat invisible companion line: the visible shaft is 2.5px, which is
     far too thin to grab reliably. Width comes from GIZMO.grabWidth — the
     two are the same measurement and must not drift apart. */
  .gizmo .grab { stroke-width: 15; stroke: transparent; pointer-events: stroke; cursor: grab; }
  .gizmo .head {
    pointer-events: auto; cursor: grab; stroke: none;
    /* The head is one solid shape. Letting the shaft's round cap peek
       through its concave tail would read as a rendering artefact. */
    shape-rendering: geometricPrecision;
  }
  /* The painted hub. Stroke only — a filled disc would hide the geometry
     the widget is attached to, which is the one thing the user is looking
     at. Round caps let consecutive arcs meet without a visible seam. */
  .gizmo .hub-arc {
    fill: none; stroke-width: 2.2; stroke-linecap: round; pointer-events: none;
    transition: stroke-width 120ms var(--ease);
  }
  /* The hit target is transparent and sits over the arcs; the arcs are what
     you see, this is what you press. */
  .gizmo .ring {
    fill: transparent; stroke: transparent; stroke-width: 14;
    pointer-events: stroke; cursor: move;
  }
  /* The arcs precede the hit target in document order, so this cannot be a
     sibling selector — it has to reach up to the container. */
  .gizmo:has(.ring:hover) .hub-arc { stroke-width: 4; }
  /* Hover thickens the shaft toward the head's own width, so the handle
     grows into the shape it already implies instead of changing character.
     The other two axes recede rather than the hovered one shouting, which
     keeps the whole widget's weight on screen roughly constant. */
  .gizmo .axis.hot .shaft { stroke-width: 4.5; }
  .gizmo:has(.axis.hot) .axis:not(.hot) { opacity: .45; }
  .gizmo .axis { transition: opacity 120ms var(--ease); }
  .gizmo .axis.dim { opacity: .28; }
  /* Drag isolation. Everything not in your hand recedes to a whisper, and
     comes back when you let go. The transition is short enough that it
     reads as the widget responding to the grab, not as a fade you wait on. */
  .gizmo.dragging .axis:not(.active) { opacity: .12; }
  .gizmo.dragging .hub-arc { opacity: .18; }
  .gizmo.dragging .ball { opacity: .18; }
  .gizmo.dragging.centre-active .ball { opacity: 1; }
  .gizmo.dragging.centre-active .ball-rim { opacity: .5; }
  .gizmo.dragging .axis.active .ring-arc.back { opacity: .35; }
  .gizmo .axis, .gizmo .hub-arc, .gizmo .ball, .gizmo .ball-rim {
    transition: opacity 110ms var(--ease);
  }
  /* Rotation ring. Thin and semi-transparent at rest so three of them do
     not crowd the part; the whole axis brightens on hover, which is enough
     to say which one you have. */
  /* Rings are secondary to the arrows, so they are lighter in both weight
     and opacity. Three tiers of emphasis — arrow, ring, ball — is what
     stops the widget reading as a pile of equals. */
  .gizmo .ring-arc {
    fill: none; stroke-width: 1.5; opacity: .42; pointer-events: none;
    stroke-linecap: round;
    transition: opacity 120ms var(--ease), stroke-width 120ms var(--ease);
  }
  /* The far half of each ring. Faint enough to read as "behind", present
     enough that the ring is still legible as a complete circle. */
  .gizmo .ring-arc.back { opacity: .12; stroke-width: 1.2; }
  .gizmo .axis.hot .ring-arc { opacity: .95; stroke-width: 2.4; }
  .gizmo .axis.hot .ring-arc.back { opacity: .3; }
  .gizmo .ring-grab {
    fill: none; stroke: transparent; stroke-width: 12;
    pointer-events: stroke; cursor: grab;
  }
  /* Scale knob. Square, so it never reads as another rotation handle. */
  /* Trackball. Faint enough to read the geometry through, with a rim that
     gives it the silhouette of a sphere rather than a flat disc. */
  /* The trackball at rest is almost nothing: no rim, no edge, just the
     faintest warm haze that says "this middle area is grabbable". A hard
     outline here reads as a solid ball parked on top of the model, which
     is imposing and makes the widget feel heavier than the thing it edits.
     The rim appears only on hover, when you have already reached for it
     and the shape becomes useful rather than decorative. */
  .gizmo .ball {
    fill: url(#ballFade); stroke: none;
    pointer-events: fill; cursor: grab;
    transition: opacity 140ms var(--ease);
    opacity: .55;
  }
  .gizmo.ball-hot .ball { opacity: 1; }
  .gizmo .ball-rim {
    fill: none; stroke: var(--muted); stroke-width: 1; opacity: 0;
    pointer-events: none;
    transition: opacity 140ms var(--ease);
  }
  .gizmo.ball-hot .ball-rim { opacity: .45; }
  .gizmo .knob {
    pointer-events: auto; cursor: nwse-resize; rx: 1;
    transition: opacity 120ms var(--ease);
    opacity: .85;
  }
  .gizmo .axis.hot .knob { opacity: 1; }
  /* Invisible, and much larger than the glyph it stands in for. */
  .gizmo .knob-grab { fill: transparent; pointer-events: auto; cursor: nwse-resize; }

  /* ---- mode preview -------------------------------------------------
     Pointing at a tool brings that tool forward and pushes the other two
     back, so the widget always shows what your next click would do. */
  .gizmo .shaft, .gizmo .head, .gizmo .knob, .gizmo .ring-arc, .gizmo .tag {
    transition: opacity 110ms var(--ease), stroke-width 110ms var(--ease);
  }
  /* About to SCALE: knobs grow and brighten on every axis, the movement
     and rotation handles step back, and the part's own footprint appears
     so you can see the thing that is about to change size. */
  /* The hovered axis carries the hot class, whose ring rule is more
     specific than a plain mode rule — so without naming it here, the ring
     user is nearest stayed bright while every other element correctly
     stepped back, saying "rotate" at the exact moment the widget means
     "scale". Modes must beat hover, because the mode IS what the hover
     means. */
  /* ---- held modifiers ------------------------------------------------
     What a drag would do, shown before the drag starts.

     These are DEEMPHASIS rules only: nothing moves, nothing scales, nothing
     appears. Holding a key is a question, and the widget answers by
     quieting everything the key does not govern — so the eye lands on the
     controls that are still live without a single pixel of motion. The
     lattice itself is drawn in JS, as a dash pattern whose period is the
     snap increment, on the control the increment governs. */

  /* Shift constrains free movement to world vertical. The Y axis is the
     only handle that still means what it did, so the other two step back.
     The rings and knobs go with them: shift changes nothing about turning
     or resizing, and leaving them at full strength would imply it might. */
  .gizmo.mod-vertical .axis:not(.axis-y) .shaft,
  .gizmo.mod-vertical .axis:not(.axis-y) .head,
  .gizmo.mod-vertical .axis:not(.axis-y) .tag { opacity: .16; }
  .gizmo.mod-vertical .ring-arc, .gizmo.mod-vertical .knob { opacity: .1; }
  .gizmo.mod-vertical .axis.axis-y .shaft { stroke-width: 3.4; }

  /* Snap governs turning, moving and resizing alike, so nothing is dimmed —
     the lattice appears on each control instead. The hub quiets slightly
     because it is the one handle with no increment to show. */
  .gizmo.mod-snap .hub-arc { opacity: .3; }

  /* The dash pattern is the lattice, so it must not cross-fade between
     periods as the camera orbits — a dash sliding along a ring reads as
     motion the value is not making. */
  .gizmo .ring-arc, .gizmo .shaft { transition: opacity 120ms var(--ease); }

  .gizmo.mode-scale .ring-arc,
  .gizmo.mode-scale .axis.hot .ring-arc { opacity: .07; }
  .gizmo.mode-move .axis.hot .ring-arc { opacity: .08; }
  .gizmo.mode-trackball .axis.hot .ring-arc { opacity: .55; }
  .gizmo.mode-scale .shaft, .gizmo.mode-scale .head { opacity: .22; }
  .gizmo.mode-scale .ball { opacity: .1; }
  .gizmo.mode-scale .hub-arc { opacity: .16; }
  .gizmo.mode-scale .knob { opacity: 1; transform: scale(1.55); transform-box: fill-box; transform-origin: center; }
  .gizmo.mode-scale .bbox { opacity: .6; }
  /* About to ROTATE: rings forward, arrows and knobs back. */
  .gizmo.mode-rotate .shaft, .gizmo.mode-rotate .head { opacity: .2; }
  .gizmo.mode-rotate .knob { opacity: .12; }
  .gizmo.mode-rotate .ring-arc { opacity: .8; stroke-width: 2.2; }
  .gizmo.mode-rotate .hub-arc { opacity: .2; }
  /* About to MOVE: arrows forward, everything else back. */
  .gizmo.mode-move .ring-arc { opacity: .08; }
  .gizmo.mode-move .knob { opacity: .12; }
  .gizmo.mode-move .ball { opacity: .1; }
  /* About to free-rotate on the trackball: the ball is the subject. */
  .gizmo.mode-trackball .ring-arc { opacity: .55; }
  .gizmo.mode-trackball .shaft, .gizmo.mode-trackball .head { opacity: .25; }
  .gizmo.mode-trackball .knob { opacity: .12; }

  /* The selection's screen footprint. Only ever shown while scaling is
     imminent or underway — it is the answer to "what exactly am I about to
     resize", and at any other time it would be one more box on screen. */
  .gizmo .bbox {
    fill: none; stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3;
    opacity: 0; pointer-events: none;
    transition: opacity 140ms var(--ease);
  }
  /* A snap that landed on real geometry says so in the readout. */
  .measure.snapped { border-color: var(--ok); }
  .measure.snapped .mlabel { color: var(--ok); }
  .xray-btn {
    display: inline-flex; align-items: center; gap: 6px; margin-right: 8px;
    padding: 6px 10px; font-size: 11px; flex: none;
  }
  .xray-btn[aria-pressed="true"] { background: var(--chip-on); color: var(--chip-on-ink); border-color: transparent; }
  .xray-btn .icon { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.4; }
  /* X-ray split button: the toggle plus a caret that opens the mode menu.
     The caret hugs the toggle so they read as one control. */
  .xray-cluster { position: relative; display: inline-flex; align-items: stretch; margin-right: 8px; flex: none; }
  .xray-cluster .xray-btn { margin-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .xray-caret {
    display: inline-flex; align-items: center; justify-content: center; padding: 0 7px;
    margin-left: -1px; border-top-left-radius: 0; border-bottom-left-radius: 0;
  }
  .xray-caret svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.6;
    transition: transform 200ms var(--ease); }
  .xray-caret[aria-expanded="true"] svg { transform: rotate(180deg); }
  .xray-caret[aria-expanded="true"] { background: var(--chip-on); color: var(--chip-on-ink); border-color: transparent; }
  /* The menu is right-anchored to the caret and opens upward. Its width is
     fixed for a tidy column, but capped to the viewport so a narrow screen can
     never push it off the right edge; the --mdx custom property carries a JS
     edge-clamp offset so it can never spill off the left either. Descriptions
     wrap to a second line rather than clip. */
  .xray-menu {
    position: absolute; bottom: calc(100% + 7px); right: 0; z-index: 20;
    width: 272px; max-width: calc(100vw - 20px);
    max-height: calc(100vh - 24px); overflow-y: auto;
    display: flex; flex-direction: column; gap: 2px; padding: 6px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: var(--shadow);
    transform: translateX(var(--mdx, 0px));
    animation: xrayMenuIn 180ms var(--ease);
  }
  .xray-menu[hidden] { display: none; }
  .xray-menu-item {
    display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
    padding: 8px 10px; border: 1px solid transparent; border-radius: 9px; box-shadow: none;
    background: none; color: var(--ink);
    transition: background 140ms var(--ease), color 140ms var(--ease);
  }
  .xray-menu-item:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .xray-menu-item[aria-checked="true"] { background: var(--chip-on); color: var(--chip-on-ink); border-color: transparent; }
  .xray-menu-item .mi-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; }
  .xray-menu-item .mi-name { font: 600 12px/1.15 ui-sans-serif, system-ui, sans-serif; }
  .xray-menu-item .mi-desc { font-size: 10.5px; line-height: 1.3; opacity: .66; overflow-wrap: break-word; }
  /* The colour key rides in the menu row, not the viewport: a tiny ramp under
     the name so what the colours mean is here when you are choosing, and gone
     the rest of the time. */
  .xray-menu-item .mi-ramp { height: 5px; margin-top: 1px; border-radius: 3px; border: 1px solid rgba(0,0,0,.12); }
  .xray-menu-item[aria-checked="true"] .mi-ramp { border-color: rgba(255,255,255,.25); }
  .xray-menu-item[aria-checked="true"] .mi-desc { opacity: .82; }
  .xray-menu-item .mi-key {
    flex: none; margin-top: 1px; font: 600 9px/1 ui-monospace, Menlo, monospace;
    opacity: .5; border: 1px solid currentColor; border-radius: 4px; padding: 3px 5px;
    letter-spacing: .04em;
  }
  @keyframes xrayMenuIn { from { opacity: 0; transform: translate(var(--mdx, 0px), 5px); } to { opacity: 1; transform: translate(var(--mdx, 0px), 0); } }
  .gizmo .tag {
    font: 600 10px ui-monospace, Menlo, monospace; pointer-events: none;
    text-anchor: middle; dominant-baseline: central;
  }

  button {
    font: 500 12px/1 ui-sans-serif, system-ui, sans-serif; color: var(--ink);
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 8px 13px; cursor: pointer; box-shadow: var(--shadow);
    transition: border-color 200ms var(--ease), transform 140ms var(--ease);
  }
  button:hover { border-color: var(--muted); }
  button:active { transform: scale(0.97); }
  button.primary { background: var(--chip-on); color: var(--chip-on-ink); border-color: var(--chip-on); }
  button[hidden] { display: none; }

  /* Bottom bar: hint left, actions right. */
  .bottombar {
    left: 12px; right: 12px; bottom: 12px;
    display: flex; align-items: flex-end; gap: 10px;
  }
  /* The hint is reference, not instruction: it should be legible when
     looked for and invisible when not. */
  /* The hint yields first when the bar is tight: it is the only thing here
     the user can afford to lose, since the readout carries live state. */
  .hint { color: var(--muted); font-size: 11px; margin-right: auto; opacity: .72;
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: color-mix(in srgb, var(--bg) 70%, transparent); border-radius: 6px; padding: 4px 8px; }
  .hint b { font-weight: 500; color: var(--ink); opacity: .8; }
  /* Measurements box, after SketchUp's VCB: one fixed, always-in-the-same-
     place readout that shows what the current gesture is worth, and that
     you override by simply typing — no field to click into, no dialog. */
  .measure {
    display: flex; align-items: baseline; gap: 7px; margin-right: 10px;
    white-space: nowrap; flex: none;
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 4px 9px; box-shadow: var(--shadow); font-size: 12px;
    transition: opacity .14s cubic-bezier(0.23, 1, 0.32, 1);
  }
  .measure.off { display: none; }
  .mlabel { color: var(--muted); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
  .mval {
    font: 600 13px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink);
    min-width: 62px; text-align: right; font-variant-numeric: tabular-nums;
  }
  /* Polarity at a glance: the sign and unit take the direction colour while
     the magnitude stays in --ink, so a red "-" / green "+" reads instantly
     without the whole readout turning into a block of colour. Reuses the same
     --ok / --bad the rest of the viewer speaks (snap, error idents). */
  .mval .msign, .mval .munit { transition: color 120ms var(--ease); }
  .mval.neg .msign, .mval.neg .munit { color: var(--bad); }
  .mval.pos .msign, .mval.pos .munit { color: var(--ok); }
  /* While the user is typing an exact value, the box owns the number and
     says so — otherwise a live drag readout and a half-typed override look
     identical. */
  .measure.typing { border-color: var(--accent); }
  .measure.typing .mval::after { content: '_'; opacity: .55; }

  /* Live modifier chips — the two keys the gesture is listening to, shown
     right beside the readout so what ctrl / shift will do is legible BEFORE a
     drag (they light the moment the key goes down) and stays visible during
     it. Dim at rest (a reference, like the hint); filled when held. The label
     is context-aware: the snap chip names the exact increment for the tool in
     hand, the shift chip names what shift does for that tool. Kept inboard of
     the x-ray cluster, same rule as the measure box — transient chrome grows
     into the middle, the static toggle never moves. */
  .mods { display: flex; align-items: center; gap: 6px; flex: none; }
  .mods.off { display: none; }
  .mkey {
    display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
    font-size: 10.5px; color: var(--muted);
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    border: 1px solid var(--line); border-radius: 6px; padding: 3px 7px 3px 4px;
    transition: color 120ms var(--ease), background 120ms var(--ease), border-color 120ms var(--ease);
  }
  .mkey[hidden] { display: none; }
  .mkey kbd {
    font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    padding: 2px 4px; border-radius: 4px; text-transform: none;
    background: color-mix(in srgb, var(--ink) 9%, transparent); color: var(--muted);
    transition: inherit;
  }
  /* Held: the chip fills, so a lit modifier is unmistakable against its dim
     resting twin. Reuses --chip-on / --chip-on-ink the toolbar toggles speak. */
  .mkey.on { color: var(--chip-on-ink); background: var(--chip-on); border-color: transparent; }
  .mkey.on kbd { background: color-mix(in srgb, var(--chip-on-ink) 22%, transparent); color: var(--chip-on-ink); }
  /* Latched: a magnet has caught and the chip is naming the exact target it
     found. A green ring (the viewer's --ok "it's aligned" colour) marks the
     moment it sticks. The label can be a part name, so cap and ellipsize it. */
  .mkey.latched { box-shadow: 0 0 0 1.5px var(--ok); }
  .mkey .mtext { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); }
</style>
<canvas id="c"></canvas>
<svg class="gizmo off" id="gizmo" aria-hidden="true"></svg>
<svg class="lead" id="lead" aria-hidden="true">
  <line class="lead-line" id="leadLine"/>
  <circle class="lead-dot" id="leadDot" r="2.2"/>
</svg>
<div class="tip" id="tip">
  <div class="thead">
    <div class="tname"></div>
    <div class="tools">
      <button class="tbtn" id="tipGizmo" type="button" aria-pressed="true" title="Hide the handles (G)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path class="on-glyph" d="M1.6 8s2.5-4.2 6.4-4.2S14.4 8 14.4 8s-2.5 4.2-6.4 4.2S1.6 8 1.6 8Z"/>
          <circle class="on-glyph" cx="8" cy="8" r="1.9"/>
          <path class="off-glyph" d="M2.5 2.5l11 11"/>
        </svg>
      </button>
      <button class="tbtn tbtn-pin" id="tipPin" type="button" aria-pressed="false" title="Pin the card — it never closes, and switching parts keeps your depth">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 2.2h4L9.4 6l2.4 2.6H4.2L6.6 6z"/>
          <path d="M8 8.6v4.8"/>
        </svg>
      </button>
      <button class="tbtn tbtn-fold" id="tipFold" type="button" aria-expanded="true" title="Collapse">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path class="chev1" d="M4 6.5 8 10.5l4-4"/><path class="chev2" d="M4 2.5 8 6.5l4-4"/></svg>
      </button>
    </div>
  </div>
  <div class="terr" hidden></div>
  <div class="tdim"></div>
  <div class="tfacts" hidden></div>
  <div class="tedit" hidden></div>
  <div class="tnear" hidden>
    <svg class="tmap" viewBox="0 0 168 96" aria-label="Nearby parts"></svg>
  </div>
  <div class="tmat" hidden></div>
</div>

<div class="overlay ident" id="ident">
  <span class="name" id="name"></span>
  <span class="meta" id="meta"></span>
  <button class="jump" id="jump" type="button" hidden></button>
</div>

<div class="overlay selection">
  <span class="picked" id="part"></span>
  <button id="undo" title="Undo (Ctrl+Z)" hidden>Undo</button>
  <button id="redo" title="Redo (Ctrl+Shift+Z)" hidden>Redo</button>
  <button id="save" class="primary" hidden>Save changes</button>
  <button id="bake" hidden>Compile</button>
  <button id="reset" hidden>Reset</button>
</div>

<button class="overlay rail-toggle rail-open" id="railToggle" title="Show asset list" aria-label="Show asset list"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></svg></button>
<nav class="overlay rail" id="rail" aria-label="Assets">
  <div class="rail-head">
    <span>Assets</span>
    <span class="count" id="railCount"></span>
    <button class="rail-hide" id="railHide" title="Hide asset list" aria-label="Hide asset list"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg></button>
  </div>
  ${page.rollup ? rollupBanner(page.rollup) : ""}
  <div class="rail-scroll" id="catalog"></div>
</nav>

<div class="overlay bottombar">
  <span class="hint" id="hint"><b>Drag</b> orbit · <b>scroll</b> zoom · <b>space</b>/<b>right-drag</b> pan · <b>click</b> a part · <b>shift-click</b> adds · <b>X</b> x-ray</span>
  <!-- The transient measurements readout sits INBOARD of the x-ray
       cluster on purpose: the bar's tail is right-aligned, so anything
       that appears outboard of a static control shoves that control
       sideways every time a gesture starts or ends. Placed here, the
       readout grows into the empty middle and the x-ray toggle never
       moves. Keep any future transient chrome on this side of it. -->
  <!-- Live modifier chips: the two keys the gesture listens to, lit when
       held. Inboard of the measure box (and thus of x-ray) for the same
       reason above. Hidden until a part is selected. -->
  <div class="mods off" id="mods" aria-hidden="true">
    <span class="mkey" id="modSnap"><kbd>ctrl</kbd><span class="mtext">snap</span></span>
    <span class="mkey" id="modShift"><kbd>shift</kbd><span class="mtext">vertical</span></span>
  </div>
  <div class="measure off" id="measure" aria-live="polite">
    <span class="mlabel" id="mlabel">Distance</span>
    <span class="mval" id="mval">0</span>
  </div>
  <div class="xray-cluster" id="xrayCluster">
    <button class="xray-btn" id="xray" type="button" aria-pressed="false" title="X-ray — see occluded geometry (X)">
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z"/><circle cx="8" cy="8" r="1.8"/></svg>
      X-ray
    </button>
    <button class="xray-caret" id="xrayCaret" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Choose x-ray mode">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.5 8 10.5l4-4"/></svg>
    </button>
    <div class="xray-menu" id="xrayMenu" role="menu" hidden></div>
  </div>
</div>

<script>
// The viewer math engine (S3DMath global), bundled from src/viewer/math/ and
// inlined first so the runtime and gizmo can call the tested solvers directly.
${KIT_MATH_JS}
${KIT_RUNTIME_JS}

const KIT = ${data};
const canvas = document.getElementById('c');
const state = {
  // Pan is a world-space offset of the pivot, not two axis scalars: the
  // view slides along the camera's own right/up, which can point anywhere.
  azimuth: 0.9, elevation: 0.42, distance: 4, pan: [0, 0, 0],
  selection: new Set(),
  // X-ray: xray is the target on/off; xrayMix is the animated amount the
  // renderer actually reads (0 solid, 1 full spectral ghost); xrayMode picks
  // which geometric truth the colours encode (0 height, 1 depth, 2 clearance).
  xray: false, xrayMix: 0, xrayMode: 0,
};
/* X-ray transition, tweened in draw(): from -> to over an eased duration,
   started at xrayAt. Held outside state because they are animation
   bookkeeping, not something the renderer or a save should ever read. */
let xrayFrom = 0, xrayTo = 0, xrayAt = 0;
/* X is a chord leader: held down it turns 1/2/3 into mode picks; tapped alone
   it toggles x-ray on release. xChordUsed records whether a digit fired during
   the hold, so a tap toggles but a chord does not. */
let xHeld = false, xChordUsed = false;
let renderer = null;
/* Screen-occupancy cache for card placement. Declared up here with the
   other renderer state, not beside the functions that use it: those are
   hoisted function declarations reachable before a let-binding further
   down the file has initialised, and reading it then throws on the
   temporal dead zone. */
let occupancy = null;
let occupancyKey = '';
let frame = null;
let currentEntry = null;

/**
 * View-state persistence across page reloads.
 *
 * The host reloads this page whenever the compile rewrites kit.html or the
 * file-change watcher refreshes the srcdoc — and a reload that forgets which
 * scene was open and where the camera was makes every recompile feel like
 * being thrown out of the room. window.name is the one storage this page can
 * always reach: it survives a srcdoc swap in the SAME iframe element (the
 * host's refresh path) and a plain reload of the standalone page, and it
 * works in an opaque-origin sandbox where localStorage throws. The write is
 * wrapped anyway — nothing about persistence may ever break the viewer.
 *
 * Restore is split: the entry choice happens at boot (the rail needs it),
 * the camera after the model loads (select() sets the framing default the
 * restore must beat), so the pending values live here and are consumed once.
 */
const VIEW_STATE_TAG = 's3dview:';
let pendingViewCam = null;
let pendingViewSel = null;
function loadViewState() {
  try {
    if (typeof window.name === 'string' && window.name.indexOf(VIEW_STATE_TAG) === 0) {
      const parsed = JSON.parse(window.name.slice(VIEW_STATE_TAG.length));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (_) { /* corrupt or foreign window.name: start fresh */ }
  return null;
}
let viewStateTimer = 0;
function saveViewState() {
  /* Debounced off the render scheduler: an orbit drag invalidates every
     frame, and serialising once after the gesture settles is plenty. */
  clearTimeout(viewStateTimer);
  viewStateTimer = setTimeout(() => {
    try {
      window.name = VIEW_STATE_TAG + JSON.stringify({
        entry: currentEntry ? currentEntry.name : null,
        cam: [state.azimuth, state.elevation, state.distance,
              state.pan[0], state.pan[1], state.pan[2]],
        sel: Array.from(state.selection),
        rail: !document.getElementById('rail').classList.contains('hidden'),
        xrayMode: state.xrayMode,
      });
    } catch (_) { /* persistence must never break the viewer */ }
  }, 200);
}
/* The bytes the current model was built from, kept so a lost GPU context
   can be rebuilt without a refetch — and, more importantly, without
   discarding the edits the user has not saved yet. */
let lastGlb = null;

/* Local edit session: world-space deltas per part, applied on top of the
   loaded model. Saving writes them through the daemon into tweaks.json. */
let edits = {};
let savedAtLoad = {};

/**
 * Undo history.
 *
 * Entries are whole-gesture snapshots of the parts a gesture touched, not
 * per-frame deltas: a drag is one undo step, because undoing a drag
 * pixel-by-pixel is indistinguishable from the editor being broken. Each
 * entry records both sides, so redo is symmetric and neither direction has
 * to recompute anything.
 */
const history = [];
let historyAt = 0;

/* One shape for an edit, so nothing downstream has to guess which channels
   exist. Identity is "moved nowhere, turned not at all, same size". */
function editFor(name) {
  let e = edits[name];
  if (!e) e = edits[name] = { translate: [0, 0, 0], quat: [0, 0, 0, 1], scale: [1, 1, 1] };
  if (!e.translate) e.translate = [0, 0, 0];
  if (!e.quat) e.quat = [0, 0, 0, 1];
  if (!e.scale) e.scale = [1, 1, 1];
  return e;
}

function cloneEdit(e) {
  return e
    ? {
        translate: [...(e.translate || [0, 0, 0])],
        quat: [...(e.quat || [0, 0, 0, 1])],
        scale: [...(e.scale || [1, 1, 1])],
        /* The material channel rides the SAME edit record as the
           transforms, so one snapshot, one history entry and one save
           funnel carry every kind of change a part can take. */
        ...(e.material ? { material: JSON.parse(JSON.stringify(e.material)) } : {}),
      }
    : null;
}

/* ---- material channel ----------------------------------------------
 * Unlike the transforms, a material edit is ABSOLUTE state: "this part
 * wears mtl_gold with roughness 0.3", not "0.1 rougher than before".
 * Absolute state has no algebra to compose — equality is the only
 * question anything ever asks of it, so that predicate lives here, once,
 * with the same numeric tolerance everywhere: the dirty test, the history
 * commit and the save filter must never disagree about whether two
 * materials are the same material. */
function matEq(a, b) {
  const na = a && Object.keys(a).length > 0 ? a : null;
  const nb = b && Object.keys(b).length > 0 ? b : null;
  if (!na && !nb) return true;
  if (!na || !nb) return false;
  if ((na.assign || null) !== (nb.assign || null)) return false;
  const num = (x, y) => (x === undefined) === (y === undefined) &&
    (x === undefined || Math.abs(x - y) < 1e-4);
  const col = (x, y) => (!x && !y) ||
    (!!x && !!y && x.length === 3 && y.length === 3 &&
      x.every((v, i) => Math.abs(v - y[i]) < 1e-4));
  return col(na.baseColor, nb.baseColor) && col(na.emission, nb.emission) &&
    num(na.roughness, nb.roughness) && num(na.metallic, nb.metallic) &&
    num(na.emissionStrength, nb.emissionStrength) && num(na.alpha, nb.alpha);
}

/* ---- quaternions ---------------------------------------------------
 * Rotation is stored and composed as a quaternion, never as three Euler
 * angles.
 *
 * Euler triples cannot represent the composition of two arbitrary
 * rotations — you cannot add them — and they lose a degree of freedom
 * whenever the middle axis reaches 90°, which is precisely the orientation
 * a user reaches by dragging a trackball. Quaternions compose by
 * multiplication, interpolate cleanly, and have no singular orientation.
 */
function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Unit quaternion for a rotation of this angle about a (not necessarily
 *  normalised) axis. */
function qAxisAngle(axis, angle) {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const h = angle / 2;
  const s = Math.sin(h) / len;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/** Renormalise. Repeated multiplication drifts off the unit sphere, and a
 *  non-unit quaternion silently scales the geometry it rotates. */
function qNorm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Column-major rotation matrix (3x3 packed into a 4x4 layout's basis). */
function qMatrix(q) {
  const [x, y, z, w] = qNorm(q);
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    1 - (yy + zz), xy + wz, xz - wy,
    xy - wz, 1 - (xx + zz), yz + wx,
    xz + wy, yz - wx, 1 - (xx + yy),
  ];
}

function snapshot(names) {
  const out = {};
  for (const n of names) out[n] = cloneEdit(edits[n]);
  return out;
}
function commitHistory(before, after) {
  const names = Object.keys(after);
  if (!names.length) return;
  /* Nothing actually moved — a click that happened to wobble is not an edit.
     Measured with the SAME predicate the save uses, not by structural
     equality: two transforms can differ in the twelfth decimal and be the
     same pose. Comparing the objects instead offered an Undo for a gesture
     whose result was, to every other part of the editor and to the eye,
     identical to where it started. */
  if (names.every((n) =>
    !transformDelta(after[n], before[n]).changed &&
    matEq(after[n] && after[n].material, before[n] && before[n].material))) return;
  history.length = historyAt;
  history.push({ before: before, after: after });
  historyAt = history.length;
  refreshEditButtons();
}
function applySnapshot(snap) {
  for (const [name, value] of Object.entries(snap)) {
    if (value === null) delete edits[name];
    else edits[name] = cloneEdit(value);
  }
  applyEditsToDraws();
  refreshEditButtons();
  updateTip();
  /* An open material panel shows the edit state its sliders came from;
     undo and redo just changed that state underneath it. Rebuild, or the
     slider goes on reporting a roughness the part no longer wears. */
  if (tipMat) buildMatPanel();
}
function undo() {
  if (historyAt === 0) return;
  historyAt -= 1;
  applySnapshot(history[historyAt].before);
}
function redo() {
  if (historyAt >= history.length) return;
  applySnapshot(history[historyAt].after);
  historyAt += 1;
}

/* X-ray fades in over 200ms and out over 140ms — the house asymmetry, since
   entering an inspection mode is a considered act and leaving it is decisive.
   Standard UI ease-out. While mid-transition the frame reschedules itself so
   the stage and the spectral ghost energize in smoothly rather than snapping. */
function advanceXray(now) {
  if (xrayTo === xrayFrom) return;
  const dur = xrayTo > xrayFrom ? 200 : 140;
  const p = xrayAt ? Math.min(1, (now - xrayAt) / dur) : 1;
  const e = 1 - Math.pow(1 - p, 3);
  state.xrayMix = xrayFrom + (xrayTo - xrayFrom) * e;
  if (p >= 1) xrayFrom = xrayTo;
  else invalidate();
}

function draw(now) {
  frame = null;
  // Advance time-based motion once per frame, before anything reads it, so
  // every consumer of the spring sees the same instant.
  advanceXray(now || 0);
  if (renderer) render(renderer, state);
  // Position only. Rebuilding the overlay DOM every frame thrashed layout
  // badly enough to cost the WebGL context under sustained redraw, which
  // presented as the model simply vanishing. Structure is built when the
  // selection changes; frames just move it.
  positionGizmo();
  positionTip();
}

/* ---- Translate gizmo ------------------------------------------------ */

const AXES = [
  { key: 'x', dir: [1, 0, 0], color: '#e5484d', tag: 'X' },
  { key: 'y', dir: [0, 1, 0], color: '#46a758', tag: 'Y' },
  { key: 'z', dir: [0, 0, 1], color: '#3b82f6', tag: 'Z' },
];
const gizmo = document.getElementById('gizmo');
let gizmoAxes = null;

/** World-space centre of the current selection. */
function selectionCenter() {
  if (!renderer || state.selection.size === 0) return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const d of renderer.draws) {
    if (!state.selection.has(d.name)) continue;
    for (let a = 0; a < 3; a++) {
      if (d.min[a] < lo[a]) lo[a] = d.min[a];
      if (d.max[a] > hi[a]) hi[a] = d.max[a];
    }
  }
  if (!isFinite(lo[0])) return null;
  return [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2];
}

/* The selection's combined world AABB — the source of MY faces for
   SHIFT-align (min / centre / max along each axis). */
function selectionAABB() {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const d of renderer.draws) {
    if (!state.selection.has(d.name)) continue;
    for (let a = 0; a < 3; a++) {
      if (d.min[a] < lo[a]) lo[a] = d.min[a];
      if (d.max[a] > hi[a]) hi[a] = d.max[a];
    }
  }
  return isFinite(lo[0]) ? { min: lo, max: hi } : null;
}

/*
 * SHIFT-align: the drag length that magnetically aligns the selection's own
 * faces/centre to a nearby part's, along the drag axis. Returns the nearest
 * such alignment to the raw length, or null when nothing static is near.
 *
 * MY features along axis k are the selection's pre-drag min/centre/max; a move
 * of len shifts them by dir[k]·len. For each nearby static feature g we solve
 * the len that lands one of my features on it: coplanar (min↔min, max↔max) and
 * centre↔centre align exactly; the two OPPOSING pairs (my max↔their min, my
 * min↔their max) are surface contact and get a 1mm gap so flush can never
 * z-fight — the same floor the compiler enforces. Only parts that overlap mine
 * in the OTHER two axes count, so you align to what you are actually beside.
 */
function semanticSnapLen(rawLen) {
  if (!dragging || !dragging.broad || !dragging.selAABB) return null;
  const k = dragging.snapAxis;
  const dk = gesture.dir[k];
  if (Math.abs(dk) < 1e-6) return null;
  const sel = dragging.selAABB;
  const mine = [
    { v: sel.min[k], face: 'min' },
    { v: (sel.min[k] + sel.max[k]) / 2, face: 'center' },
    { v: sel.max[k], face: 'max' },
  ];
  // Query near where the selection centre currently sits along the axis.
  const ctr = selectionCenter();
  const radius = Math.max(sel.max[0] - sel.min[0], sel.max[1] - sel.min[1], sel.max[2] - sel.min[2]) + 0.5;
  const near = dragging.broad.queryCandidatesNear(ctr, radius);
  const other = [0, 1, 2].filter((a) => a !== k);
  let best = null, bestDist = Infinity;
  for (const f of near) {
    // Must overlap the selection in the two perpendicular axes.
    const fb = f.worldBounds;
    let perp = true;
    for (const a of other) {
      if (fb.min[a] > sel.max[a] + 1e-4 || fb.max[a] < sel.min[a] - 1e-4) { perp = false; break; }
    }
    if (!perp) continue;
    const g = f.worldPosition[k];
    const theirFace = f.id.slice(f.id.lastIndexOf(':') + 1);
    for (const m of mine) {
      let target = (g - m.v) / dk;
      // Opposing faces meeting = contact: hold 1mm off flush.
      const opposing = (m.face === 'max' && theirFace === 'min') || (m.face === 'min' && theirFace === 'max');
      let label;
      if (opposing) { target -= 0.001 * Math.sign(target || 1); label = 'flush → ' + f.ownerObjectId; }
      else if (m.face === 'center' && theirFace === 'center') label = 'centre → ' + f.ownerObjectId;
      else if (m.face === theirFace) label = m.face + ' face → ' + f.ownerObjectId;
      else continue; // mixed non-opposing (e.g. my min ↔ their center): not a meaningful alignment
      const d = Math.abs(target - rawLen);
      if (d < bestDist) { bestDist = d; best = { len: target, label: label }; }
    }
  }
  return best;
}

/* Movement only ever originates on a gizmo handle. Clicking the model
   itself selects and nothing else, so there is no gesture that can move
   geometry by accident. */
const DRAG_THRESHOLD = 3;
let dragging = null;

/* The last gesture, kept alive after the pointer is released.
   SketchUp lets you type an exact value during a drag; Roblox lets you fix
   the number after the fact. Keeping the gesture addressable until the
   selection changes or a new drag starts gives both, so a mistyped or
   overshot move never has to be redone as a gesture. */
let gesture = null;
let typed = '';
/* Same bound the daemon's sanitizeTweaks enforces on a saved tweak. The
   viewer cannot import it — this package must not depend on the daemon — so
   the two are kept in step by hand. Disagreement is not silent: the client
   would reject a value the server would have taken, or offer one the server
   rejects at save time. */
const MAX_TRANSLATE = 1000;

/** Metres, in whatever notation is at hand. Returns null if unparseable. */
function parseLength(text) {
  // A comma is the decimal separator for most of the world, and a keypad
  // emits whichever one the OS layout says. Accepting both costs nothing.
  const m = /^\s*(-?\d*[.,]?\d+)\s*(mm|cm|m|in|"|ft|')?\s*$/i.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(n)) return null;
  const unit = (m[2] || 'm').toLowerCase();
  const per = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, '"': 0.0254, ft: 0.3048, "'": 0.3048 };
  const metres = n * per[unit];
  // Mirror the server's bound here rather than letting the value through
  // and failing at save time: a part flung a million units off-screen with
  // an undo entry already committed is not a recoverable state.
  return Math.abs(metres) > MAX_TRANSLATE ? null : metres;
}

function formatLength(metres) {
  const a = Math.abs(metres);
  if (a < 0.01) return (metres * 1000).toFixed(0) + 'mm';
  if (a < 1) return (metres * 100).toFixed(1) + 'cm';
  return metres.toFixed(3).replace(/\.?0+$/, '') + 'm';
}

/**
 * How far the selection can travel along an axis before it touches
 * something, and what it touches.
 *
 * This is the measurement behind SketchUp's most useful habit: you drag
 * toward a surface and the thing you are holding stops ON it, flush,
 * without you ever typing a number or eyeballing a gap. Snapping to a grid
 * gets you a tidy number; snapping to contact gets you a correct model —
 * they are different goals, and this is the one that matters for assembly.
 *
 * Implemented as a swept-AABB test along a single axis, which is exact for
 * the axis-aligned boxes the picker and contact report already use, and
 * cheap enough to run on every pointer move.
 */
function contactLimit(names, dir, wanted) {
  if (!renderer) return null;
  const moving = renderer.draws.filter((d) => names.indexOf(d.name) >= 0);
  const still = renderer.draws.filter((d) => names.indexOf(d.name) < 0);
  if (!moving.length || !still.length) return null;
  // The dominant axis is the one being dragged; a gizmo axis is always one
  // of the three, so this is exact rather than an approximation.
  let axis = 0;
  for (let a = 1; a < 3; a++) if (Math.abs(dir[a]) > Math.abs(dir[axis])) axis = a;
  const sign = dir[axis] >= 0 ? 1 : -1;
  if (Math.abs(dir[axis]) < 0.5) return null;

  const other = [(axis + 1) % 3, (axis + 2) % 3];
  let best = null;
  for (const m of moving) {
    for (const s of still) {
      // Only surfaces we would actually run into: the two boxes must
      // overlap on BOTH other axes, or they slide past each other.
      let overlaps = true;
      for (const o of other) {
        if (m.min[o] >= s.max[o] - 1e-6 || m.max[o] <= s.min[o] + 1e-6) { overlaps = false; break; }
      }
      if (!overlaps) continue;
      // Distance until the leading face meets the surface facing it.
      const gap = sign > 0 ? s.min[axis] - m.max[axis] : m.min[axis] - s.max[axis];
      if (gap < -1e-6) continue;           // already interpenetrating
      if (gap > Math.abs(wanted) + 1e-6) continue; // beyond this drag
      if (best === null || gap < best.gap) best = { gap: gap, part: s.name };
    }
  }
  return best;
}

/* Canvas offset in client coordinates. The gizmo's stored screen positions
   are canvas-relative; pointer events are page-relative. */
function rectLeft() { return canvas.getBoundingClientRect().left; }
function rectTop() { return canvas.getBoundingClientRect().top; }

/** Turn the gesture's parts by exactly this many radians about its axis. */
function applyGestureAngle(radians) {
  if (!gesture || !gesture.dir) return;
  gesture.len = radians;
  applyGestureQuat(qAxisAngle(gesture.dir, radians));
}

/**
 * Set the gesture's rotation to delta, composed onto where each part
 * started.
 *
 * Composed rather than accumulated: the result is always a function of the
 * single delta the gesture currently represents, so a drag can be revised —
 * by moving the pointer back, or by typing an exact angle — without the
 * earlier part of the same drag being baked in.
 */
/* A part's own base centre — the pivot every per-part edit rotates and scales
   about, matching applyEditsToDraws. */
function partBaseCenter(name) {
  const d = renderer && renderer.draws.find((x) => x.name === name);
  if (!d) return [0, 0, 0];
  const lo = d.baseMin || d.min, hi = d.baseMax || d.max;
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

/* Bounding volumes for the gesture's parts from their pre-drag transforms —
   the input to the volume-weighted barycenter the group turns about. */
function groupParts() {
  const parts = [];
  for (const name of gesture.names) {
    const c = partBaseCenter(name);
    const d = renderer.draws.find((x) => x.name === name);
    const lo = (d && (d.baseMin || d.min)) || c, hi = (d && (d.baseMax || d.max)) || c;
    const vol = Math.max(1e-6, (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]));
    const b = gesture.before[name];
    const wt = composeTRS((b && b.quat) || [0, 0, 0, 1], (b && b.scale) || [1, 1, 1], c, (b && b.translate) || [0, 0, 0]);
    parts.push({ id: name, localCenter: c, localVolume: vol, worldTransform: Float64Array.from(wt) });
  }
  return parts;
}

/*
 * Multi-select rotate / scale about the shared barycenter.
 *
 * Each part's new world transform is G · (its pre-drag transform), where G is
 * the group operation about the frozen pivot. That full matrix is decomposed
 * back into the part's OWN (translate, quat, scale) edit: quat and scale from
 * the polar decomposition (continuity-aware, so a spin past 180 degrees never
 * flips), translate solved so the part's base centre lands where G sends it.
 * Pure in the one gesture value — everything derives from the pre-drag
 * snapshot and the frozen pivot, so a typed angle reproduces it exactly. Group
 * scale is uniform (all axes) so G stays a similarity and the decomposition is
 * exact, with no shear to smear into scale.
 */
function applyGroupTransform(deltaQuat, uniformScale) {
  if (!gesture || !gesture.pivot) return;
  const G = S3DMath.buildMultiSelectionGroupMatrix([0, 0, 0], gesture.pivot, deltaQuat, uniformScale);
  for (const name of gesture.names) {
    const b = gesture.before[name];
    const Pi = partBaseCenter(name);
    const Ei = Float64Array.from(composeTRS((b && b.quat) || [0, 0, 0, 1], (b && b.scale) || [1, 1, 1], Pi, (b && b.translate) || [0, 0, 0]));
    const M = S3DMath.mulMat4(G, Ei);
    const ref = gesture.continuity[name] || ((b && b.quat) || [0, 0, 0, 1]);
    const dec = S3DMath.decomposePolarTRSWithContinuity(M, ref);
    gesture.continuity[name] = dec.rotation;
    const e = editFor(name);
    e.quat = dec.rotation;
    e.scale = dec.scale;
    // T(Pi+t')·R·S·T(-Pi) maps Pi -> Pi + t'; M maps Pi -> M·Pi; so t' = M·Pi − Pi.
    e.translate = [
      M[0] * Pi[0] + M[4] * Pi[1] + M[8] * Pi[2] + M[12] - Pi[0],
      M[1] * Pi[0] + M[5] * Pi[1] + M[9] * Pi[2] + M[13] - Pi[1],
      M[2] * Pi[0] + M[6] * Pi[1] + M[10] * Pi[2] + M[14] - Pi[2],
    ];
  }
  applyEditsToDraws();
  refreshEditButtons();
  invalidate();
}

function applyGestureQuat(delta) {
  if (!gesture) return;
  // Multi-select turns about the group barycenter, not each part's own centre.
  if (gesture.pivot) { applyGroupTransform(delta, 1); return; }
  for (const name of gesture.names) {
    const base = gesture.before[name];
    const start = (base && base.quat) || [0, 0, 0, 1];
    const q = qNorm(qMul(delta, start));
    const e = editFor(name);
    e.quat = q;
  }
  applyEditsToDraws();
  refreshEditButtons();
  invalidate();
}

/**
 * Map a pointer position to a point on a virtual sphere — Shoemake's
 * arcball, the mechanism Blender, Maya and Godot all use for free rotation.
 *
 * Inside the sphere's silhouette the point lies on the visible hemisphere.
 * Outside it, the point is pushed onto the rim (z = 0) rather than being
 * rejected, so a drag that leaves the ball keeps spinning it about the view
 * axis instead of stopping dead at the edge — which is what makes the
 * control feel continuous rather than clipped.
 */
/* The virtual-sphere mapping the trackball once did inline now comes from the
   engine (S3DMath.mapArcball) — same maths, one tested source. */

/** Scale the gesture's parts by this factor, on one axis or all three. */
function applyGestureScale(factor, uniform) {
  if (!gesture || !gesture.dir) return;
  gesture.len = factor;
  gesture.uniform = !!uniform;
  // Multi-select scales uniformly about the group barycenter — a similarity,
  // so the group decomposition stays exact and nothing shears.
  if (gesture.pivot) { applyGroupTransform([0, 0, 0, 1], factor); return; }
  let a = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(gesture.dir[i]) > Math.abs(gesture.dir[a])) a = i;
  for (const name of gesture.names) {
    const base = gesture.before[name];
    const s = editFor(name).scale;
    for (let i = 0; i < 3; i++) {
      const was = base && base.scale ? base.scale[i] : 1;
      // Shift scales all three axes together — the common case, and the
      // one that cannot distort a shape.
      s[i] = uniform || i === a ? was * factor : was;
    }
  }
  applyEditsToDraws();
  refreshEditButtons();
  invalidate();
}

/** Place the gesture's parts at exactly len metres along its axis. */
function applyGestureLength(len) {
  if (!gesture || !gesture.dir) return;
  gesture.len = len;
  for (const name of gesture.names) {
    const base = gesture.before[name];
    const t = editFor(name).translate;
    for (let i = 0; i < 3; i++) t[i] = (base ? base.translate[i] : 0) + gesture.dir[i] * len;
  }
  applyEditsToDraws();
  refreshEditButtons();
  invalidate();
}

/**
 * Paint the measurement value with a polarity cue: the leading sign and the
 * unit suffix are coloured red (negative) or green (positive); the magnitude
 * stays in --ink. signed is false for scale (a positive multiplier, where a
 * green up / red down would be a lie), and allowPlus injects an explicit
 * "+" for a live positive readout so + and - read symmetrically — suppressed
 * while typing so the echoed input stays faithful to the keys pressed.
 * Built with DOM nodes (not innerHTML) so the numeric text can never be
 * interpreted as markup.
 */
function paintMeasureValue(el, text, signed, allowPlus) {
  const m = /^([+-]?)([0-9]*[.,]?[0-9]+)?(.*)$/.exec(text);
  const rawSign = m && m[1] ? m[1] : '';
  const mag = m && m[2] ? m[2] : text.replace(/^[+-]/, '');
  const unit = m && m[3] ? m[3] : '';
  const num = parseFloat(((m && m[2]) || '0').replace(',', '.'));
  let polarity = '';
  if (signed && num !== 0) polarity = rawSign === '-' ? 'neg' : 'pos';
  el.classList.remove('pos', 'neg');
  if (polarity) el.classList.add(polarity);
  const sign = rawSign || (polarity === 'pos' && allowPlus ? '+' : '');
  el.textContent = '';
  if (sign) {
    const s = document.createElement('span');
    s.className = 'msign';
    s.textContent = sign;
    el.appendChild(s);
  }
  const g = document.createElement('span');
  g.className = 'mmag';
  g.textContent = mag;
  el.appendChild(g);
  if (unit) {
    const u = document.createElement('span');
    u.className = 'munit';
    u.textContent = unit;
    el.appendChild(u);
  }
}

function showMeasure() {
  const box = document.getElementById('measure');
  if (!gesture) {
    box.classList.add('off'); box.classList.remove('typing');
    // Gesture over: drop any latched snap labels so the chips fall back to
    // their increment/effect words.
    ctrlLatched = false; shiftLatched = false; refreshModChips();
    return;
  }
  box.classList.remove('off');
  box.classList.toggle('typing', typed !== '');
  // Name what it snapped to. "Flush" is only trustworthy if the reader can
  // see WHAT it went flush against.
  // The gesture's own label wins whenever it set one. Deriving it from
  // "does this gesture have an axis" was wrong the moment a tool existed
  // that has no axis — the trackball reported itself as "Moved".
  // snappedTo is a complete alignment phrase ("flush → crate_02", "centre →
  // pillar") from semanticSnapLen, so it stands as the label on its own.
  const label = gesture.snappedTo || gesture.label || 'Moved';
  box.classList.toggle('snapped', !!gesture.snappedTo);
  document.getElementById('mlabel').textContent = label;
  const text =
    typed !== '' ? typed : gesture.unit === 'deg'
      ? (Math.round(gesture.len * 180 / Math.PI * 10) / 10) + '°'
      : gesture.unit === 'x'
        ? (Math.round(gesture.len * 1000) / 1000) + '×'
        : formatLength(gesture.len);
  // Scale is a positive multiplier, so it carries no red/green polarity.
  paintMeasureValue(document.getElementById('mval'), text, gesture.unit !== 'x', typed === '');
  // The chips read the frame's latched snap labels, so refresh them in step
  // with the readout — this is the one place both update together per frame.
  refreshModChips();
}

function endGesture() {
  gesture = null;
  typed = '';
  showMeasure();
}

function beginGizmoDrag(e, entry, tool) {
  if (e.button !== 0 || state.selection.size === 0) return;
  e.preventDefault();
  e.stopPropagation();
  const names = [...state.selection];
  const before = snapshot(names);
  typed = '';
  const kind = tool || (entry ? TOOL.MOVE : TOOL.FREE);
  gesture = {
    names: names, before: before, len: kind === TOOL.SCALE ? 1 : 0,
    dir: entry ? entry.axis.dir : null,
    tool: kind,
    // The unit the readout speaks, and therefore what a typed number means.
    unit: kind === TOOL.ROTATE ? 'deg' : kind === TOOL.SCALE ? 'x' : 'm',
    label: !entry ? 'Moved'
      : kind === TOOL.ROTATE ? entry.axis.tag + ' rotation'
      : kind === TOOL.SCALE ? entry.axis.tag + ' scale'
      : entry.axis.tag + ' distance',
  };
  /* Rotating or scaling more than one part turns the WHOLE selection about its
     shared volume-weighted barycenter, frozen at press. continuity holds each
     part's previous decomposed rotation so a spin past 180 degrees never
     flips. Move stays per-part (translation needs no pivot). */
  if (names.length > 1 && (kind === TOOL.ROTATE || kind === TOOL.SCALE || kind === TOOL.TRACKBALL)) {
    gesture.pivot = S3DMath.computeVolumeWeightedBarycenter(groupParts());
    gesture.continuity = {};
  }
  dragging = {
    entry: entry, names: names, tool: kind,
    startX: e.clientX, startY: e.clientY,
    lastX: e.clientX, lastY: e.clientY,
    before: before, armed: false,
  };
  /* Isolate the handle being used.
     While a drag is live, every other handle drops right back so the one
     in your hand is the only thing competing for attention. At rest all
     the tools stay visible because that is how they are discovered; the
     clutter only actually matters in the moment you are using one, and
     this is the cheapest, largest improvement to that moment. */
  /* Reference measurements taken at the press, from the press position —
     the only moment that represents "where the user grabbed". Deriving
     them on the first pointermove instead makes that frame a no-op. */
  if (entry && entry.ringOrigin) {
    const px = e.clientX - rectLeft(), py = e.clientY - rectTop();
    dragging.startRadius = Math.max(8, Math.hypot(px - entry.ringOrigin.x, py - entry.ringOrigin.y));
    dragging.startAngle = Math.atan2(py - entry.ringOrigin.y, px - entry.ringOrigin.x);
    // Winding state belongs with the other press-time references: the
    // rotate handler compares each frame against the previous angle, and
    // the first comparison has to be against the press, not against
    // nothing.
    dragging.lastAngle = dragging.startAngle;
    dragging.turns = 0;
    /* The ring's screen winding flips with the camera's side of its
       plane: a clockwise hand motion must always turn the part the way
       the ring visually turns, from EITHER side. The sign is the
       orientation of the ring's own projected basis (the two other world
       axes, in right-handed order, projected the same way the ring is
       drawn) — measured at press, because the camera cannot orbit during
       a gizmo drag. Without this, orbiting ~180° reversed every ring. */
    if (kind === TOOL.ROTATE && entry.axis) {
      const k = AXES.findIndex((a) => a.tag === entry.axis.tag);
      const a1 = AXES[(k + 1) % 3].dir, a2 = AXES[(k + 2) % 3].dir;
      const c = selectionCenter();
      const s0 = worldToScreen(renderer, state, canvas, c);
      const s1 = worldToScreen(renderer, state, canvas,
        [c[0] + a1[0], c[1] + a1[1], c[2] + a1[2]]);
      const s2 = worldToScreen(renderer, state, canvas,
        [c[0] + a2[0], c[1] + a2[1], c[2] + a2[2]]);
      let sign = 1;
      if (s0 && s1 && s2) {
        const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
        if (det < 0) sign = -1;
      }
      dragging.ringSign = sign;

      /* Frame the ring in its own world plane for the LM solver: intersect the
         press ray with the ring plane (through the pivot, normal = axis) to
         find where the hand grabbed, then buildPickedRingBasis puts theta=0
         exactly there. radius self-calibrates to the grabbed point, so the
         solved point sits under the cursor on the first frame. If the ray is
         parallel to the plane (ring edge-on at press) dragging.ring stays
         unset and the atan2-around-hub fallback carries this rare gesture. */
      const ctx = projCtx();
      const ray = S3DMath.screenToWorldRay([e.clientX - rectLeft(), e.clientY - rectTop()], ctx);
      const dn = ray.dir[0] * entry.axis.dir[0] + ray.dir[1] * entry.axis.dir[1] + ray.dir[2] * entry.axis.dir[2];
      if (Math.abs(dn) > 1e-4) {
        const tP = ((c[0] - ray.origin[0]) * entry.axis.dir[0] + (c[1] - ray.origin[1]) * entry.axis.dir[1] + (c[2] - ray.origin[2]) * entry.axis.dir[2]) / dn;
        const picked = [ray.origin[0] + tP * ray.dir[0], ray.origin[1] + tP * ray.dir[1], ray.origin[2] + tP * ray.dir[2]];
        const diff = [picked[0] - c[0], picked[1] - c[1], picked[2] - c[2]];
        const ud = diff[0] * entry.axis.dir[0] + diff[1] * entry.axis.dir[1] + diff[2] * entry.axis.dir[2];
        const radius = Math.hypot(diff[0] - ud * entry.axis.dir[0], diff[1] - ud * entry.axis.dir[1], diff[2] - ud * entry.axis.dir[2]);
        if (radius > 1e-5) {
          const rb = S3DMath.buildPickedRingBasis(c, entry.axis.dir, picked);
          dragging.ring = { pivot: c, axis: entry.axis.dir, a: rb.a, b: rb.b, radius: radius, seed: 0, prev: 0, turns: 0, offset: 0 };
        }
      }
    }
  }

  /* Axis move: capture the world line and where the pointer sits on it at
     press, so the perspective-correct solver moves the part by the CHANGE in
     that position — the grab point stays under the cursor instead of the
     handle's tip jumping to it. Null lambda0 means the axis was edge-on at
     press, and the move handler falls back to the screen-projection path. */
  if (kind === TOOL.MOVE && entry && entry.axis) {
    dragging.axisAnchor = selectionCenter();
    const r0 = S3DMath.solveProjectedLineParameterAdmissible(
      dragging.axisAnchor, entry.axis.dir,
      [e.clientX - rectLeft(), e.clientY - rectTop()], projCtx(), 0,
    );
    dragging.axisLambda0 = r0.degenerate ? null : r0.lambda;

    /* SHIFT-align: index every OTHER part's three bounding-face coordinates
       along this drag axis into the engine's spatial broadphase, once at
       press (the world doesn't move under a drag). Held with SHIFT, the move
       magnetically aligns the selection's faces and centre to those features
       — flush contact, coplanar faces, centre-to-centre — not only "touching".
       selAABB is the selection's pre-drag box, the source of MY features. */
    dragging.snapAxis = AXES.findIndex((a) => a.tag === entry.axis.tag);
    dragging.selAABB = selectionAABB();
    const broad = new S3DMath.PersistentSnapBroadphase();
    const inGesture = new Set(gesture.names);
    const k = dragging.snapAxis;
    for (const d of renderer.draws) {
      if (inGesture.has(d.name)) continue;
      const mn = d.min, mx = d.max;
      const ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      const bounds = { min: [mn[0], mn[1], mn[2]], max: [mx[0], mx[1], mx[2]] };
      for (const feat of [['min', mn[k]], ['center', ctr[k]], ['max', mx[k]]]) {
        const wp = [ctr[0], ctr[1], ctr[2]]; wp[k] = feat[1];
        broad.insertFeature({
          id: d.name + ':' + feat[0], kind: feat[0] === 'center' ? 'plane' : 'bounding-face',
          ownerObjectId: d.name, worldBounds: bounds, worldPosition: wp,
        });
      }
    }
    dragging.broad = broad;
  }

  tip.classList.add('busy');
  gizmo.classList.add('dragging');
  if (entry) entry.group.classList.add('active');
  if (kind === TOOL.TRACKBALL || kind === TOOL.FREE) gizmo.classList.add('centre-active');

  showMeasure();
  // Lock the chips to this drag's tool now, so the snap increment / shift
  // effect are right from the first frame (refreshMods early-returns when no
  // modifier changed, so it would not repaint them on its own).
  refreshModChips();
  state.suppressOrbit = true;
  try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
}

/*
 * The math engine's projection context for the current camera.
 *
 * Built from the runtime's OWN lookAt/perspective so its viewProjection is the
 * same transform worldToScreen draws the handles with — the solver's world
 * answers and the rendered gizmo therefore agree to the pixel. Matrix products
 * run in the engine's double precision; the float32 base the renderer shares
 * differs by sub-pixel amounts no eye resolves. One call is a drag frame.
 */
function projCtx() {
  const rect = canvas.getBoundingClientRect();
  const cam = cameraFor(renderer, state);
  const planes = viewFrustum(state, cam.bounds);
  const view = Float64Array.from(lookAt(cam.eye, cam.target, [0, 1, 0]));
  const proj = Float64Array.from(
    perspective(Math.PI / 4, rect.width / Math.max(1, rect.height), planes.near, planes.far),
  );
  const PV = S3DMath.mulMat4(proj, view);
  const basis = cameraBasis(state);
  return {
    camera: { position: cam.eye, rotation: [0, 0, 0, 1], fovY: Math.PI / 4, near: planes.near, far: planes.far },
    viewport: { cssWidth: rect.width, cssHeight: rect.height, drawingBufferWidth: rect.width, drawingBufferHeight: rect.height },
    view: view,
    projection: proj,
    viewProjection: PV,
    inverseViewProjection: S3DMath.invertMat4(PV),
    cameraRightWorld: basis.right,
    cameraUpWorld: basis.up,
    // The engine's forward is the viewing direction (eye -> target); the
    // runtime basis points the other way (target -> eye).
    cameraForwardWorld: [-basis.forward[0], -basis.forward[1], -basis.forward[2]],
  };
}

/** Pointer in canvas CSS pixels — the space every solver measures in. */
function pointerCss(e) { return [e.clientX - rectLeft(), e.clientY - rectTop()]; }

/** A point on the drag ring at world angle th. */
function ringPoint(R, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return [
    R.pivot[0] + R.radius * (R.a[0] * c + R.b[0] * s),
    R.pivot[1] + R.radius * (R.a[1] * c + R.b[1] * s),
    R.pivot[2] + R.radius * (R.a[2] * c + R.b[2] * s),
  ];
}

/*
 * The ring angle whose point reprojects under the pointer, solved in the
 * ring's OWN world plane so the sign is correct from any camera side — this
 * is what makes the press-time screen-winding sign (ringSign) unnecessary.
 * A pointer teleport (coalesced events, a flick) can seed the solver half a
 * turn into the wrong basin; when the reprojected residual is large, re-seed
 * from a coarse basis-angle estimate of the ray∩plane point and re-solve.
 */
function ringSolveTheta(R, pcss, ctx) {
  let theta = S3DMath.solveDampedLevenbergMarquardtRing(R.pivot, R.axis, R.a, R.b, R.radius, pcss, R.seed, ctx);
  const s = S3DMath.projectWorldToScreen(ringPoint(R, theta), ctx);
  if (!s.valid || Math.hypot(s.x - pcss[0], s.y - pcss[1]) > 40) {
    const ray = S3DMath.screenToWorldRay(pcss, ctx);
    const denom = ray.dir[0] * R.axis[0] + ray.dir[1] * R.axis[1] + ray.dir[2] * R.axis[2];
    if (Math.abs(denom) > 1e-4) {
      const tP = ((R.pivot[0] - ray.origin[0]) * R.axis[0] + (R.pivot[1] - ray.origin[1]) * R.axis[1] + (R.pivot[2] - ray.origin[2]) * R.axis[2]) / denom;
      const d = [
        ray.origin[0] + tP * ray.dir[0] - R.pivot[0],
        ray.origin[1] + tP * ray.dir[1] - R.pivot[1],
        ray.origin[2] + tP * ray.dir[2] - R.pivot[2],
      ];
      const coarse = Math.atan2(
        d[0] * R.b[0] + d[1] * R.b[1] + d[2] * R.b[2],
        d[0] * R.a[0] + d[1] * R.a[1] + d[2] * R.a[2],
      );
      theta = S3DMath.solveDampedLevenbergMarquardtRing(R.pivot, R.axis, R.a, R.b, R.radius, pcss, coarse, ctx);
    }
  }
  return theta;
}

/*
 * Magnetic snap. Pulls a raw gesture value toward a target by how close the
 * two are ON SCREEN (px): fully snapped within ~10px, released smoothly by
 * ~18px, nothing beyond. This is what makes CTRL feel like a magnet rather
 * than a stair-step — and it is STATELESS, a pure function of the raw value,
 * so "type a number to replace the drag" still holds and no animation loop is
 * needed. distPx is the on-screen gap; callers measure it in the space that
 * makes the magnet radius constant regardless of zoom.
 */
/* Whether each modifier's magnet has actually CAUGHT this frame — the chips
   light a green ring when true. The chip text stays the STEP/mode the modifier
   applies ("5mm", "15°", "contact"); the exact value/target it caught belongs
   in the readout, not doubled onto the chip. Reset each frame, set when a
   magnet takes hold, cleared when the gesture ends. */
let ctrlLatched = false;
let shiftLatched = false;

function magnetBlendPx(raw, target, distPx) {
  const beta = S3DMath.computeSnapBlendFactor(distPx);
  return raw + beta * (target - raw);
}
/* True when a blend from raw to target pulled more than halfway — the magnet
   has meaningfully engaged, which is when the chip should name the target. */
function magnetEngaged(raw, blended, target) {
  return Math.abs(blended - target) < Math.abs(raw - target) * 0.5;
}
/* The same, measuring distPx between two projected world positions (the raw
   and snapped placements). Off-screen falls back to a hard snap. */
function magnetBlendWorld(raw, target, posRaw, posTarget, ctx) {
  const a = S3DMath.projectWorldToScreen(posRaw, ctx);
  const b = S3DMath.projectWorldToScreen(posTarget, ctx);
  if (!a.valid || !b.valid) return target;
  return magnetBlendPx(raw, target, Math.hypot(a.x - b.x, a.y - b.y));
}

/*
 * Coming off a mid-drag pan (space released while still holding a part),
 * re-anchor the active tool to the current pointer and camera so it resumes at
 * exactly the value it paused on — the part does not jump when the move picks
 * back up. The pan moved the camera, which is what every tool's press-time
 * reference was tied to; this re-ties them without moving the part:
 *   - move  : re-solve the grab offset on the axis line for the new camera,
 *   - rotate: rebuild the ring basis at the pointer, carrying the angle as an
 *             offset (theta reads 0 there, so the whole current angle rides it),
 *   - scale : rescale startRadius against the live (post-pan) hub position.
 */
function reanchorGizmo(e) {
  if (!dragging || !gesture) return;
  const ctx = projCtx();
  const pcss = pointerCss(e);
  if (dragging.tool === TOOL.MOVE && dragging.axisAnchor && dragging.axisLambda0 !== null) {
    const r = S3DMath.solveProjectedLineParameterAdmissible(
      dragging.axisAnchor, gesture.dir, pcss, ctx, gesture.len + dragging.axisLambda0);
    if (!r.degenerate) dragging.axisLambda0 = r.lambda - gesture.len;
  } else if (dragging.tool === TOOL.ROTATE && dragging.ring) {
    const R = dragging.ring;
    const ray = S3DMath.screenToWorldRay(pcss, ctx);
    const dn = ray.dir[0] * R.axis[0] + ray.dir[1] * R.axis[1] + ray.dir[2] * R.axis[2];
    if (Math.abs(dn) > 1e-4) {
      const tP = ((R.pivot[0] - ray.origin[0]) * R.axis[0] + (R.pivot[1] - ray.origin[1]) * R.axis[1] + (R.pivot[2] - ray.origin[2]) * R.axis[2]) / dn;
      const picked = [ray.origin[0] + tP * ray.dir[0], ray.origin[1] + tP * ray.dir[1], ray.origin[2] + tP * ray.dir[2]];
      const rb = S3DMath.buildPickedRingBasis(R.pivot, R.axis, picked);
      R.a = rb.a; R.b = rb.b; R.seed = 0; R.prev = 0; R.turns = 0; R.offset = gesture.len;
    }
  } else if (dragging.tool === TOOL.SCALE && dragging.entry && dragging.entry.ringOrigin) {
    const o = dragging.entry.ringOrigin;
    const here = Math.hypot(e.clientX - rectLeft() - o.x, e.clientY - rectTop() - o.y);
    dragging.startRadius = here / Math.max(1e-6, gesture.len);
  }
}

function moveGizmoDrag(e) {
  if (!dragging) return;
  if (!dragging.armed) {
    if (Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY) < DRAG_THRESHOLD) return;
    dragging.armed = true;
    dragging.lastX = dragging.startX; dragging.lastY = dragging.startY;
  }
  const dx = e.clientX - dragging.lastX;
  const dy = e.clientY - dragging.lastY;
  dragging.lastX = e.clientX; dragging.lastY = e.clientY;

  // Each frame starts with nothing latched; the tool branches set these when a
  // magnet engages, and the chips read them (via showMeasure -> refreshModChips).
  ctrlLatched = false;
  shiftLatched = false;

  /* Right button OR the space-pan hold during a part drag pans the view
     instead of moving the part — reframing mid-placement without dropping what
     you are holding. Space matters on a trackpad, which has no right button.
     The handle captured this pointer, so these events never reach the canvas
     and the camera controls cannot see them; the pan has to be applied here. */
  if ((e.buttons & 2) || state.spaceHeld) {
    panBy(state, canvas, dx, dy);
    dragging.panned = true;
    invalidate();
    return;
  }
  // Just came off a pan (space released mid-drag): re-anchor the tool to the
  // current pointer + camera so the part resumes exactly where it paused,
  // instead of snapping to wherever the new camera projects the pointer.
  if (dragging.panned) {
    dragging.panned = false;
    reanchorGizmo(e);
  }

  /* Trackball: free rotation, measured on a virtual sphere.
     The axis comes out in CAMERA space — the arcball is a screen-space
     construction — so it is rotated into world space through the camera's
     own basis before it becomes a rotation of the part. Skipping that step
     is the classic arcball bug: the object turns correctly only while the
     camera happens to be at its default angle. */
  if (dragging.tool === TOOL.TRACKBALL) {
    const c = dragging.ballCentre;
    if (!c) return;
    const left = rectLeft(), top = rectTop();
    // Shoemake virtual-sphere mapping from the engine (identical maths to the
    // old inline arcballVector — same Y-inversion, same hyperbolic rim — now
    // one tested source). The camera-space axis is still rotated to world
    // below, which is what keeps the object turning correctly from any view.
    const v1 = S3DMath.mapArcball(e.clientX - left, e.clientY - top, c.x, c.y, c.r);
    const v0 = dragging.ballStart ||
      (dragging.ballStart = S3DMath.mapArcball(dragging.startX - left, dragging.startY - top, c.x, c.y, c.r));
    const axisCam = [
      v0[1] * v1[2] - v0[2] * v1[1],
      v0[2] * v1[0] - v0[0] * v1[2],
      v0[0] * v1[1] - v0[1] * v1[0],
    ];
    const dot = Math.max(-1, Math.min(1, v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]));
    let angle = Math.acos(dot);
    // Shoemake's arcball turns the object half as far as the hand; doubling
    // makes a drag across the ball a half turn, which is what every tool
    // using this control does and what the hand expects.
    angle *= 2;
    if (Math.hypot(axisCam[0], axisCam[1], axisCam[2]) < 1e-6 || angle < 1e-6) return;
    const basis = cameraBasis(state);
    const axisWorld = [0, 1, 2].map((i) =>
      axisCam[0] * basis.right[i] + axisCam[1] * basis.up[i] + axisCam[2] * basis.forward[i],
    );
    typed = '';
    gesture.len = angle;
    gesture.unit = 'deg';
    gesture.label = 'Free rotation';
    applyGestureQuat(qAxisAngle(axisWorld, angle));
    showMeasure();
    return;
  }

  /* Rotate: the angle the pointer has swept around the hub.
     Measured as an absolute angle from the gesture's start rather than
     accumulated per frame, so the part's rotation is a pure function of
     where the pointer is — the same property that lets a typed value
     replace a drag, and it cannot drift over a long gesture. */
  if (dragging.tool === TOOL.ROTATE && dragging.entry) {
    /* World-plane LM solve: the ring angle whose point reprojects under the
       pointer. Correct from any camera side — the old screen-winding sign
       (ringSign) is intrinsic to the world-basis solve and no longer needed.
       Seeded with the previous angle so the solver tracks continuity itself;
       the +-pi unwrap only catches a dropped frame during a violent flick. */
    if (dragging.ring) {
      const R = dragging.ring;
      const ctx = projCtx();
      const theta = ringSolveTheta(R, pointerCss(e), ctx);
      const stepR = theta - R.prev;
      if (stepR > Math.PI) R.turns -= 1; else if (stepR < -Math.PI) R.turns += 1;
      R.prev = theta; R.seed = theta;
      let delta = theta + R.turns * Math.PI * 2 + (R.offset || 0);
      // CTRL magnet: harmonic angle lattice (15° and 36°/pentagonal families),
      // pulled in by on-ring screen proximity rather than hard-rounded.
      if (snapHeld(e)) {
        const h = S3DMath.findClosestHarmonicAngle(delta);
        const blended = magnetBlendWorld(delta, h.angle, ringPoint(R, delta), ringPoint(R, h.angle), ctx);
        ctrlLatched = magnetEngaged(delta, blended, h.angle);
        delta = blended;
      }
      typed = '';
      applyGestureAngle(delta);
      showMeasure();
      return;
    }
    // Fallback: atan2 around the hub — only when the ring was edge-on at press
    // (no stable world plane to solve in).
    const o = dragging.entry.ringOrigin;
    if (!o) return;
    const now = Math.atan2(e.clientY - rectTop() - o.y, e.clientX - rectLeft() - o.x);
    /*
     * Count seam crossings, so a drag can go round more than once.
     *
     * The angle is deliberately absolute — measured from where the gesture
     * started, not accumulated per frame — because that is what lets a
     * typed value replace a drag and what stops a long gesture drifting.
     * But an absolute angle read from atan2 lives on (-pi, pi], so on its
     * own it cannot express more than half a turn, and the code that was
     * meant to carry the rest read a turn counter that NOTHING ever
     * assigned, behind a zero default that made the dead read silently
     * harmless. So the symptom was not a crash: rotating a part more than
     * 180 degrees in one continuous drag snapped it back a full turn the
     * instant atan2 wrapped.
     *
     * The winding number is the one piece of state genuinely not
     * recoverable from the current pointer position, so it is the one piece
     * kept. A pointer cannot travel half a circle around the hub between
     * two frames, so a jump larger than pi is the seam, never a real sweep.
     */
    const step = now - dragging.lastAngle;
    if (step > Math.PI) dragging.turns -= 1;
    else if (step < -Math.PI) dragging.turns += 1;
    dragging.lastAngle = now;

    let delta = now - dragging.startAngle + dragging.turns * Math.PI * 2;
    // Ctrl/Cmd snaps to 15°, the increment every CAD tool agrees on.
    if (snapHeld(e)) delta = Math.round(delta / SNAP.angle) * SNAP.angle;
    typed = '';
    // Screen winding → world winding, per the side of the ring the camera
    // is on (measured at press). Typed values skip this on purpose: a
    // typed 45 means +45° about the axis, not a hand motion.
    applyGestureAngle(delta * (dragging.ringSign || 1));
    showMeasure();
    return;
  }

  /* Scale: distance from the hub, as a ratio to where the drag began.
     A ratio rather than a pixel delta means the knob keeps up with the
     cursor at any zoom, and doubling is always the same gesture. */
  if (dragging.tool === TOOL.SCALE && dragging.entry) {
    const o = dragging.entry.ringOrigin;
    if (!o) return;
    const here = Math.hypot(e.clientX - rectLeft() - o.x, e.clientY - rectTop() - o.y);
    // startRadius is captured at pointerdown, never here. Setting it on the
    // first move made that move's factor exactly 1 by construction, so a
    // short drag produced no scale at all and a long one silently lost its
    // first frame of travel.
    let factor = Math.max(0.02, here / (dragging.startRadius || here));
    // CTRL magnet: the harmonic scale lattice — halves, thirds, φ, and their
    // octaves — pulled in by the knob's screen travel (px per unit factor is
    // the press radius), so "it found 2:3 for me" instead of only decades of
    // 10%. Floored to one grid step so a zero factor can never collapse the
    // part (the daemon rejects that on save).
    if (snapHeld(e)) {
      const h = S3DMath.findClosestHarmonicScale(factor);
      const blended = Math.max(SNAP.scale, magnetBlendPx(factor, h.scale, Math.abs(factor - h.scale) * (dragging.startRadius || 1)));
      ctrlLatched = magnetEngaged(factor, blended, h.scale);
      factor = blended;
    }
    typed = '';
    applyGestureScale(factor, e.shiftKey);
    showMeasure();
    return;
  }

  if (dragging.entry) {
    /*
     * Constrained axis move, solved perspective-correctly: find where the
     * cursor lands on the part's world axis LINE and move the part by the
     * change in that position since the grab. Cursor-locked (the grab point
     * tracks the pointer at any foreshortening, exactly, not by a screen
     * approximation) and horizon-clamped (the line's admissible depth stops a
     * drag flinging the part behind the camera).
     *
     * The gesture still carries a single signed length, so the position stays
     * a pure function of one number — which is what lets a typed value replace
     * it. When the axis was edge-on at press there is no stable line to solve,
     * so the old screen-projection approximation carries that rare frame.
     */
    let len;
    if (dragging.axisAnchor && dragging.axisLambda0 !== null) {
      const r = S3DMath.solveProjectedLineParameterAdmissible(
        dragging.axisAnchor, gesture.dir, pointerCss(e), projCtx(),
        gesture.len + dragging.axisLambda0,
      );
      len = r.degenerate ? gesture.len : r.lambda - dragging.axisLambda0;
    } else {
      const s = dragging.entry.screen;
      const lenPx = Math.hypot(s.x, s.y);
      if (lenPx <= 0.0001) return;
      len = gesture.len + (dx * s.x + dy * s.y) / (lenPx * lenPx);
    }
    // CTRL magnet: pull toward the 5mm grid by on-screen proximity along the
    // axis, so it feels like a magnet catching rather than a stair-step.
    if (snapHeld(e)) {
      const a = dragging.axisAnchor || selectionCenter();
      if (a) {
        const target = Math.round(len / SNAP.grid) * SNAP.grid;
        const blended = magnetBlendWorld(len, target,
          [a[0] + gesture.dir[0] * len, a[1] + gesture.dir[1] * len, a[2] + gesture.dir[2] * len],
          [a[0] + gesture.dir[0] * target, a[1] + gesture.dir[1] * target, a[2] + gesture.dir[2] * target],
          projCtx());
        ctrlLatched = magnetEngaged(len, blended, target);
        len = blended;
      } else {
        len = Math.round(len / SNAP.grid) * SNAP.grid;
      }
    }
    typed = '';
    gesture.snappedTo = null;
    /* SHIFT-align: magnetically snap the selection's faces/centre to a nearby
       part's — flush, coplanar, or centre-to-centre — measured from the
       pre-drag box so the target does not creep as the pointer travels. The
       pull uses the same on-screen magnet as CTRL, so alignment catches and
       releases smoothly instead of locking. */
    if (e.shiftKey) {
      const al = semanticSnapLen(len);
      if (al) {
        const a = dragging.axisAnchor || selectionCenter();
        const blended = a
          ? magnetBlendWorld(len, al.len,
              [a[0] + gesture.dir[0] * len, a[1] + gesture.dir[1] * len, a[2] + gesture.dir[2] * len],
              [a[0] + gesture.dir[0] * al.len, a[1] + gesture.dir[1] * al.len, a[2] + gesture.dir[2] * al.len],
              projCtx())
          : al.len;
        // Name the alignment only once the magnet has actually taken hold.
        if (magnetEngaged(len, blended, al.len)) { gesture.snappedTo = al.label; shiftLatched = true; }
        len = blended;
      }
    }
    applyGestureLength(len);
    showMeasure();
    return;
  }

  const delta = [0, 0, 0];
  {
    /*
     * Free: slide across the view plane, so the part stays under the cursor.
     *
     * This is now the SAME conversion the camera pan uses — worldPerPixel
     * against the camera's own right/up — rather than a second derivation
     * living next to it. The second derivation was wrong in two separate
     * ways, and both were invisible in a screenshot:
     *
     *  - it multiplied by the literal 0.0016, which is this formula frozen
     *    at a 518px-tall canvas, so the part outran or lagged the cursor at
     *    every other viewport size, and the panel is resizable;
     *  - it built the offset from the azimuth alone, ignoring elevation, so
     *    it actually slid along the ground plane while its own comment
     *    claimed the view plane. Under a tilted camera the part drifted
     *    away from the pointer as the drag went on.
     *
     * Shift still constrains to world vertical, which is a real constraint
     * rather than an approximation of one.
     */
    const perPixel = worldPerPixel(state, canvas);
    if (e.shiftKey) delta[1] = -dy * perPixel;
    else {
      const basis = cameraBasis(state);
      for (let a = 0; a < 3; a++) {
        delta[a] = dx * perPixel * basis.right[a] - dy * perPixel * basis.up[a];
      }
    }
  }

  for (const name of dragging.names) {
    const t = editFor(name).translate;
    for (let i = 0; i < 3; i++) t[i] += delta[i];
    if (snapHeld(e)) for (let i = 0; i < 3; i++) t[i] = Math.round(t[i] / SNAP.grid) * SNAP.grid;
  }
  applyEditsToDraws();
  refreshEditButtons();

  // Free moves cannot be typed (there is no single axis to type along) but
  // they can still be measured, so the readout stays honest either way.
  const first = dragging.names[0];
  const base = dragging.before[first];
  const now = edits[first].translate;
  gesture.len = Math.hypot(
    now[0] - (base ? base.translate[0] : 0),
    now[1] - (base ? base.translate[1] : 0),
    now[2] - (base ? base.translate[2] : 0),
  );
  showMeasure();
}

function endDrag(cancel) {
  if (!dragging) return;
  tip.classList.remove('busy');
  gizmo.classList.remove('dragging', 'centre-active');
  for (const m of ['move','rotate','scale','trackball','free']) gizmo.classList.remove('mode-' + m);
  for (const en of gizmoAxes) en.group.classList.remove('active');
  if (cancel) { applySnapshot(dragging.before); endGesture(); }
  // One history entry per gesture, not per frame.
  else if (dragging.armed) commitHistory(dragging.before, snapshot(dragging.names));
  else endGesture();
  const moved = dragging.armed && !cancel;
  dragging = null;
  state.suppressOrbit = false;
  // The tool context is gone, so the chips fall back to their resting labels.
  refreshModChips();
  invalidate();
  /* The neighbourhood map reads gaps and contacts from part positions; a
     committed drag changed exactly those. Rebuilding on release keeps the
     map telling the truth the moment the hand lifts — the same staleness
     the findings card already labels, fixed at the source for the map. */
  if (moved && state.selection.size > 0) updateTip();
}

/* Numeric override, after SketchUp's Measurements box: there is no field to
   focus. While a gesture is live — during the drag or in the moments after
   it — digits go to the box instead of to the app, and Enter places the
   selection at exactly that distance along the axis the drag established.
   Coarse with the mouse, exact with the keyboard, one gesture. */
/* The card's own controls. Wired once, at load: the card is a fixed piece
   of markup that is re-filled per selection, not rebuilt, so re-binding on
   every selection would stack duplicate listeners. */
{
  const gizmoBtn = document.getElementById('tipGizmo');
  if (gizmoBtn) gizmoBtn.addEventListener('click', () => setGizmoHidden(!gizmoHidden));
  const pinBtn = document.getElementById('tipPin');
  if (pinBtn) pinBtn.addEventListener('click', () => setTipPinned(!tipPinned));
  const foldBtn = document.getElementById('tipFold');
  /* One control, two directions of the same journey: with the material
     panel open the chevron has pivoted into a back arrow and steps back
     out; otherwise it collapses and expands the card as it always has. */
  if (foldBtn) foldBtn.addEventListener('click', () => {
    if (tipGallery) {
      /* Surface one level: gallery -> material panel. */
      tipGallery = false;
      tip.classList.remove('gal');
      buildMatPanel();
      tipSize = { w: tip.offsetWidth || 170, h: tip.offsetHeight || 120 };
      tipPlacement = null; tipAt = null;
      positionTip();
      invalidate();
    } else if (tipMat) setTipMat(null);
    else setTipFolded(!tipFolded);
  });
}

/* Modifier state is live, not sampled at pointerdown: the cue exists to
   answer "what will this do" BEFORE the gesture starts. Capture phase, so a
   handler that stops propagation cannot leave the widget showing a lattice
   that is no longer armed. */
window.addEventListener('keydown', refreshMods, true);
window.addEventListener('keyup', refreshMods, true);
window.addEventListener('pointermove', refreshMods, true);
window.addEventListener('pointerdown', refreshMods, true);
/* A modifier released while the window is unfocused never sends a keyup. */
window.addEventListener('blur', () => refreshMods(null));

window.addEventListener('keydown', (e) => {
  if (!gesture || !gesture.dir) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  // A comma is admitted alongside the dot because parseLength treats it as a
  // decimal separator (keypads emit whichever the OS layout says). Leaving it
  // out made "0,5" untypeable even though the parser was built to take it.
  if (/^[0-9]$/.test(k) || k === '.' || k === ',' || k === '-' || k === "'" || k === '"' ||
      /^[a-z]$/.test(k) && typed !== '') {
    typed += k;
  } else if (k === 'Backspace') {
    if (typed === '') return;
    typed = typed.slice(0, -1);
  } else if (k === 'Enter') {
    const before = gesture.before;
    /* One grammar for every field, from the math engine's VCB parser: units
       (m/cm/mm/ft/in), degrees/radians, fractions (3/4, 16/9), and the
       constructive constants (phi, sqrt2/3/5) — so a scale can be typed "phi"
       or "3/4" and a length "2cm". The ACTIVE TOOL still decides what a bare
       number means (degrees rotating, a factor scaling, metres moving),
       because that is context the suffix-free grammar cannot supply. The box
       has always taken 5" / 3' and comma decimals, so those normalise to the
       grammar's spelling first. */
    const expr = typed.replace(/,/g, '.').replace(/"\s*$/, 'in').replace(/'\s*$/, 'ft');
    const vcb = S3DMath.parseTypedVCBExpression(expr, 1);
    const bail = () => { typed = ''; showMeasure(); e.preventDefault(); };
    if (!vcb.valid) { bail(); return; }
    const p = vcb.parsed;
    if (gesture.unit === 'deg') {
      // Rotate: an explicit angle wins; a bare number reads as degrees.
      const deg = p.type === 'Angle' ? p.rawDeg : p.type === 'DimensionlessScale' ? p.factor : null;
      if (deg === null || !isFinite(deg) || Math.abs(deg) > 1440) { bail(); return; }
      applyGestureAngle(deg * Math.PI / 180);
    } else if (gesture.unit === 'x') {
      // Scale: any dimensionless value — number, fraction, phi, sqrtN.
      const factor = p.type === 'DimensionlessScale' ? p.factor : null;
      if (factor === null || !isFinite(factor) || factor <= 0 || factor > 1000) { bail(); return; }
      applyGestureScale(factor, gesture.uniform);
    } else {
      // Move: a length in metres, or a bare number read as metres. A typed
      // magnitude keeps the direction the drag chose ("0.5" after dragging
      // left is half a metre left), so its sign comes from the gesture.
      const metres = p.type === 'Length' ? p.rawMeters : p.type === 'DimensionlessScale' ? p.factor : null;
      if (metres === null || !isFinite(metres) || Math.abs(metres) > MAX_TRANSLATE) { bail(); return; }
      const sign = gesture.len < 0 ? -1 : 1;
      applyGestureLength(Math.abs(metres) * sign);
    }
    typed = '';
    commitHistory(before, snapshot(gesture.names));
    showMeasure();
  } else if (k === 'Escape') {
    // Escape peels one layer: the typed override first, the drag only once
    // there is nothing left to take back. With an override showing, this
    // handler consumes the key (stopImmediatePropagation) so the window-level
    // Escape below cannot cancel the whole gesture on the same press — that is
    // what made "just clear what I typed" impossible. An empty box falls
    // through untouched, so a second Escape still cancels the drag.
    if (typed === '') return;
    typed = '';
    showMeasure();
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  } else {
    return;
  }
  e.preventDefault();
  showMeasure();
});

window.addEventListener('pointermove', moveGizmoDrag);
window.addEventListener('pointerup', () => endDrag(false));

const SVGNS = 'http://www.w3.org/2000/svg';
let gizmoRing = null;
let gizmoArcs = [];
let gizmoBall = null;
let gizmoBallRadius = 0;
let gizmoBallRim = null;
let gizmoBox = null;

/*
 * Gizmo proportions.
 *
 * Every number here is derived from one of two measured quantities — the
 * grab corridor's width, which is set by pointing accuracy, and the head's
 * length, which is set by the shaft's — so the widget scales as one object
 * and none of it is a number that merely looked right once.
 *
 *   grabWidth      A 15px corridor gives a ~7.5px miss radius on either
 *                  side of the shaft. Fitts-style targeting research puts
 *                  comfortable mouse acquisition around that scale, and it
 *                  is close to the 44px touch target divided by the ~3x
 *                  precision advantage a mouse has over a fingertip.
 *   minAspect      Below this length-to-width ratio the handle is no longer
 *                  meaningfully directional — it is a blob — so the axis
 *                  fades rather than inviting an ambiguous grab.
 *   headLength     Proportional to the grab corridor so the head always
 *                  sits comfortably inside the target the user is aiming
 *                  at, never overhanging it.
 *   headHalfWidth  1/(2·φ) of the head's length. The golden ratio gives a
 *                  head that reads as sharp without becoming a needle, and
 *                  it is the same proportion used for the ring below.
 *   headNotch      A concave tail, as in a drawn arrow rather than a
 *                  triangle. It costs one point and is most of why the
 *                  shape reads as deliberate.
 */
const PHI = (1 + Math.sqrt(5)) / 2;
/**
 * On-screen length of an axis handle, in CSS pixels.
 *
 * Proportional to the viewport so the widget stays in scale with the panel,
 * clamped so it is neither a speck in a thumbnail nor a set of girders
 * across a full-screen window. Clamping in PIXELS is the point: it is the
 * only unit in which "too big to use" and "too small to grab" mean
 * anything, and every previous attempt to express this in world units
 * carried a hidden assumption about the viewport that broke at other sizes.
 */
function gizmoLengthCss() {
  return Math.max(78, Math.min(190, viewportHeight(canvas) * 0.19));
}

const GIZMO = {
  grabWidth: 15,
  minAspect: 1.75,

  get headLength() { return this.grabWidth * 1.05; },
  /* Half-width from a 45° apex: tan(22.5°). An apex much wider than this
     reads as a triangle sitting on a stick, much narrower as a needle that
     disappears against busy geometry. 45° is the angle at which the head
     is unmistakably an arrow at every size it gets drawn at here. */
  headHalfWidthRatio: Math.tan(Math.PI / 8),
  /* A shallow concave tail. Deep enough to read as drawn rather than
     stamped, shallow enough that the head still looks solid at 12px. */
  headNotchRatio: 0.16,
  get tagGap() { return this.grabWidth * 0.85; },
  /* Hub radius tracks the selection's own projected size, so the widget is
     visibly attached to the thing it edits. The floor keeps it grabbable on
     a small part; the ceiling stops it becoming a hoop around a large one.
     Both are expressed in grab corridors, which is the unit that decides
     whether a thing can be hit at all. */
  /* Deliberately small. The hub's job is to be the origin the arrows leave
     from and a target for free movement — not to ring the part. Sized to a
     fraction of the grab corridor it stays a confident dot rather than a
     hoop competing with the geometry for attention, and the range between
     floor and ceiling is narrow enough that the difference reads as "this
     part is bigger" instead of as a different widget. */
  hubOfSpan: 0.085,
  get hubMin() { return this.grabWidth * 0.42; },
  get hubMax() { return this.grabWidth * 0.95; },
  /* 4% radius. Large enough to notice at the edge of vision, small enough
     that the ring never appears to change size. */
  /* Rotation rings sit just outside the hub, scale knobs just inside the
     arrowheads. Both are stated as multiples of the arrow's own length so
     the three tools keep their relative positions at every zoom. */
  ringOfLength: 0.55,
  /* Gap from arrowhead to scale knob, and from knob to the axis label.
     Both in screen pixels: they are chrome spacing, not scene geometry. */
  knobGap: 16,
  knobSize: 5.5,
  /* Trackball radius. Nested strictly INSIDE the rotation rings so the two
     never compete for the same pixels — the free control is the innermost
     band, the axis rings the middle, the arrows the outermost reach. Three
     concentric bands is what makes the whole thing read as one instrument
     rather than three widgets sharing a centre. */
  ballOfLength: 0.32,
};

/*
 * One gizmo, three tools, no mode toolbar.
 *
 * The alternative — a W/E/R mode switch, as most DCC apps use — means the
 * handle under your cursor is whatever you last pressed, and a beginner has
 * to know the modes exist before the widget makes sense. Here every tool is
 * on screen at once and each occupies a different, obvious shape:
 *
 *   arrows   move    the outermost thing, along one axis
 *   rings    rotate  arcs at the hub, orbiting the part
 *   knobs    scale   small cubes on the axis between hub and arrowhead
 *   hub      free move across the view plane
 *
 * They never overlap, so pointing at one cannot select another, and nothing
 * has to be armed before use. A power user still gets exact values by
 * typing, and modifiers still apply: Ctrl snaps to increments, Shift snaps
 * to contact.
 */
const TOOL = { MOVE: 'move', ROTATE: 'rotate', SCALE: 'scale', FREE: 'free', TRACKBALL: 'trackball' };


/*
 * The widget draws itself on, at one speed, from the hub outward.
 *
 * It used to scale the whole overlay from 0.86 and fade it in — one spring,
 * applied uniformly. That is a plop: the shape arrives whole and merely
 * grows, so it reads as a thing dropped on the viewport rather than as
 * something assembling where you asked for it.
 *
 * This reveals each stroke along its own length instead, using
 * stroke-dashoffset. Nothing scales, nothing translates, nothing
 * overshoots — the geometry is at its true size on the first frame and
 * stays there, which is what makes it read as static and deliberate rather
 * than bouncy.
 *
 * The stagger is not authored. Every stroke reveals at the SAME arc-length
 * speed, derived so the longest one completes exactly at SUMMON_MS, so
 * short strokes finish early and long ones late purely because of how long
 * they are. Order emerges from geometry: the hub is the shortest thing on
 * screen and sits at the origin, so the widget grows outward from the point
 * you clicked without a single authored delay.
 */
const SUMMON_MS = 190;

/*
 * The increments the modifiers actually snap to.
 *
 * Declared once and read by BOTH the snapping arithmetic and the cue that
 * previews it. A preview that draws its own idea of the lattice is a
 * decoration; one that reads the same number the snap uses is a promise.
 */
const SNAP = {
  /** Rotation, in radians. 15 degrees — the increment every CAD tool agrees on. */
  angle: Math.PI / 12,
  /** Translation, in metres. */
  grid: 0.005,
  /** Scale, as a fraction. */
  scale: 0.1,
};

/**
 * Is the snap modifier down on this event? Ctrl on Windows/Linux, Cmd on
 * macOS — the platforms disagree on which key CAD "snap" lives under, so both
 * count. This is the ONE predicate the cue (refreshMods) and every drag path
 * read, so the lattice can never light while the drag ignores the key: on a
 * Mac, holding Cmd used to preview a snap that the move/rotate/scale handlers
 * never applied. */
const snapHeld = (e) => !!(e && (e.ctrlKey || e.metaKey));

/**
 * Which modifiers are held right now, and therefore what a drag would do.
 *
 * Tracked continuously rather than read at pointerdown, because the whole
 * point is to answer "what will this do" BEFORE the gesture starts. The
 * answer has to be on screen while the choice is still reversible.
 */
const mods = { snap: false, vertical: false };
let summonAt = 0;

/** 0..1 reveal for a stroke of the given px length, at the shared speed. */
function summonProgress(length, longest, elapsed) {
  if (elapsed >= SUMMON_MS) return 1;
  if (!(length > 0)) return 1;
  const revealed = (elapsed / SUMMON_MS) * Math.max(1e-6, longest);
  return Math.max(0, Math.min(1, revealed / length));
}

/** Create the handle nodes once; positions come later, every frame. */
function buildGizmo() {
  gizmo.textContent = '';
  gizmoAxes = [];
  gizmoRing = null;
  if (state.selection.size === 0) {
    gizmo.classList.add('off');
    // Reset rather than animate out: the widget is already hidden, and a
    // reveal left half-finished would make the next selection start
    // part-drawn.
    summonAt = 0;
    return;
  }
  // Extend from the centre on every fresh selection. Re-running it when the
  // selection merely grows would restart the animation under the cursor of
  // someone shift-clicking a series of parts.
  if (summonAt === 0) summonAt = performance.now();

  for (const axis of AXES) {
    const g = document.createElementNS(SVGNS, 'g');
    /* Tagged with its own axis so a rule can name one. Shift constrains
       free movement to world vertical, and the cue for that has to be able
       to say WHICH handle still applies. */
    g.setAttribute('class', 'axis axis-' + String(axis.tag).toLowerCase());
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('class', 'shaft');
    line.setAttribute('stroke', axis.color);
    const grab = document.createElementNS(SVGNS, 'line');
    grab.setAttribute('class', 'grab');
    const head = document.createElementNS(SVGNS, 'polygon');
    head.setAttribute('class', 'head');
    head.setAttribute('fill', axis.color);
    const tag = document.createElementNS(SVGNS, 'text');
    tag.setAttribute('class', 'tag');
    tag.setAttribute('fill', axis.color);
    tag.textContent = axis.tag;
    /* Rotation ring for this axis: an ellipse, because a circle around the
       axis in 3D projects to one on screen. Drawn as a path so the near
       half can be solid and the far half faint — that is what tells you
       which way the ring is facing, and therefore which way a drag turns
       the part. */
    const ringBack = document.createElementNS(SVGNS, 'path');
    ringBack.setAttribute('class', 'ring-arc back');
    ringBack.setAttribute('stroke', axis.color);
    const ring = document.createElementNS(SVGNS, 'path');
    ring.setAttribute('class', 'ring-arc');
    ring.setAttribute('stroke', axis.color);
    const ringGrab = document.createElementNS(SVGNS, 'path');
    ringGrab.setAttribute('class', 'ring-grab');

    /* Scale knob: a small square on the axis, inside the arrowhead. Square
       rather than round so it never reads as another rotation control. */
    const knob = document.createElementNS(SVGNS, 'rect');
    knob.setAttribute('class', 'knob');
    knob.setAttribute('fill', axis.color);
    /* The knob's real target, invisible and far larger than the glyph.
       The visible square is ~5px because a big one would dominate the axis
       it sits on, but 5px is a target almost nobody can hit — the shaft
       already carries a 15px companion for exactly this reason and the
       knob was left without one. Verified the hard way: a synthetic event
       aimed straight at the element started a scale, and a real pointer at
       the same coordinates did not. */
    const knobGrab = document.createElementNS(SVGNS, 'rect');
    knobGrab.setAttribute('class', 'knob-grab');
    g.append(ringBack, ring, ringGrab, line, head, knob, knobGrab, grab, tag);
    gizmo.appendChild(g);

    const entry = {
      axis: axis, group: g, line: line, grab: grab, head: head, tag: tag,
      ring: ring, ringBack: ringBack, ringGrab: ringGrab, knob: knob, knobGrab: knobGrab, screen: { x: 0, y: 0 },
    };
    gizmoAxes.push(entry);
    /* Hovering a handle tells the WHOLE widget what is about to happen,
       not just the handle under the cursor.
       Reaching for a scale knob should not look like reaching for an arrow
       until the moment you press — by then it is too late to notice you
       were about to do the wrong thing. So the gizmo shifts into the mode
       you are pointing at: the tool you would use comes forward, the other
       two recede, and the part's own footprint appears when it is about to
       be resized. The cue arrives while the choice is still reversible. */
    const arm = (el, tool) => {
      el.addEventListener('pointerenter', () => {
        g.classList.add('hot');
        gizmo.classList.add('mode-' + tool);
        // The snap/shift chips name the increment and effect for the tool in
        // hand, so a hover changes what they should say.
        refreshModChips();
      });
      el.addEventListener('pointerleave', () => {
        g.classList.remove('hot');
        // Only while nothing is being dragged: a drag owns the mode until
        // it ends, and the pointer routinely leaves the handle mid-drag.
        if (!dragging) { gizmo.classList.remove('mode-' + tool); refreshModChips(); }
      });
      el.addEventListener('pointerdown', (e) => beginGizmoDrag(e, entry, tool));
    };
    arm(grab, TOOL.MOVE);
    arm(head, TOOL.MOVE);
    arm(ringGrab, TOOL.ROTATE);
    arm(knob, TOOL.SCALE);
    arm(knobGrab, TOOL.SCALE);
  }

  /* The hub.
     Not a separate control that happens to sit at the origin — it is where
     the three arrows come from, and it is drawn to say so. The ring is cut
     into three arcs, each spanning the gap between two axes and carrying a
     gradient from one axis's colour to the next, so the colour flows
     continuously around it and every arrow appears to grow out of the point
     on the ring that already wears its colour.
     Three arcs is the minimum that can do this, and their span is dictated
     by where the axes actually project — nothing here is a fixed angle. */
  /* The trackball.
     A sphere sitting between the hub and the arrowheads, whose surface you
     grab to turn the part freely — Shoemake's arcball, the same control
     Blender puts inside its rotation gizmo and Maya calls the trackball.
     The three rings constrain rotation to one axis; this is what you reach
     for when the orientation you want is not about any single axis, which
     is most of them.

     Drawn as a filled circle with a rim: the rim reads as a sphere's
     silhouette, and the faint fill says the interior is grabbable without
     hiding the geometry underneath. */
  /* Radial fade: opaque-ish at the centre, vanishing at the rim. A flat
     fill has a hard edge wherever it stops; a fade has none, so the ball
     sits behind the rings as atmosphere rather than as an object. */
  const ballDefs = document.createElementNS(SVGNS, 'defs');
  const fade = document.createElementNS(SVGNS, 'radialGradient');
  fade.setAttribute('id', 'ballFade');
  const s0 = document.createElementNS(SVGNS, 'stop');
  s0.setAttribute('offset', '0');
  s0.setAttribute('stop-color', 'rgb(140,150,170)');
  s0.setAttribute('stop-opacity', '.18');
  const s1 = document.createElementNS(SVGNS, 'stop');
  s1.setAttribute('offset', '.72');
  s1.setAttribute('stop-color', 'rgb(140,150,170)');
  s1.setAttribute('stop-opacity', '.07');
  const s2 = document.createElementNS(SVGNS, 'stop');
  s2.setAttribute('offset', '1');
  s2.setAttribute('stop-color', 'rgb(140,150,170)');
  s2.setAttribute('stop-opacity', '0');
  fade.append(s0, s1, s2);
  ballDefs.appendChild(fade);
  gizmo.appendChild(ballDefs);

  gizmoBall = document.createElementNS(SVGNS, 'circle');
  gizmoBall.setAttribute('class', 'ball');
  gizmoBall.addEventListener('pointerenter', () => gizmo.classList.add('ball-hot'));
  gizmoBall.addEventListener('pointerleave', () => gizmo.classList.remove('ball-hot'));
  gizmoBall.addEventListener('pointerdown', (e) => beginGizmoDrag(e, null, TOOL.TRACKBALL));
  gizmo.appendChild(gizmoBall);
  gizmoBallRim = document.createElementNS(SVGNS, 'circle');
  gizmoBallRim.setAttribute('class', 'ball-rim');
  gizmo.appendChild(gizmoBallRim);

  // The selection's screen footprint, revealed only in scale mode.
  gizmoBox = document.createElementNS(SVGNS, 'rect');
  gizmoBox.setAttribute('class', 'bbox');
  gizmo.appendChild(gizmoBox);

  const defs = document.createElementNS(SVGNS, 'defs');
  gizmoArcs = [];
  for (let i = 0; i < 3; i++) {
    const grad = document.createElementNS(SVGNS, 'linearGradient');
    grad.setAttribute('id', 'hub' + i);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    const a = document.createElementNS(SVGNS, 'stop');
    a.setAttribute('offset', '0');
    const b = document.createElementNS(SVGNS, 'stop');
    b.setAttribute('offset', '1');
    grad.append(a, b);
    defs.appendChild(grad);
    const arc = document.createElementNS(SVGNS, 'path');
    arc.setAttribute('class', 'hub-arc');
    arc.setAttribute('stroke', 'url(#hub' + i + ')');
    gizmo.appendChild(arc);
    gizmoArcs.push({ arc: arc, from: a, to: b, grad: grad });
  }
  gizmo.insertBefore(defs, gizmo.firstChild);

  // A transparent circle on top carries the free-move gesture. Keeping hit
  // testing off the painted arcs means the target stays one clean radius
  // even while the arcs breathe.
  gizmoRing = document.createElementNS(SVGNS, 'circle');
  gizmoRing.setAttribute('class', 'ring');
  gizmoRing.addEventListener('pointerdown', (e) => beginGizmoDrag(e, null));
  gizmo.appendChild(gizmoRing);
  positionGizmo();
}

/** Point on the hub circle at a screen angle. */
function hubPoint(o, r, angle) {
  return { x: o.x + Math.cos(angle) * r, y: o.y + Math.sin(angle) * r };
}

/**
 * Draw the hub as one continuous ring of flowing colour.
 *
 * Radius comes from the selection's own projected size, so the hub reads as
 * belonging to the part it is attached to — a wide crate wears a wide hub, a
 * bolt a small one — rather than being a fixed badge dropped on top of
 * whatever happens to be selected. It is clamped at both ends so it stays a
 * reachable target on a tiny part and never swallows a large one.
 *
 * It does not move. An idle widget that pulses is asking for attention it
 * has already been given — you are looking at it because you selected the
 * part — and the sine that used to drive it never settled, so a permanent
 * animation frame ran behind a static picture for as long as anything was
 * selected. Presence is carried by the colour flowing around the hub, which
 * costs nothing when the camera is still.
 */
function paintHub(o, r) {
  if (!gizmoArcs.length) return;
  const rr = r;

  // Order the axes by where they actually point on screen, then span each
  // gap with a gradient between its two neighbours' colours. As the camera
  // orbits, the arcs travel with their axes and the colour flows with them.
  const live = gizmoAxes
    .filter((e) => Math.hypot(e.screen.x, e.screen.y) > 1e-6)
    .map((e) => ({ angle: Math.atan2(e.screen.y, e.screen.x), color: e.axis.color }))
    .sort((a, b) => a.angle - b.angle);

  for (let i = 0; i < gizmoArcs.length; i++) {
    const slot = gizmoArcs[i];
    if (live.length < 2 || i >= live.length) { slot.arc.setAttribute('d', ''); continue; }
    const from = live[i];
    const to = live[(i + 1) % live.length];
    let sweep = to.angle - from.angle;
    if (sweep <= 0) sweep += Math.PI * 2;
    const a = hubPoint(o, rr, from.angle);
    const b = hubPoint(o, rr, to.angle);
    slot.arc.setAttribute('d',
      'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) +
      'A' + rr.toFixed(2) + ' ' + rr.toFixed(2) + ' 0 ' +
      (sweep > Math.PI ? 1 : 0) + ' 1 ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2));
    // The gradient runs along the arc's chord, which is the closest a
    // straight gradient gets to following the curve — over a span this
    // short the difference is invisible.
    slot.grad.setAttribute('x1', a.x.toFixed(2)); slot.grad.setAttribute('y1', a.y.toFixed(2));
    slot.grad.setAttribute('x2', b.x.toFixed(2)); slot.grad.setAttribute('y2', b.y.toFixed(2));
    slot.from.setAttribute('stop-color', from.color);
    slot.to.setAttribute('stop-color', to.color);
  }

  if (gizmoRing) {
    gizmoRing.setAttribute('cx', o.x); gizmoRing.setAttribute('cy', o.y);
    gizmoRing.setAttribute('r', r.toFixed(2));
  }
}

/** How large the selection is on screen, as a radius in pixels. */
function selectionScreenSpan(o) {
  let far = 0;
  for (const d of renderer.draws) {
    if (!state.selection.has(d.name)) continue;
    for (let i = 0; i < 8; i++) {
      const p = worldToScreen(renderer, state, canvas, [
        i & 1 ? d.max[0] : d.min[0],
        i & 2 ? d.max[1] : d.min[1],
        i & 4 ? d.max[2] : d.min[2],
      ]);
      if (p) far = Math.max(far, Math.hypot(p.x - o.x, p.y - o.y));
    }
  }
  return far;
}

/* The handles' drawn screen footprint, republished by positionGizmo every
   time it draws and nulled on every bail — so the card's solver never
   avoids a widget that is not on screen. */
let gizmoFootprint = null;

function positionGizmo() {
  gizmoFootprint = null;
  if (!gizmoAxes || !renderer) return;
  /* Hidden by choice. Bail before any projection work rather than drawing
     the widget and covering it: the handles carry pointer-events, so a
     merely transparent gizmo would still swallow every click on the part
     the user hid it to look at. */
  if (gizmoHidden) { gizmo.classList.add('off'); return; }
  const origin = selectionCenter();
  if (!origin) { gizmo.classList.add('off'); return; }
  const o = worldToScreen(renderer, state, canvas, origin);
  if (!o) { gizmo.classList.add('off'); return; }

  /*
   * Handle length: a fixed number of CSS pixels, converted to world units
   * at the SELECTION'S OWN DEPTH.
   *
   * It used to be state.distance * 0.16. That is the camera's distance to
   * the ORBIT PIVOT, which is only the depth of the thing being edited when
   * the two coincide. Select a part far from the pivot in a large scene and
   * the widget is sized for a depth the part is nowhere near — the reported
   * "obscenely scaled gizmo". It also carried an implied viewport height and
   * an implied field of view, so the same selection drew at different sizes
   * in different panels.
   *
   * The conversion is the same one pan and free-move use — the frustum
   * height at a given depth spread over the viewport — so a handle is now
   * the same length on screen in a scene measured in millimetres and one
   * measured in kilometres, at any zoom.
   */
  const depth = viewDepth(renderer, state, origin);
  const planes = viewFrustum(state, renderer.bounds);
  if (!(depth >= planes.near)) { gizmo.classList.add('off'); return; }
  const perPixel = (2 * depth * Math.tan(FOV_Y / 2)) / viewportHeight(canvas);
  const len = gizmoLengthCss() * perPixel;
  // The reveal runs on the widget as a whole, so the three axes extend
  // together as one object rather than as three independent animations.
  /* The appear animation is PRESENTATION, not geometry.
   *
   * It used to scale the axis lengths, which meant that at the first frame
   * every arrowhead, knob and label — all of them fixed-size chrome — sat
   * piled on top of each other at the origin at full size, then flew
   * outward. That is what the opening "spazz" was. It also forced every
   * pixel-based offset to divide by a length of nearly zero, which is where
   * the knobs at coordinates in the billions came from.
   *
   * So the widget is now always built at its true size, and the spring
   * drives a CSS scale and fade on the overlay instead. One transform,
   * applied about the hub, animating a shape that is already correct —
   * there is no frame at which the geometry is degenerate, so an entire
   * family of divide-by-zero and pile-up bugs simply cannot happen.
   */
  const grow = 1;
  // Resolved once and shared: the arrows start where the hub ends, so the
  // two must agree on exactly where that is.
  const hubR = Math.max(GIZMO.hubMin,
    Math.min(GIZMO.hubMax, selectionScreenSpan(o) * GIZMO.hubOfSpan)) * grow;

  /* Pass one: project every axis before drawing any of them.
     Each rotation ring is built from the OTHER two axes' screen vectors,
     so drawing inside a single loop meant the first axis read values that
     had not been computed yet — zero on the very first frame of a fresh
     selection. That is what made the opening animation lurch: the rings
     were briefly built from garbage, then snapped into place once every
     axis had been visited. Two passes, and frame one is as correct as
     frame fifty. */
  for (const entry of gizmoAxes) {
    const d = entry.axis.dir;
    const p = worldToScreen(renderer, state, canvas,
      [origin[0] + d[0]*len, origin[1] + d[1]*len, origin[2] + d[2]*len]);
    entry.projected = p || null;
    if (!p) { entry.screen.x = 0; entry.screen.y = 0; continue; }
    // Measured at FULL length, never at the animated length: dragging
    // during the appear animation must not move the part further per pixel
    // than dragging after it settles.
    entry.screen.x = (p.x - o.x) / len;
    entry.screen.y = (p.y - o.y) / len;
  }

  /* Published for the selection card's placement solver: the handles as
     DRAWN — centre, ring band, and each arm's full run including knob and
     tag chrome. The card samples these to stay off the controls. A
     bounding square was tried first and swallowed every candidate slot
     around a small part, which moved the collision instead of removing
     it; the diagonal notches between arms are legitimate card territory
     and only the real footprint knows where they are. */
  gizmoFootprint = {
    x: o.x, y: o.y,
    ringR: gizmoLengthCss() * GIZMO.ringOfLength + GIZMO.grabWidth,
    arms: [],
  };
  for (const entry of gizmoAxes) {
    const p = entry.projected;
    if (!p) continue;
    const armDx = p.x - o.x, armDy = p.y - o.y;
    const armRun = Math.hypot(armDx, armDy);
    if (armRun < 1e-3) continue;
    const armExt = (armRun + GIZMO.knobGap + GIZMO.tagGap + 8) / armRun;
    gizmoFootprint.arms.push({ x: o.x + armDx * armExt, y: o.y + armDy * armExt });
  }

  for (const entry of gizmoAxes) {
    const p = entry.projected;
    if (!p) { entry.group.classList.add('dim'); continue; }
    const dxFull = p.x - o.x, dyFull = p.y - o.y;
    const full = Math.hypot(dxFull, dyFull);
    // An axis pointing nearly at the camera collapses to a few pixels and
    // becomes a coin-flip to grab; fade it so the user reaches for one
    // that will actually behave. The threshold is the grab corridor's own
    // half-width — below that, the handle is narrower than it is long.
    entry.group.classList.toggle('dim', full < GIZMO.grabWidth * GIZMO.minAspect);

    const dx = dxFull * grow, dy = dyFull * grow;
    const tip = { x: o.x + dx, y: o.y + dy };
    const pixels = Math.max(1e-6, full * grow);
    /* Direction from the UNANIMATED length, not the animated one.
       They are mathematically identical — both are scaled by the same
       growth factor — but the animated length starts at zero, and any
       offset expressed in pixels rather than as a fraction then divides by
       it. That put the scale knobs at coordinates in the billions on the
       first frame of the appear animation. */
    const ux = full > 1e-6 ? dxFull / full : 0;
    const uy = full > 1e-6 ? dyFull / full : 0;
    const nx = -uy, ny = ux;

    // The shaft stops where the head begins so the two never overlap into
    // a blunt wedge — the seam is what makes it read as a drawn arrow
    // rather than a line with a blob on the end.
    const head = GIZMO.headLength;
    const neck = Math.max(0, pixels - head);
    // The shaft begins at the hub's edge rather than at the centre, so the
    // arrow reads as leaving the ring instead of being pinned underneath
    // it. The ring already wears this axis's colour at that point, so the
    // two look like one continuous form.
    const root = Math.min(hubR, neck);
    entry.line.setAttribute('x1', o.x + ux * root); entry.line.setAttribute('y1', o.y + uy * root);
    entry.line.setAttribute('x2', o.x + ux * neck); entry.line.setAttribute('y2', o.y + uy * neck);
    // The grab corridor covers the whole handle, head included, and starts
    // at the hub's edge so it never competes with the hub's own target.
    entry.grab.setAttribute('x1', o.x + ux * root); entry.grab.setAttribute('y1', o.y + uy * root);
    entry.grab.setAttribute('x2', tip.x); entry.grab.setAttribute('y2', tip.y);

    // Concatenation, not a template literal: this source is itself inside
    // a template literal, so a nested one would be interpolated at build
    // time rather than emitted.
    const halfW = head * GIZMO.headHalfWidthRatio;
    const notch = head * GIZMO.headNotchRatio;
    entry.head.setAttribute('points',
      tip.x + ',' + tip.y + ' ' +
      (tip.x - ux*head + nx*halfW) + ',' + (tip.y - uy*head + ny*halfW) + ' ' +
      (tip.x - ux*(head - notch)) + ',' + (tip.y - uy*(head - notch)) + ' ' +
      (tip.x - ux*head - nx*halfW) + ',' + (tip.y - uy*head - ny*halfW));
    // Label last on the axis, outside the knob. Ordering along the arm is
    // head → knob → label, so nothing sits on top of anything else.
    const labelAt = pixels + GIZMO.knobGap + GIZMO.tagGap;
    entry.tag.setAttribute('x', o.x + ux * labelAt);
    entry.tag.setAttribute('y', o.y + uy * labelAt);

    /* Scale knob, just past the arrowhead.
       Offset in SCREEN pixels rather than as a fraction of the axis: a
       ratio puts the knob almost on the tip when the axis is foreshortened
       and miles away when it is not, and the gap between head and knob is
       chrome — it should look the same at every angle. */
    const knobAt = pixels + GIZMO.knobGap;
    const k = GIZMO.knobSize;
    entry.knob.setAttribute('x', (o.x + ux * knobAt - k / 2).toFixed(2));
    entry.knob.setAttribute('y', (o.y + uy * knobAt - k / 2).toFixed(2));
    entry.knob.setAttribute('width', k);
    entry.knob.setAttribute('height', k);
    const kg = GIZMO.grabWidth;
    entry.knobGrab.setAttribute('x', (o.x + ux * knobAt - kg / 2).toFixed(2));
    entry.knobGrab.setAttribute('y', (o.y + uy * knobAt - kg / 2).toFixed(2));
    entry.knobGrab.setAttribute('width', kg);
    entry.knobGrab.setAttribute('height', kg);
    entry.knobAt = { x: o.x + ux * knobAt, y: o.y + uy * knobAt };

    /* Rotation ring: the circle perpendicular to this axis, projected.
       Its two on-screen radii are the projections of the OTHER two axes,
       so the ellipse is the true projection of that circle rather than a
       decorative oval — turn the camera and it foreshortens correctly. */
    const others = gizmoAxes.filter((x) => x !== entry);
    if (others.length === 2) {
      const rad = full * GIZMO.ringOfLength;
      const scaleR = len * GIZMO.ringOfLength * grow;
      const a1 = others[0], a2 = others[1];
      const p1 = { x: a1.screen.x * scaleR, y: a1.screen.y * scaleR };
      const p2 = { x: a2.screen.x * scaleR, y: a2.screen.y * scaleR };
      /*
       * Split each ring into the half in FRONT of the part's centre and the
       * half behind it, and draw them differently.
       *
       * Three complete ellipses overlap into spaghetti — you cannot tell
       * which ring is nearer, so the widget reads as three flat hoops laid
       * on top of each other instead of one object in space. Every serious
       * tool hides or fades the far half, and the moment it is faded the
       * three rings resolve into a single sphere. This is the difference
       * between "overlapping rings" and "one thing".
       *
       * Depth is exact rather than guessed: for a point on the ring at
       * angle t, its world position is cos(t)·u + sin(t)·v where u and v
       * are the other two axes. Dotting that with the camera's forward
       * vector says which side of the centre it is on, and the sign
       * changes exactly twice — so front and back are each one contiguous
       * arc, and a polyline through them is smooth.
       */
      const basis = cameraBasis(state);
      const u = a1.axis.dir, v = a2.axis.dir;
      const uf = u[0] * basis.forward[0] + u[1] * basis.forward[1] + u[2] * basis.forward[2];
      const vf = v[0] * basis.forward[0] + v[1] * basis.forward[1] + v[2] * basis.forward[2];

      const STEPS = 44;
      const front = [];
      const back = [];
      let prevSide = null;
      for (let i = 0; i <= STEPS; i++) {
        const t = (i / STEPS) * Math.PI * 2;
        const ct = Math.cos(t), st = Math.sin(t);
        const x = o.x + p1.x * ct + p2.x * st;
        const y = o.y + p1.y * ct + p2.y * st;
        // forward points target -> eye, so a positive dot is toward camera.
        const side = ct * uf + st * vf >= 0;
        const point = { x: x, y: y, t: t };
        /* Where the two halves meet, the sample belongs to BOTH.
           Assigning it to only one leaves the segment between the last
           front point and the first back point undrawn — a real hole of up
           to one step, which is the visible gap in the rings. Sharing the
           boundary sample makes the halves meet exactly. */
        if (prevSide !== null && side !== prevSide) {
          (prevSide ? front : back).push(point);
        }
        (side ? front : back).push(point);
        prevSide = side;
      }
      const trace = (pts) => {
        if (pts.length < 2) return '';
        // Break the polyline wherever the sampled angle jumps, so the arc
        // that wraps past t=0 is drawn as one stroke and never chorded
        // straight across the ring.
        let d = '';
        let prev = null;
        for (const pt of pts) {
          const jump = prev !== null && Math.abs(pt.t - prev) > (Math.PI * 2 / STEPS) * 1.5;
          d += (d === '' || jump ? 'M' : 'L') + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2);
          prev = pt.t;
        }
        return d;
      };
      entry.ring.setAttribute('d', trace(front));
      entry.ringBack.setAttribute('d', trace(back));
      // The grab target covers the whole ring: the far half is still a
      // legitimate place to start a rotation, it just should not shout.
      entry.ringGrab.setAttribute('d', trace(front) + trace(back));
      entry.ringOrigin = { x: o.x, y: o.y, r: rad };
    }
  }
  // Trackball, sized from the arrow length so it stays between the hub and
  // the heads at every zoom, and remembered for the drag maths.
  if (gizmoBall) {
    const ballR = Math.max(hubR + 6, gizmoAxes.reduce(
      (m, en) => Math.max(m, Math.hypot(en.screen.x, en.screen.y) * len), 0,
    ) * GIZMO.ballOfLength);
    gizmoBall.setAttribute('cx', o.x.toFixed(2));
    gizmoBall.setAttribute('cy', o.y.toFixed(2));
    gizmoBall.setAttribute('r', ballR.toFixed(2));
    if (gizmoBallRim) {
      gizmoBallRim.setAttribute('cx', o.x.toFixed(2));
      gizmoBallRim.setAttribute('cy', o.y.toFixed(2));
      gizmoBallRim.setAttribute('r', ballR.toFixed(2));
    }
    if (dragging && dragging.tool === TOOL.TRACKBALL) {
      // Frozen for the duration of a drag: a ball that resized under the
      // hand mid-rotation would change how far each pixel turns the part.
      if (!dragging.ballCentre) dragging.ballCentre = { x: o.x, y: o.y, r: ballR };
    }
    gizmoBallRadius = ballR;
  }
  /* Footprint of the selection in screen space. Projecting all eight
     corners and fitting a box round them is exact for what the user sees,
     where projecting the centre and guessing a size would drift at every
     angle. */
  if (gizmoBox) {
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const d of renderer.draws) {
      if (!state.selection.has(d.name)) continue;
      for (let i = 0; i < 8; i++) {
        const p = worldToScreen(renderer, state, canvas, [
          i & 1 ? d.max[0] : d.min[0],
          i & 2 ? d.max[1] : d.min[1],
          i & 4 ? d.max[2] : d.min[2],
        ]);
        if (!p) continue;
        if (p.x < lo[0]) lo[0] = p.x;
        if (p.y < lo[1]) lo[1] = p.y;
        if (p.x > hi[0]) hi[0] = p.x;
        if (p.y > hi[1]) hi[1] = p.y;
      }
    }
    if (isFinite(lo[0])) {
      gizmoBox.setAttribute('x', (lo[0] - 3).toFixed(2));
      gizmoBox.setAttribute('y', (lo[1] - 3).toFixed(2));
      gizmoBox.setAttribute('width', (hi[0] - lo[0] + 6).toFixed(2));
      gizmoBox.setAttribute('height', (hi[1] - lo[1] + 6).toFixed(2));
    }
  }
  paintHub(o, hubR);
  /* One transform for the whole widget, about the hub it grows out of.
     Scale starts at 0.86 rather than 0 — nothing ever collapses, so there
     is no frame with degenerate geometry — and the fade does most of the
     perceptual work anyway. */
  gizmo.classList.remove('off');
  applyReveal();
  applySnapLattice();
}

/**
 * Reveal every stroke along its own length, and fade the solid chrome in
 * behind the stroke that carries it.
 *
 * Arrowheads, scale knobs and axis tags are fills and text — they have no
 * length to travel, so they cannot be drawn on. Tying each one to the
 * progress of its own shaft keeps them from arriving before the line that
 * points at them, which is the detail that makes the assembly read as one
 * object rather than as parts appearing independently.
 */
/**
 * Subdivide every handle by the increment it would snap to.
 *
 * One idea, three modes. A rotation ring dashed into 24 arcs IS the 15
 * degree lattice; a shaft dashed at the grid pitch IS the 5mm lattice. The
 * cue is not a legend to be learned — it is the lattice itself, drawn on
 * the control it governs, in the place the value will land.
 *
 * A lattice finer than a few pixels is not drawn at all. At that density a
 * dashed line and a solid one look identical, so the marks would stop
 * carrying information while still implying they do — and the one thing a
 * preview of a numeric behaviour must never do is imply a precision it is
 * not showing.
 */
/**
 * Keep the held-modifier state in sync with the keyboard.
 *
 * Bound to keydown AND keyup on the window, plus blur: a modifier released
 * while the window is not focused never sends a keyup, and a widget left
 * showing a lattice that is no longer armed is worse than one that never
 * showed it. Every pointer event carries the same flags, so those refresh
 * it too and the cue cannot drift out of step with the gesture.
 */
function refreshMods(e) {
  const snap = snapHeld(e);
  const vertical = !!(e && e.shiftKey);
  if (snap === mods.snap && vertical === mods.vertical) return;
  mods.snap = snap;
  mods.vertical = vertical;
  gizmo.classList.toggle('mod-snap', snap);
  gizmo.classList.toggle('mod-vertical', vertical);
  refreshHint();
  invalidate();
}

function applySnapLattice() {
  /* Not while the widget is still drawing itself in. Both effects speak
     through stroke-dasharray, so overlapping them would replace the reveal
     with the lattice mid-assembly and the handles would appear already
     subdivided rather than being drawn. The reveal owns the property until
     it is finished. */
  const revealing = summonAt !== 0 && performance.now() - summonAt < SUMMON_MS;
  const armed = mods.snap && !dragging && !revealing;
  for (const entry of gizmoAxes) {
    for (const el of [entry.ring, entry.ringBack]) {
      if (!el) continue;
      if (!armed) {
        if (el.dataset.snapDash) { delete el.dataset.snapDash; el.style.strokeDasharray = ''; }
        continue;
      }
      let length = 0;
      try { length = el.getTotalLength(); } catch { length = 0; }
      // A full turn spans the ring, so one snap step is that fraction of
      // its circumference. The ring is drawn as two arcs, so measure the
      // pair rather than assuming either is half.
      const step = (length * (SNAP.angle / (Math.PI * 2))) * 2;
      if (!(step >= 5)) {
        if (el.dataset.snapDash) { delete el.dataset.snapDash; el.style.strokeDasharray = ''; }
        continue;
      }
      el.dataset.snapDash = '1';
      el.style.strokeDasharray = (step * 0.34).toFixed(2) + ' ' + (step * 0.66).toFixed(2);
      el.style.strokeDashoffset = '';
    }

    const shaft = entry.line;
    if (!shaft) continue;
    if (!armed) {
      if (shaft.dataset.snapDash) { delete shaft.dataset.snapDash; shaft.style.strokeDasharray = ''; }
      continue;
    }
    // The grid pitch in pixels, at the part's own depth — the same
    // conversion the drag itself uses, so the marks land where the value
    // will.
    const perPixel = worldPerPixel(state, canvas);
    const pitch = perPixel > 0 ? SNAP.grid / perPixel : 0;
    if (!(pitch >= 5)) {
      if (shaft.dataset.snapDash) { delete shaft.dataset.snapDash; shaft.style.strokeDasharray = ''; }
      continue;
    }
    shaft.dataset.snapDash = '1';
    shaft.style.strokeDasharray = (pitch * 0.3).toFixed(2) + ' ' + (pitch * 0.7).toFixed(2);
    shaft.style.strokeDashoffset = '';
  }
}

function applyReveal() {
  const elapsed = summonAt ? performance.now() - summonAt : SUMMON_MS;
  const done = elapsed >= SUMMON_MS;

  const strokes = [];
  for (const entry of gizmoAxes) {
    strokes.push({ el: entry.line, owner: entry });
    strokes.push({ el: entry.ring, owner: entry });
    strokes.push({ el: entry.ringBack, owner: entry });
  }
  for (const arc of gizmoArcs) strokes.push({ el: arc.arc, owner: null });

  if (done) {
    // Clear the dash entirely once finished: leaving a dasharray behind
    // would fight the snap-lattice dashes, which use the same property to
    // say something quite different.
    for (const s of strokes) {
      if (!s.el) continue;
      // The snap lattice speaks through the same property, so a stroke it
      // owns is left alone.
      if (s.el.dataset.snapDash) continue;
      s.el.style.strokeDasharray = '';
      s.el.style.strokeDashoffset = '';
    }
    for (const entry of gizmoAxes) {
      for (const el of [entry.head, entry.knob, entry.tag]) {
        if (el) el.style.opacity = '';
      }
    }
    return;
  }

  let longest = 0;
  for (const s of strokes) {
    if (!s.el || !s.el.getTotalLength) continue;
    let length = 0;
    try { length = s.el.getTotalLength(); } catch { length = 0; }
    s.length = length;
    if (length > longest) longest = length;
  }

  for (const s of strokes) {
    if (!s.el || !(s.length > 0)) continue;
    const p = summonProgress(s.length, longest, elapsed);
    s.el.style.strokeDasharray = s.length.toFixed(2);
    s.el.style.strokeDashoffset = (s.length * (1 - p)).toFixed(2);
  }

  for (const entry of gizmoAxes) {
    const shaft = strokes.find((s) => s.el === entry.line);
    const p = shaft ? summonProgress(shaft.length, longest, elapsed) : 1;
    for (const el of [entry.head, entry.knob, entry.tag]) {
      if (el) el.style.opacity = p.toFixed(3);
    }
  }

  invalidate();
}
function invalidate() {
  /* Every state change that repaints is a state change worth remembering;
     one hook here (debounced inside) covers orbit, zoom, pan, selection,
     scene switches and the rail without a call at each site. */
  saveViewState();
  if (frame === null) frame = requestAnimationFrame(draw);
}

/**
 * Is there anything a save would write?
 *
 * The button's meaning and the request's content are now the same
 * computation, so Save cannot be offered for an edit that would send an
 * empty body — which is precisely how a no-op gesture came to report itself
 * as saved.
 */
function dirty() {
  return Object.keys(sessionTweaks()).length > 0;
}

/** Is there anything Reset would undo — measured against the compiled state. */
function edited() {
  return Object.keys(changedAgainst({})).length > 0;
}
function refreshEditButtons() {
  /* Buttons appearing IS a change in chrome geometry.
     Save, Reset, Undo and Redo only exist once there is something to save
     or undo, so the obstacle map measured before the first edit does not
     know about them — and the card would happily place itself underneath
     the Save button the moment it had something to report. Re-measure
     whenever their visibility is recomputed, which is exactly here. */
  invalidateChrome();
  const save = document.getElementById('save');
  save.hidden = !dirty();
  /* Deliberately never disabled. A disabled button is indistinguishable
     from a broken one — it swallows the click and explains nothing. The
     guard against overwriting an earlier session lives in saveEdits, where
     it can retry and then say what went wrong. */
  save.title = tweaksKnown ? '' : 'Saved edits could not be read yet — saving will retry';
  /* Not "are there edit records" — a gesture that changed nothing leaves one
     behind, and a Reset that would visibly do nothing is a button that lies
     about having something to undo. */
  document.getElementById('reset').hidden = !edited();
  /* Compile appears when everything is saved but the geometry does not
     carry it yet — the natural third beat of the loop: edit, Save,
     Compile. While unsaved edits exist it stays hidden (compiling then
     would bake the file, reload the page, and the unsaved layer would be
     gone), so the buttons themselves teach the order. */
  const bake = document.getElementById('bake');
  if (bake && !bake.dataset.busy) {
    bake.hidden = dirty() || !edited() || (!apiBase() && !canHostBridge());
  }
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  undoBtn.hidden = historyAt === 0;
  redoBtn.hidden = historyAt >= history.length;
}

/**
 * Rebuild every draw's transform from its pristine state plus its edit.
 *
 * Rotation and scale are applied about the part's OWN centre, not the world
 * origin. That is the only behaviour that matches what the handle appears
 * to do: a gizmo drawn on the part must turn the part in place, and one
 * that swung it around the world origin would be unusable for anything not
 * already centred there.
 *
 * Composition order is scale, then rotate, then translate — the standard
 * order, and the only one where scaling does not smear a rotated part.
 */
function applyEditsToDraws() {
  if (!renderer) return;
  /* This is the one funnel that moves a part's world bounds, so it is the
     one place the screen-occupancy cache can go stale without the camera
     key noticing. Drop it here rather than trying to detect the change. */
  occupancy = null;
  for (const d of renderer.draws) {
    /* The oriented-box cache follows the model matrix; this is the one
       funnel that rewrites it (see obbOf in the runtime). */
    d._obb = null;
    const e = edits[d.name];
    const t = (e && e.translate) || [0, 0, 0];
    const q = (e && e.quat) || [0, 0, 0, 1];
    const s = (e && e.scale) || [1, 1, 1];
    const base = d.baseModel || (d.baseModel = new Float32Array(d.model));
    // Capture the pristine bounds BEFORE editing them, or the first drag of
    // a part records already-moved bounds as its origin and every later
    // pick is off by that first delta.
    if (!d.baseMin) { d.baseMin = [...d.min]; d.baseMax = [...d.max]; }
    const pivot = [
      (d.baseMin[0] + d.baseMax[0]) / 2,
      (d.baseMin[1] + d.baseMax[1]) / 2,
      (d.baseMin[2] + d.baseMax[2]) / 2,
    ];

    const rotating = q[0] !== 0 || q[1] !== 0 || q[2] !== 0 || q[3] !== 1;
    const scaling = s[0] !== 1 || s[1] !== 1 || s[2] !== 1;
    const model = new Float32Array(base);
    if (rotating || scaling) {
      // world = T(pivot+t) · R · S · T(-pivot) · base
      const m = composeTRS(q, s, pivot, t);
      d.model = mul4(m, model);
    } else {
      model[12] += t[0]; model[13] += t[1]; model[14] += t[2];
      d.model = model;
    }

    // Bounds follow the same transform. Rotating an axis-aligned box gives
    // a box that is no longer axis-aligned, so re-fit an AABB around the
    // eight transformed corners — picking, contacts and the gizmo all read
    // these, and a stale box would make them disagree with what is drawn.
    if (rotating || scaling) {
      const m = composeTRS(q, s, pivot, t);
      let lo = [Infinity, Infinity, Infinity];
      let hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < 8; i++) {
        const p = [
          i & 1 ? d.baseMax[0] : d.baseMin[0],
          i & 2 ? d.baseMax[1] : d.baseMin[1],
          i & 4 ? d.baseMax[2] : d.baseMin[2],
        ];
        const q = [
          m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
          m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
          m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14],
        ];
        for (let a = 0; a < 3; a++) {
          if (q[a] < lo[a]) lo[a] = q[a];
          if (q[a] > hi[a]) hi[a] = q[a];
        }
      }
      d.min = lo; d.max = hi;
    } else {
      d.min = d.baseMin.map((v, i) => v + t[i]);
      d.max = d.baseMax.map((v, i) => v + t[i]);
    }
  }
  applyMatEditsToDraws();
  refreshTipDims();
  invalidate();
}

/**
 * Rebuild every draw's surface from its pristine material plus its edit.
 *
 * The material twin of applyEditsToDraws, and called from it so there is
 * ONE funnel through which any edit reaches the screen — undo, redo, load,
 * reset and the panel's own sliders all flow through the same place.
 * Pristine state is captured lazily per draw the first time this runs
 * (the baseModel pattern), so a cleared edit restores exactly what the GLB
 * shipped, texture and all.
 *
 * An assignment copies its look from a draw already wearing that material —
 * which is what makes the preview honest for textured materials: the
 * actual texture comes along, not a flat average of it. Only a material
 * no draw uses falls back to the census facts.
 */
function applyMatEditsToDraws() {
  if (!renderer) return;
  const mats = (currentEntry && currentEntry.mats) || {};
  const baseOf = (d) => d.baseMat || (d.baseMat = {
    color: [...d.color],
    metallic: d.metallic,
    rough: d.rough,
    emissive: [...(d.emissive || [0, 0, 0])],
    tex: d.tex,
    mrTex: d.mrTex || null,
    emTex: d.emTex || null,
    blend: !!d.blend,
    matName: d.matName || null,
  });
  for (const d of renderer.draws) baseOf(d);
  for (const d of renderer.draws) {
    const base = d.baseMat;
    const m = edits[d.name] && edits[d.name].material;
    let color = [...base.color];
    let metallic = base.metallic;
    let rough = base.rough;
    let emissive = [...base.emissive];
    let tex = base.tex;
    let mrTex = base.mrTex;
    let emTex = base.emTex;
    let blend = base.blend;
    /* The reference material: what un-overridden properties inherit from.
       The assigned material when there is one, the part's own otherwise. */
    let refFacts = mats[(m && m.assign) || base.matName] || null;
    if (m && m.assign) {
      const exemplar = renderer.draws.find((o) => o.baseMat.matName === m.assign);
      if (exemplar) {
        const bm = exemplar.baseMat;
        color = [...bm.color];
        metallic = bm.metallic;
        rough = bm.rough;
        emissive = [...bm.emissive];
        tex = bm.tex;
        mrTex = bm.mrTex;
        emTex = bm.emTex;
        blend = bm.blend;
      } else if (refFacts) {
        color = [
          refFacts.c ? refFacts.c[0] : 0.8,
          refFacts.c ? refFacts.c[1] : 0.8,
          refFacts.c ? refFacts.c[2] : 0.8,
          refFacts.a !== undefined ? refFacts.a : 1,
        ];
        metallic = refFacts.m !== undefined ? refFacts.m : 0;
        rough = refFacts.r !== undefined ? refFacts.r : 0.6;
        emissive = refFacts.e
          ? refFacts.e.map((v) => v * (refFacts.s !== undefined ? refFacts.s : 1))
          : [0, 0, 0];
        tex = null;
        mrTex = null;
        emTex = null;
        blend = refFacts.a !== undefined;
      }
    }
    /* Override semantics, shared with the compile-side runner so the
       preview never promises what the bake will not deliver: a scalar
       override on a mapped channel GATES that channel's map off ("make it
       this value"), while a colour override on a textured surface stays a
       TINT that multiplies the map. */
    let mrGate = mrTex ? [1, 1] : [0, 0];
    if (m) {
      if (m.baseColor) color = [m.baseColor[0], m.baseColor[1], m.baseColor[2], color[3]];
      if (m.metallic !== undefined) { metallic = m.metallic; mrGate = [mrGate[0], 0]; }
      if (m.roughness !== undefined) { rough = m.roughness; mrGate = [0, mrGate[1]]; }
      if (m.emission || m.emissionStrength !== undefined) {
        const ec = m.emission || (refFacts && refFacts.e) || [0, 0, 0];
        const es = m.emissionStrength !== undefined
          ? m.emissionStrength
          : (refFacts && refFacts.s !== undefined ? refFacts.s : 1);
        emissive = [ec[0] * es, ec[1] * es, ec[2] * es];
        emTex = null;
      }
      if (m.alpha !== undefined) {
        color[3] = m.alpha;
        blend = m.alpha < 0.999;
      }
    }
    d.color = color;
    d.metallic = metallic;
    d.rough = rough;
    d.emissive = emissive;
    d.tex = tex;
    d.mrTex = mrTex;
    d.mrGate = mrGate;
    d.emTex = emTex;
    d.blend = blend;
  }
  invalidate();
}

/** Column-major 4x4 multiply, a then b applied as b·a. */
function mul4(b, a) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        b[r] * a[c * 4] + b[4 + r] * a[c * 4 + 1] + b[8 + r] * a[c * 4 + 2] + b[12 + r] * a[c * 4 + 3];
    }
  }
  return o;
}

/** T(pivot+t) · R(q) · S(s) · T(-pivot), column-major. */
function composeTRS(q, s, pivot, t) {
  const m = qMatrix(q);
  const a = [
    m[0] * s[0], m[1] * s[0], m[2] * s[0], 0,
    m[3] * s[1], m[4] * s[1], m[5] * s[1], 0,
    m[6] * s[2], m[7] * s[2], m[8] * s[2], 0,
    0, 0, 0, 1,
  ];
  // Fold the pivot round-trip into the translation column.
  a[12] = pivot[0] + t[0] - (a[0] * pivot[0] + a[4] * pivot[1] + a[8] * pivot[2]);
  a[13] = pivot[1] + t[1] - (a[1] * pivot[0] + a[5] * pivot[1] + a[9] * pivot[2]);
  a[14] = pivot[2] + t[2] - (a[2] * pivot[0] + a[6] * pivot[1] + a[10] * pivot[2]);
  return new Float32Array(a);
}

/*
 * Where to write tweaks back.
 *
 * This page cannot know how its host mounted it. It may be served straight
 * off the daemon, proxied through the web app, or injected into an iframe
 * whose document URL is nothing like its own path — and each of those
 * resolves a URL differently. Guessing one and failing is what left saving
 * broken: the page picked a base, the fetch threw, and the only symptom was
 * a button that said it could not read.
 *
 * So it does not guess. It builds every base that could plausibly be right,
 * ordered most-specific first, and the first one that actually answers wins
 * and is remembered for the rest of the session. The mesh already proves a
 * request can leave this document; this makes the API use the same routes
 * the mesh does, including resolution relative to the document's own base,
 * which is the case a root-relative URL gets wrong inside an iframe.
 */
let apiBaseResolved = null;

function apiBaseCandidates() {
  const out = [];
  const push = (v) => { if (v && out.indexOf(v) < 0) out.push(v); };

  // What the writer baked in, resolved against this document's real base
  // rather than assumed to be root-relative.
  if (KIT.apiBase) {
    push(KIT.apiBase);
    try { push(new URL(KIT.apiBase, document.baseURI).href); } catch (_) {}
    // Same path against the parent's origin, for a document whose own base
    // is opaque (blob:, data:, srcdoc) but which still shares the origin.
    try {
      if (location.origin && location.origin !== 'null') {
        push(new URL(KIT.apiBase, location.origin).href);
      }
    } catch (_) {}
  }

  // Read it out of our own location, the way the page originally did.
  const m = location.pathname.match(/^(.*\/api\/projects\/[^/]+)\/files\//);
  if (m) push(m[1]);

  // Relative to the document base: kit.html sits at the project root under
  // .../files/, so the API is two segments up. This is the same resolution
  // that already works for the mesh, which is the strongest evidence any
  // request can succeed at all.
  try {
    const here = new URL(document.baseURI);
    const at = here.pathname.indexOf('/files/');
    if (at >= 0) push(here.origin + here.pathname.slice(0, at));
  } catch (_) {}

  return out;
}

/** The base that last answered, or null until one has. */
function apiBase() {
  return apiBaseResolved || apiBaseCandidates()[0] || null;
}

/* ---- host tweaks bridge --------------------------------------------
   Inside the Open Design host this page is mounted as a sandboxed srcdoc
   document with an opaque origin, and the daemon's origin guard rejects
   API calls from Origin: null by design. The host therefore proxies the
   tweaks read and write over postMessage: the page asks, the HOST makes
   the API call from the app origin, and posts the result back keyed by
   requestId. Direct fetch stays as the path for a page opened straight
   from the daemon. Message shapes are pinned in
   packages/contracts/src/api/scene3d.ts (Scene3dTweaksRequestMessage). */
let hostTweaksSeq = 0;
const hostTweaksWaiters = new Map();
window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const d = e.data;
  if (!d || d.type !== 'od:scene3d-tweaks-result' || typeof d.requestId !== 'string') return;
  const settle = hostTweaksWaiters.get(d.requestId);
  if (!settle) return;
  hostTweaksWaiters.delete(d.requestId);
  settle(d);
});
function canHostBridge() {
  try { return Boolean(window.parent) && window.parent !== window; } catch (_) { return false; }
}
/* An opaque origin cannot fetch ANY http base, so when the document is
   srcdoc-mounted the bridge is the first choice rather than the fallback —
   every direct attempt would only add console noise before failing. */
function preferHostBridge() {
  return canHostBridge() && (!location.origin || location.origin === 'null');
}
function hostTweaksRequest(op, payload) {
  return new Promise((resolve, reject) => {
    if (!canHostBridge()) { reject(new Error('no host to bridge through')); return; }
    const requestId = 'twk-' + (++hostTweaksSeq);
    /* A compile answers when Blender finishes, which is minutes on a
       heavy scene — the file-op timeout would declare the host dead
       mid-bake and the button would report failure for a compile that
       lands seconds later. */
    const timeoutMs = op === 'compile' ? 600000 : 5000;
    const timer = setTimeout(() => {
      hostTweaksWaiters.delete(requestId);
      reject(new Error('host did not answer'));
    }, timeoutMs);
    hostTweaksWaiters.set(requestId, (d) => {
      clearTimeout(timer);
      if (d.ok) resolve(d);
      else reject(new Error(typeof d.error === 'string' && d.error ? d.error : 'host bridge error'));
    });
    const msg = { type: 'od:scene3d-tweaks', op: op, requestId: requestId };
    for (const key of Object.keys(payload || {})) msg[key] = payload[key];
    window.parent.postMessage(msg, '*');
  });
}

/** Say something on the button and put it back afterwards. */
function flashButton(btn, message, ms) {
  btn.dataset.restore = btn.dataset.restore || btn.textContent;
  btn.textContent = message;
  clearTimeout(btn._flash);
  btn._flash = setTimeout(() => {
    btn.textContent = btn.dataset.restore;
    delete btn.dataset.restore;
  }, ms || 2600);
}

/* Tweaks already on disk when this asset was opened.
   They are ALREADY baked into the GLB the browser loaded — Blender applied
   them during the build — so they must never be applied to the draws again.
   They exist only so that saving writes the whole truth: without them, a
   save would send this session's deltas alone and the route's whole-file
   write would erase every nudge made in an earlier session. */
let bakedTweaks = {};
/* False while we do not know what is on disk. Saving in that state would
   write a partial file over a complete one, so the button stays disabled
   rather than offering an action that destroys work. */
let tweaksKnown = false;
let tweaksError = null;

/** Everything that should be on disk: earlier sessions plus this one. */
/**
 * Just this session's deltas, in the shape the daemon merges.
 *
 * No knowledge of what is on disk, by design — the daemon composes. Identity
 * entries are dropped so a part that was clicked and put back is not sent.
 */
/**
 * Is this transform a change, or the identity dressed up as one?
 *
 * THE one answer to that question. It used to have two: the dirty test
 * compared the edits object structurally, while the save filter compared
 * each channel against the identity, and they disagreed the moment a
 * gesture merely TOUCHED a part. Dragging creates an edit record of
 * translate 0, quat identity, scale 1 — a new key
 * in the object and no change at all in the world.
 *
 * The consequence was the worst kind of bug. Save appeared, the user
 * pressed it, the request went out carrying nothing, the daemon wrote
 * nothing and answered 200, and the button hid itself — an edit reported as
 * saved that had never existed. Anyone who then reloaded and found their
 * work missing would conclude that saving was broken, when in fact the
 * button should never have been offered.
 *
 * Tolerances live here too, so "too small to save" and "too small to count
 * as unsaved" cannot drift apart: a micrometre is not a move, and a
 * quaternion a rounding error away from identity is not a turn.
 */
function transformDelta(current, previous) {
  const prev = previous || {};
  const pt = prev.translate || [0, 0, 0];
  const pq = prev.quat || [0, 0, 0, 1];
  const ps = prev.scale || [1, 1, 1];
  const ct = (current && current.translate) || [0, 0, 0];
  const cq = (current && current.quat) || [0, 0, 0, 1];
  const cs = (current && current.scale) || [1, 1, 1];

  const translate = [0, 1, 2].map((i) => ct[i] - pt[i]);
  // current = delta * previous  =>  delta = current * inverse(previous).
  // For a unit quaternion the inverse is its conjugate.
  const quat = qNorm(qMul(cq, [-pq[0], -pq[1], -pq[2], pq[3]]));
  const scale = [0, 1, 2].map((i) => (ps[i] === 0 ? cs[i] : cs[i] / ps[i]));

  const moved = translate.some((n) => Math.abs(n) > 1e-6);
  const turned = !(Math.abs(quat[0]) < 1e-9 && Math.abs(quat[1]) < 1e-9 &&
    Math.abs(quat[2]) < 1e-9 && Math.abs(Math.abs(quat[3]) - 1) < 1e-9);
  const resized = scale.some((n) => Math.abs(n - 1) > 1e-9);
  return {
    translate: translate,
    quat: quat,
    scale: scale,
    moved: moved,
    turned: turned,
    resized: resized,
    changed: moved || turned || resized,
  };
}

/** Every part whose transform or material differs from the given baseline. */
function changedAgainst(baseline) {
  const out = {};
  for (const [name, value] of Object.entries(edits)) {
    const d = transformDelta(value, baseline[name]);
    const baseMat = (baseline[name] || {}).material;
    const matChanged = !matEq(value.material, baseMat);
    if (!d.changed && !matChanged) continue;
    out[name] = {};
    if (d.moved) out[name].translate = d.translate;
    if (d.turned) out[name].quat = d.quat;
    if (d.resized) out[name].scale = d.scale;
    /* Absolute state travels whole: the daemon replaces the saved material
       with exactly this object, and an EMPTY object is the explicit "back
       to what the source authored" — the only way "clear my override" can
       reach a file this page never reads. */
    if (matChanged) {
      out[name].material = value.material && Object.keys(value.material).length > 0
        ? JSON.parse(JSON.stringify(value.material))
        : {};
    }
  }
  return out;
}

function sessionTweaks() {
  /* The delta since the LAST successful save, not since load. Sending the
     full session delta every time would re-apply everything already written
     on the second save — the part would move twice as far, turn twice as
     much, and scale by the square. savedAtLoad is the record of what the
     daemon already has. */
  return changedAgainst(savedAtLoad);
}

function mergedTweaks() {
  /* Every channel composes, and each by its OWN operation.
     Translation adds, rotation multiplies as a quaternion, scale multiplies
     per axis — they are different algebras and treating them alike is
     wrong in a different way for each. An earlier version merged only
     translation, which meant a save silently discarded the rotation and
     scale the user had just made AND erased any that were already on disk:
     precisely the data loss this merge exists to prevent, reintroduced the
     moment two new channels appeared. */
  const ident = () => ({ translate: [0, 0, 0], quat: [0, 0, 0, 1], scale: [1, 1, 1] });
  const read = (v) => ({
    // Defensive: a tweak written by an older viewer, or one carrying only a
    // rotation, has no translate array at all.
    translate: [...(v.translate || [0, 0, 0])],
    quat: [...(v.quat || [0, 0, 0, 1])],
    scale: [...(v.scale || [1, 1, 1])],
  });

  const out = {};
  for (const [name, v] of Object.entries(bakedTweaks)) {
    out[name] = read(v);
    if (v.material && Object.keys(v.material).length > 0) {
      out[name].material = JSON.parse(JSON.stringify(v.material));
    }
  }
  for (const [name, v] of Object.entries(edits)) {
    const base = out[name] || ident();
    const e = read(v);
    out[name] = {
      translate: [0, 1, 2].map((i) => base.translate[i] + e.translate[i]),
      // Session delta applied ON TOP of what is already baked, same order
      // the runner uses when it replays them.
      quat: qNorm(qMul(e.quat, base.quat)),
      scale: [0, 1, 2].map((i) => base.scale[i] * e.scale[i]),
    };
    /* Material is absolute, so it does not compose: the session's state
       replaces the saved one when the session touched it (an empty session
       object means "cleared"), and the saved one rides along untouched
       when it did not. */
    const mat = v.material !== undefined ? v.material : base.material;
    if (mat && Object.keys(mat).length > 0) {
      out[name].material = JSON.parse(JSON.stringify(mat));
    }
  }

  /* Drop an entry only when EVERY channel is identity. Checking translation
     alone deleted parts that had been rotated or resized in place. */
  for (const [name, v] of Object.entries(out)) {
    const still = v.translate.every((n) => Math.abs(n) < 1e-6);
    const unturned = Math.abs(v.quat[0]) < 1e-9 && Math.abs(v.quat[1]) < 1e-9 &&
      Math.abs(v.quat[2]) < 1e-9 && Math.abs(Math.abs(v.quat[3]) - 1) < 1e-9;
    const unsized = v.scale.every((n) => Math.abs(n - 1) < 1e-9);
    if (still && unturned && unsized && !v.material) delete out[name];
  }
  return out;
}

/** Load what is already saved, so this session can add to it rather than
    replace it. Failure is non-fatal but must disable saving: writing
    without knowing the prior state is exactly the data loss we are
    preventing. */
async function loadBakedTweaks(entry) {
  bakedTweaks = {};
  tweaksKnown = false;
  const candidates = apiBaseCandidates();
  if (candidates.length === 0 && !canHostBridge()) { tweaksKnown = true; return; }
  const q = entry.scenePath ? '?scenePath=' + encodeURIComponent(entry.scenePath) : '';
  const bridgePayload = entry.scenePath ? { scenePath: entry.scenePath } : {};
  try {
    let data = null;
    if (preferHostBridge()) {
      data = await hostTweaksRequest('load', bridgePayload);
    } else {
      try {
        /* Try each candidate base until one answers, then keep it.
           A base that throws is not an error to report — it is one of several
           guesses about how this document was mounted, and only the last
           failure is worth telling the user about. */
        let resp = null;
        let lastError = null;
        for (const base of candidates) {
          try {
            const attempt = await fetch(base + '/scene3d/tweaks' + q);
            if (!attempt.ok) { lastError = new Error('HTTP ' + attempt.status); continue; }
            apiBaseResolved = base;
            resp = attempt;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!resp) throw lastError || new Error('no reachable API base');
        data = await resp.json();
      } catch (fetchErr) {
        /* A hosted page whose direct fetch failed still has the bridge. */
        if (!canHostBridge()) throw fetchErr;
        data = await hostTweaksRequest('load', bridgePayload);
      }
    }
    // A newer selection can supersede this load while its fetch is in flight.
    // Its result — and the shared edits / savedAtLoad that applyUnbakedTweaks
    // seeds from it — belong to the entry that is current NOW, not the one
    // this call started for. Without this guard a slow load for asset A
    // applies A's deltas over asset B, worst when part names collide.
    if (entry !== currentEntry) return;
    bakedTweaks = data && data.tweaks ? data.tweaks : {};
    tweaksKnown = true;
    tweaksError = null;
    applyUnbakedTweaks(entry);
  } catch (err) {
    // Same staleness guard on the failure path: a superseded load must not
    // stamp its error (or tweaksKnown state) onto the current selection.
    if (entry !== currentEntry) return;
    tweaksKnown = false;
    /* Keep WHY. "Cannot read saved edits" is the same sentence whether the
       daemon is down, the response was a 403, or the document has no
       network access at all — and those need completely different fixes.
       Swallowing the reason is what turned this into repeated guesswork. */
    tweaksError = (err && err.message) || String(err);
  }
  refreshEditButtons();
}

/**
 * Show the edits that are saved but have not reached the mesh yet.
 *
 * The saved-edits file is the cumulative record of every edit; the build
 * bakes it into the geometry on the NEXT compile. Between a save and that
 * compile the two disagree, and the viewer used to resolve the
 * disagreement by assuming everything on disk was already baked.
 *
 * Right after a save that assumption is exactly wrong, and the result was
 * the single most damaging bug in this feature: move a part, save it,
 * reopen the page, and it sat back at its original position with no unsaved
 * marker and nothing to press. The edit was on disk the whole time. It just
 * could not be seen, which is indistinguishable from having been lost.
 *
 * The manifest now records what each build actually baked, so the
 * difference is computed rather than assumed. Anything in the file and not
 * in the build is applied here as a local edit — which is precisely what it
 * is: a change the geometry does not carry yet.
 */
function applyUnbakedTweaks(entry) {
  const inBuild = (entry && entry.bakedTweaks) || {};
  let applied = 0;
  for (const [name, saved] of Object.entries(bakedTweaks || {})) {
    const built = inBuild[name];
    const delta = transformDelta(saved, built);
    const matUnbaked = !matEq(saved.material, built && built.material);
    if (!delta.changed && !matUnbaked) continue;
    const e = editFor(name);
    if (delta.moved) for (let i = 0; i < 3; i++) e.translate[i] += delta.translate[i];
    if (delta.turned) e.quat = qNorm(qMul(delta.quat, e.quat));
    if (delta.resized) for (let i = 0; i < 3; i++) e.scale[i] *= delta.scale[i];
    /* A saved material the build has not baked yet is shown the same way a
       saved move is: as a local edit, because that is exactly what it is —
       a change the geometry does not carry yet. */
    if (matUnbaked && saved.material && Object.keys(saved.material).length > 0) {
      e.material = JSON.parse(JSON.stringify(saved.material));
    }
    applied += 1;
  }
  if (applied === 0) return;
  /* Baseline for the NEXT save. These edits are already on disk, so the
     delta this session sends must be measured from them — otherwise the
     first save after a reopen would write them a second time and the part
     would move twice as far. */
  savedAtLoad = JSON.parse(JSON.stringify(edits));
  applyEditsToDraws();
  refreshEditButtons();
  updateTip();
  invalidate();
}

async function saveEdits() {
  const btn = document.getElementById('save');
  const base = apiBase();
  /* Every way this can fail now says so on the button.
     A save that quietly returns is worse than one that errors: the user
     has no way to tell "it worked" from "nothing happened", and will keep
     editing on top of work that was never written. */
  if (!base && !canHostBridge()) {
    flashButton(btn, 'Open from the project to save');
    return;
  }
  if (!currentEntry) {
    flashButton(btn, 'No asset selected');
    return;
  }
  /* Send only what THIS session changed, and let the daemon compose it
     with whatever is already on disk.
     Saving no longer depends on having read the file first. That
     dependency is what made this fail outright: if the read could not
     reach the daemon from wherever the host mounted this page, the write
     was never even attempted, and the only symptom was a button saying it
     could not read. The daemon owns the file, so the daemon merges — and a
     client that never sees the prior state also cannot destroy it. */
  const scenePath = currentEntry.scenePath || null;
  const body = { tweaks: sessionTweaks(), merge: true };
  if (scenePath) body.scenePath = scenePath;
  btn.textContent = 'Saving…';
  try {
    if (preferHostBridge()) {
      await hostTweaksRequest('save', body);
    } else {
      try {
        /* The write tries the same candidate bases as the read, starting with
           whichever one already answered. Pinning the write to a single guessed
           base is how a save could fail even though the API was plainly
           reachable a moment earlier. */
        let resp = null;
        let lastError = null;
        const bases = apiBaseResolved
          ? [apiBaseResolved].concat(apiBaseCandidates().filter((b) => b !== apiBaseResolved))
          : apiBaseCandidates();
        for (const candidate of bases) {
          try {
            const attempt = await fetch(candidate + '/scene3d/tweaks', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!attempt.ok) { lastError = new Error('HTTP ' + attempt.status); continue; }
            apiBaseResolved = candidate;
            resp = attempt;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!resp) throw lastError || new Error('no reachable API base');
      } catch (fetchErr) {
        if (!canHostBridge()) throw fetchErr;
        await hostTweaksRequest('save', body);
      }
    }
    // The edits map stays exactly as it is: it is what positions the draws,
    // and
    // clearing it would snap the model visually back to the GLB. Marking it
    // clean is enough, and mergedTweaks() stays correct on a second save
    // because bakedTweaks is likewise untouched.
    savedAtLoad = JSON.parse(JSON.stringify(edits));
    /* The card carries the same status the button does, so it has to be
       told too. Without this it went on reading "unsaved" beside a button
       that had just said "Saved" — and of the two, the one attached to the
       part is the one a person believes. */
    refreshEditNote();
    /* The saved-edits record is what a reopen reads back. Keeping it in
       step here means closing and reopening the asset without a reload
       shows the same state as a full page load. */
    bakedTweaks = mergedTweaks();
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Save changes'; refreshEditButtons(); }, 1200);
  } catch (err) {
    // The status code is the difference between "not signed in" and "the
    // daemon is gone", and the user can act on that distinction.
    btn.textContent = 'Save failed (' + (err.message || 'error') + ') — retry';
  }
}

/**
 * Bake the saved tweaks: ask for a compile of this scene.
 *
 * The fourth wall of the edit loop. Save writes tweaks.json; only a
 * compile makes them geometry, and until this button the viewer could ask
 * for the first but not the second — a restyle that said "the next
 * compile bakes them" with no way to cause one. The request rides the
 * same host bridge as save (direct fetch first where the page has an
 * origin). The refreshed artifacts come back through the host's normal
 * file-change reload; this page does not try to hot-swap itself.
 */
let baking = false;
async function bakeScene() {
  if (baking) return;
  const btn = document.getElementById('bake');
  if (dirty()) { flashButton(btn, 'Save first'); return; }
  baking = true;
  btn.dataset.busy = '1';
  btn.textContent = 'Compiling…';
  const body = currentEntry && currentEntry.scenePath
    ? { scenePath: currentEntry.scenePath }
    : {};
  try {
    if (preferHostBridge()) {
      await hostTweaksRequest('compile', body);
    } else {
      try {
        let resp = null;
        let lastError = null;
        const bases = apiBaseResolved
          ? [apiBaseResolved].concat(apiBaseCandidates().filter((b) => b !== apiBaseResolved))
          : apiBaseCandidates();
        for (const candidate of bases) {
          try {
            const attempt = await fetch(candidate + '/scene3d/compile', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (attempt.status === 409) throw new Error('a compile is already running');
            if (!attempt.ok) { lastError = new Error('HTTP ' + attempt.status); continue; }
            apiBaseResolved = candidate;
            resp = attempt;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!resp) throw lastError || new Error('no reachable API base');
      } catch (fetchErr) {
        if (!canHostBridge()) throw fetchErr;
        await hostTweaksRequest('compile', body);
      }
    }
    /* The host reloads this page with the fresh artifacts; if it does not
       (same-origin mount), the label says the bake landed. */
    btn.textContent = 'Compiled ✓';
    setTimeout(() => {
      delete btn.dataset.busy;
      btn.textContent = 'Compile';
      refreshEditButtons();
    }, 2500);
  } catch (err) {
    delete btn.dataset.busy;
    btn.textContent = 'Compile failed (' + ((err && err.message) || 'error') + ') — retry';
  }
  baking = false;
}

/**
 * Selection is a set, and the mode argument decides how a pick folds into
 * it: 'replace' (plain click), 'add' (shift-click, toggles), or 'set' for
 * programmatic multi-selects like "select touching".
 */
/**
 * The bottom bar: what the keys do, or what the held modifier is about to do.
 *
 * Two hints, one at a time. The full instruction list read as a yap fest and
 * most of it only applies once something is selected — so the idle bar
 * teaches navigation, and the edit verbs appear when they act.
 *
 * While a modifier is held the bar stops listing what is POSSIBLE and says
 * what this gesture WILL do. A list of options is the wrong answer to "what
 * happens if I drag now".
 *
 * It also used to be wrong. It advertised shift as the snap modifier while
 * every snap in the editor is on ctrl, so the one line whose whole job is to
 * tell you which key to hold named the wrong key.
 */
/**
 * The tool the gesture would (or does) use right now: the live drag's tool if
 * one is running, otherwise the handle currently under the cursor (the gizmo
 * wears a mode- class while a handle is hovered). Null when a part is selected
 * but nothing is hovered — the default body-drag is a free move.
 */
function activeTool() {
  if (dragging) return dragging.tool;
  const cl = gizmo.classList;
  if (cl.contains('mode-rotate')) return TOOL.ROTATE;
  if (cl.contains('mode-scale')) return TOOL.SCALE;
  if (cl.contains('mode-move')) return TOOL.MOVE;
  if (cl.contains('mode-trackball') || cl.contains('mode-free')) return TOOL.FREE;
  return null;
}

/**
 * Paint the two modifier chips from live state: which key does what for the
 * tool in hand, and whether it is held right now. Snap names the real
 * increment (15 degrees / 10 percent / 5 mm) so the reader never has to
 * remember it; shift names its per-tool effect and hides for rotate, where it
 * does nothing. Shown only with a selection — the modifiers are gizmo keys.
 */
function refreshModChips() {
  const box = document.getElementById('mods');
  if (!box) return;
  const sel = state.selection.size > 0;
  const tool = activeTool();
  // Only while a handle is hovered or a drag is live, and never for the free
  // trackball (which honours no modifier). The chips answer "what will
  // ctrl/shift do to THIS tool" — with no tool in play, or a tool that ignores
  // both keys, there is nothing truthful for them to say, so a resting
  // selection whose pointer is nowhere near the gizmo shows no chips rather
  // than a speculative 5mm/vertical.
  const relevant = tool && tool !== TOOL.TRACKBALL;
  box.classList.toggle('off', !sel || !relevant);
  if (!sel || !relevant) return;
  const snap = document.getElementById('modSnap');
  // The chip names the STEP ctrl snaps to — the grid, the angle lattice, the
  // ratio set — not the current distance (that lives in the readout, and
  // doubling it here was just noise). The green ring says it has caught.
  snap.querySelector('.mtext').textContent =
    tool === TOOL.ROTATE ? '15°' : tool === TOOL.SCALE ? 'ratios' : '5mm';
  snap.classList.toggle('on', mods.snap);
  snap.classList.toggle('latched', mods.snap && ctrlLatched);
  const shift = document.getElementById('modShift');
  // Shift is inert while rotating — do not offer a key that does nothing.
  shift.hidden = tool === TOOL.ROTATE;
  if (!shift.hidden) {
    // The effect word stays put; the specific alignment it caught ("flush →
    // crate_02") is named in the readout, and the ring here says it landed.
    shift.querySelector('.mtext').textContent =
      tool === TOOL.SCALE ? 'uniform' : tool === TOOL.MOVE ? 'contact' : 'vertical';
    shift.classList.toggle('on', mods.vertical);
    shift.classList.toggle('latched', mods.vertical && shiftLatched);
  }
}

function refreshHint() {
  refreshModChips();
  const el = document.getElementById('hint');
  if (!el) return;
  const selected = state.selection.size > 0;
  // The ctrl / shift teaching now lives in the lit chips beside the readout,
  // so the hint stops spending its width on the modifiers and just lists the
  // handles and plain keys — the keys explain themselves on the chips.
  el.innerHTML = selected
    ? '<b>arrows</b> move · <b>ring</b> turn · <b>square</b> size · <b>A</b> all touching · <b>esc</b> done'
    : '<b>Drag</b> orbit · <b>scroll</b> zoom · <b>space</b>/<b>right-drag</b> pan · <b>click</b> a part · <b>X</b> x-ray';
}

function selectPart(name, mode) {
  /* Pinned: the card never leaves. A deselect — void click, Escape — is
     ignored while something is selected; switching PARTS stays allowed
     (that is the point of pinning: keep the card, walk the parts). An
     entry switch passes mode 'force' because its parts stop existing. */
  if (name === null && mode !== 'force' && tipPinned && state.selection.size > 0) {
    return;
  }
  // Captured before the mutation so a fresh REPLACE (a new base selection) can
  // re-run the widget's reveal, while a GROW (shift-click add) leaves it be.
  const prevSel = [...state.selection].sort().join('|');
  if (name === null) state.selection.clear();
  else if (Array.isArray(name)) {
    /* A prototype row selects every instance at once. In add mode the
       whole group toggles as one unit — half-adding a rivet ring is
       never what a shift-click on its row meant. */
    if (mode === 'add') {
      const allIn = name.every((n) => state.selection.has(n));
      for (const n of name) {
        if (allIn) state.selection.delete(n);
        else state.selection.add(n);
      }
    } else {
      state.selection = new Set(name);
    }
  } else if (mode === 'add') {
    if (state.selection.has(name)) state.selection.delete(name);
    else state.selection.add(name);
  } else {
    state.selection = new Set([name]);
  }

  // Replace-clicking a new part is a FRESH selection and should extend the
  // widget from the centre again; only a grow (shift-click add) keeps the
  // running reveal so a series of adds does not restart it under the cursor.
  // buildGizmo only reset summonAt when the selection EMPTIED, which silently
  // skipped the reveal on an A -> B replace; resetting here covers it, and
  // buildGizmo re-summons on its next pass.
  if (mode !== 'add' && name !== null &&
      [...state.selection].sort().join('|') !== prevSel) {
    summonAt = 0;
  }

  // A new selection ends the previous gesture's grace period — typing a
  // number should never land on geometry the user has since moved on from.
  endGesture();

  /* The material panel is depth WITHIN one part; a new selection surfaces
     back to the card, because the panel would otherwise silently start
     describing (and editing) a different part than it was opened on.
     PINNED inverts that: the depth is what the user asked to keep, so a
     part switch re-targets the open panel (or gallery) at the new
     selection instead of collapsing — the expected feel of a pinned
     inspector. An emptied selection still closes it (entry switch). */
  if (tipMat) {
    if (tipPinned && state.selection.size > 0) buildMatPanel();
    else setTipMat(null);
  }

  /* The in-world label already names a single selection, so the floating
     chip only earns its place when it says something the label cannot:
     how many parts are in a multi-selection. */
  const picked = [...state.selection];
  document.getElementById('part').textContent = picked.length > 1 ? picked.length + ' parts' : '';
  /* Two hints, one at a time. The full instruction list read as a yap fest
     and most of it only applies once something is selected — so the idle
     bar teaches navigation, and the edit verbs appear when they act. */
  refreshHint();
  syncTreeSelection();
  updateTip();
  invalidate();

  broadcastSelection();
}

/**
 * Tell the host what is selected, and what there is to select.
 *
 * The message carries the WHOLE part inventory rather than only the
 * selection. A host that wants to offer parts for completion — so someone
 * can write "@prp_crate_lid make this brass" — needs the list before
 * anything has been clicked, and folding it into every message means there
 * is one shape to handle instead of a load event and a selection event
 * whose arrival order the host has to reason about. It is a few names per
 * part against a round trip it removes entirely.
 *
 * Prim paths travel with the names because they are the identifier the
 * exported stage actually uses. A name is what a person says; a path is
 * what addresses the thing.
 */
function broadcastSelection() {
  const picked = [...state.selection];
  /*
   * The inventory is what is LOADED, enriched by the manifest — not the
   * manifest alone.
   *
   * The parts a host can meaningfully offer are the ones on screen, because
   * those are the ones a person can click and an agent can be pointed at.
   * The manifest's tree carries the prim path and the census type, which the
   * GLB does not, so it enriches each entry; but reading the inventory FROM
   * the tree made it empty for any asset whose manifest had not supplied one,
   * which is silently the wrong answer rather than a degraded one.
   */
  const tree = (currentEntry && currentEntry.tree) || [];
  const paths = primPaths(tree);
  const meta = new Map(tree.map((node) => [node.n, node]));
  const draws = renderer ? renderer.draws : [];
  const parts = [];
  const seen = new Set();
  for (const draw of draws) {
    if (seen.has(draw.name)) continue;
    seen.add(draw.name);
    const node = meta.get(draw.name);
    parts.push({
      name: draw.name,
      path: paths.get(draw.name) || ('/' + draw.name),
      type: (node && node.t) || 'MESH',
    });
  }
  /* Everything else the manifest knows about — cameras, lights, empties.
     They carry no geometry, so they are not in the draw list, but they are
     real prims in the exported stage and worth being able to name. */
  for (const node of tree) {
    if (seen.has(node.n)) continue;
    seen.add(node.n);
    parts.push({
      name: node.n,
      path: paths.get(node.n) || ('/' + node.n),
      type: node.t || 'EMPTY',
    });
  }
  const message = {
    type: 'od:scene3d-select',
    partId: picked.length === 1 ? picked[0] : null,
    partIds: picked,
    scenePath: currentEntry ? currentEntry.scenePath || null : null,
    asset: currentEntry ? currentEntry.name : null,
    parts: parts,
  };
  try { window.parent.postMessage(message, '*'); } catch (_) {}
  document.dispatchEvent(new CustomEvent('od:scene3d-select', { detail: message }));
}

/**
 * The in-world label.
 *
 * Fresh assets are the normal case here — every scene the agent builds is
 * unfamiliar geometry with unfamiliar part names. Rather than a permanent
 * inspector panel, the name, size, and immediate neighbours appear pinned
 * to whatever you touched, and disappear when you let go of it. Neighbour
 * chips are clickable so the model itself becomes the navigation.
 */
/* Parts the last compile raised something against, and where we are in
   that list. Cycling rather than jumping to the first every time is what
   makes a scene with several problems walkable. */
let faultedParts = [];
let faultedAt = -1;
const tip = document.getElementById('tip');
const tipLead = document.getElementById('leadLine');
const tipLeadDot = document.getElementById('leadDot');
let tipAnchor = null;
let tipSize = { w: 170, h: 120 };

/*
 * Card and handle visibility, held across selections.
 *
 * Deliberately not per-card state. Someone who hid the handles to look at a
 * part wants them to stay hidden while they click through its neighbours —
 * having to hide them again on every selection would make the control worse
 * than useless. The same goes for a collapsed card.
 */
let gizmoHidden = false;
let tipFolded = false;
/* Pinned: the card never leaves. Deselects are ignored while something is
   selected, and switching parts keeps whatever depth the card was at —
   the panel or gallery re-targets the new part. Held across selections
   like the other two, for the same reason. */
let tipPinned = false;

/** Engage or release the pin, keeping the button honest about it. */
function setTipPinned(pinned) {
  tipPinned = !!pinned;
  const btn = document.getElementById('tipPin');
  if (btn) {
    btn.setAttribute('aria-pressed', tipPinned ? 'true' : 'false');
    btn.title = tipPinned
      ? 'Unpin the card'
      : 'Pin the card — it never closes, and switching parts keeps your depth';
  }
}

/** Show or hide the manipulation handles, keeping every surface in step. */
function setGizmoHidden(hidden) {
  gizmoHidden = !!hidden;
  const btn = document.getElementById('tipGizmo');
  if (btn) {
    btn.setAttribute('aria-pressed', gizmoHidden ? 'false' : 'true');
    btn.title = gizmoHidden ? 'Show the handles (G)' : 'Hide the handles (G)';
  }
  // Draw itself back on when it returns. The reveal is how this widget
  // arrives, and re-showing it is an arrival.
  if (!gizmoHidden) summonAt = performance.now();
  invalidate();
}

/** Collapse the card to its name, or restore it. */
function setTipFolded(folded) {
  tipFolded = !!folded;
  tip.classList.toggle('folded', tipFolded);
  const btn = document.getElementById('tipFold');
  if (btn) {
    btn.setAttribute('aria-expanded', tipFolded ? 'false' : 'true');
    btn.title = tipFolded ? 'Expand' : 'Collapse';
  }
  /* Folding changes the card's height, and its height is CACHED for
     placement — the position solver reads a stored size rather than forcing
     a layout every frame. Re-measure here or the card is placed against the
     dimensions it used to have. */
  tipSize = { w: tip.offsetWidth || 170, h: tip.offsetHeight || 120 };
  tipPlacement = null;
  tipAt = null;
  positionTip();
  invalidate();
}

/*
 * The material panel: the card, gone deep on one material.
 *
 * tipMat is the material name the panel is open on, or null for the
 * normal card. One control carries the journey both ways: the fold chevron
 * pivots into a back arrow while the panel is open (the same 140ms turn
 * that animates a collapse), because "go shallower" is the same gesture
 * whether shallow means folded or means back out of the depths. That
 * pattern — collapse morphs into back for anything in-depth within a part
 * — is deliberate design language, not a space saving.
 */
let tipMat = null;
/* One level deeper still: the browsable gallery of every material in the
   kit. Same journey grammar — the chevron is the way back from here to
   the panel, and from the panel to the card. */
let tipGallery = false;

function setTipMat(name) {
  tipMat = name || null;
  tipGallery = false;
  tip.classList.remove('gal');
  tip.classList.toggle('mat', !!tipMat);
  const panel = tip.querySelector('.tmat');
  const btn = document.getElementById('tipFold');
  if (tipMat) {
    /* Depth implies the card is open: entering the panel from a folded
       card unfolds it, without disturbing the remembered preference. */
    tip.classList.remove('folded');
    if (btn) { btn.setAttribute('aria-expanded', 'true'); btn.title = 'Back'; }
    /* A texture that finishes decoding after the balls were painted would
       leave them wearing the 1x1 placeholder; repaint when it lands. */
    if (renderer) renderer.onTextureReady = () => { if (tipMat) buildMatPanel(); };
    buildMatPanel();
    if (panel) panel.hidden = false;
  } else {
    stopMatBalls();
    if (panel) { panel.hidden = true; panel.textContent = ''; }
    tip.classList.toggle('folded', tipFolded);
    if (btn) {
      btn.setAttribute('aria-expanded', tipFolded ? 'false' : 'true');
      btn.title = tipFolded ? 'Expand' : 'Collapse';
    }
    /* Surfacing rebuilds the card: the panel may have reassigned the
       material or dirtied the part, and the chip and edit note must say
       so the moment they are visible again — a card that still names the
       old material is the tool contradicting the viewport beside it. */
    updateTip();
  }
  /* Same cached-size contract as folding: the panel changes the card's
     height, so the placement solver has to be told. */
  tipSize = { w: tip.offsetWidth || 170, h: tip.offsetHeight || 120 };
  tipPlacement = null;
  tipAt = null;
  positionTip();
  invalidate();
}

/* Linear <-> sRGB, for the panel's native color inputs. The payload and
   the GLB speak linear floats; input[type=color] speaks sRGB hex. One
   conversion pair, used everywhere, so a colour can round-trip through the
   picker without drifting. */
function linHex(rgb) {
  return '#' + rgb.map((v) => {
    const c = Math.max(0, Math.min(1, v));
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(s * 255).toString(16).padStart(2, '0');
  }).join('');
}
function hexLin(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [16, 8, 0].map((shift) => {
    const s = ((n >> shift) & 255) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
}

/** The single selected part, or null — the panel is per-part by design. */
function soleSelection() {
  return state.selection.size === 1 ? [...state.selection][0] : null;
}

/**
 * Everything the panel needs to know about a part's material situation:
 * the material the GLB bound (orig), the one currently in effect
 * (refName — the assignment if there is one), the census facts for it,
 * and the live edit object.
 */
function matStateFor(part) {
  const draw = renderer && renderer.draws.find((x) => x.name === part);
  let orig = draw ? ((draw.baseMat && draw.baseMat.matName) || draw.matName) : null;
  if (!orig && currentEntry && currentEntry.tree) {
    const node = currentEntry.tree.find((t) => t.n === part);
    if (node && node.m && node.m.length) orig = node.m[0];
  }
  const m = (edits[part] && edits[part].material) || {};
  const refName = m.assign || orig;
  const facts = ((currentEntry && currentEntry.mats) || {})[refName] || {};
  return { orig: orig, refName: refName, m: m, facts: facts };
}

/**
 * Draw-call material props for a preview ball of the named material.
 *
 * Prefers a draw already wearing the material — that carries the REAL
 * texture handle, which is the whole point of a rendered ball — and falls
 * back to the census facts for a material no draw uses.
 */
function ballPropsFor(matName) {
  if (renderer) {
    const exemplar = renderer.draws.find((d) =>
      ((d.baseMat && d.baseMat.matName) || d.matName) === matName);
    if (exemplar) {
      const bm = exemplar.baseMat || exemplar;
      return {
        color: [...bm.color],
        metallic: bm.metallic,
        rough: bm.rough,
        emissive: [...(bm.emissive || [0, 0, 0])],
        tex: bm.tex,
        mrTex: bm.mrTex || null,
        mrGate: bm.mrTex ? [1, 1] : [0, 0],
        emTex: bm.emTex || null,
      };
    }
  }
  const facts = ((currentEntry && currentEntry.mats) || {})[matName] || {};
  return {
    color: [
      facts.c ? facts.c[0] : 0.8, facts.c ? facts.c[1] : 0.8, facts.c ? facts.c[2] : 0.8,
      facts.a !== undefined ? facts.a : 1,
    ],
    metallic: facts.m !== undefined ? facts.m : 0,
    rough: facts.r !== undefined ? facts.r : 0.6,
    emissive: facts.e ? facts.e.map((v) => v * (facts.s !== undefined ? facts.s : 1)) : [0, 0, 0],
    tex: null,
  };
}

/** Ball props from census facts alone — for a material no draw in the
 *  open model wears (a foreign scene's, or an unused one). Values only:
 *  textures cannot travel between scenes. */
function factsBallProps(facts) {
  return {
    color: [
      facts.c ? facts.c[0] : 0.8, facts.c ? facts.c[1] : 0.8, facts.c ? facts.c[2] : 0.8,
      facts.a !== undefined ? facts.a : 1,
    ],
    metallic: facts.m !== undefined ? facts.m : 0,
    rough: facts.r !== undefined ? facts.r : 0.6,
    emissive: facts.e
      ? facts.e.map((v) => v * (facts.s !== undefined ? facts.s : 1))
      : [0, 0, 0],
    tex: null,
  };
}

/** Write a foreign material's measured values onto one part's edit record
 *  — the "copy values" pick, shared by shelf and gallery. Replaces the
 *  whole material channel: wearing those values IS the edit. */
function copyMatValues(e, facts) {
  e.material = {};
  if (facts.c) e.material.baseColor = [...facts.c];
  if (facts.r !== undefined) e.material.roughness = facts.r;
  if (facts.m !== undefined) e.material.metallic = facts.m;
  if (facts.e && facts.s !== undefined) {
    e.material.emission = [...facts.e];
    e.material.emissionStrength = facts.s;
  }
  if (facts.a !== undefined) e.material.alpha = facts.a;
  if (Object.keys(e.material).length === 0) delete e.material;
}

/* One animation loop drives every ball the panel shows: the head ball's
   idle turn and whichever shelf ball is hovered. Registered as a map of
   painters so opening, closing and rebuilding the panel just swaps the
   set; the loop dies with the panel. */
let matBallAnim = null;
const matBallSpinners = new Map();
function stopMatBalls() {
  if (matBallAnim) cancelAnimationFrame(matBallAnim);
  matBallAnim = null;
  matBallSpinners.clear();
}
function ensureMatBallLoop() {
  if (matBallAnim) return;
  const step = (now) => {
    matBallAnim = null;
    if (!tipMat || matBallSpinners.size === 0) return;
    for (const paint of matBallSpinners.values()) paint(now);
    matBallAnim = requestAnimationFrame(step);
  };
  matBallAnim = requestAnimationFrame(step);
}

/**
 * Write one property of a part's material edit, keeping the record honest:
 * a value put back to what the material already MEASURES is DELETED, not
 * stored — so "changed" means changed, the touched dot can be trusted, and
 * an edit session that ends where it started saves nothing.
 *
 * "Measures" is load-bearing: factsValue must be the census fact, which is
 * undefined when the census never measured it. Deleting only ever fires
 * against a real number, so an unmeasured baseline keeps the explicit
 * override — the alternative (comparing against a fabricated default) would
 * delete on a value the material does not actually have and silently revert
 * the render to something the slider was never showing. Do NOT restore a
 * fallback into this comparison.
 */
function setMatProp(part, key, value, factsValue) {
  const e = editFor(part);
  if (!e.material) e.material = {};
  const same = Array.isArray(value)
    ? Array.isArray(factsValue) && value.every((v, i) => Math.abs(v - factsValue[i]) < 1e-3)
    : typeof factsValue === 'number' && Math.abs(value - factsValue) < 1e-3;
  if (value === undefined || same) delete e.material[key];
  else e.material[key] = value;
  if (Object.keys(e.material).length === 0) delete e.material;
}

/**
 * One property across the WHOLE selection, each part measured against its
 * OWN reference facts — a group of parts wearing different materials still
 * gets an honest per-part "put back is not an edit". This is the write the
 * panel's controls call; it applies and refreshes once, not once per part.
 */
function setMatPropSel(parts, key, value, factsKey, fallback) {
  for (const p of parts) {
    const facts = matStateFor(p).facts;
    const ref = factsKey !== null && facts[factsKey] !== undefined ? facts[factsKey] : fallback;
    setMatProp(p, key, value, ref);
  }
  applyMatEditsToDraws();
  refreshEditButtons();
}

/**
 * Build the material panel for the selected part.
 *
 * The layout answers the three questions in the order a person asks them:
 * what is this (head: swatch, name, how shared), what else could it be
 * (the swap row — every material this compile shipped, assignment being
 * the cheapest possible restyle), and how do I shape it (the property
 * rows). Rows use the PLATFORM's controls — a color input is the OS
 * picker, a range is the OS slider — and adapt to what the material
 * actually is: a textured material's colour is labelled the tint it
 * really is, glow appears with the material's own hue when first pulled
 * up, and nothing invents a value the census did not measure.
 */
function buildMatPanel() {
  const panel = tip.querySelector('.tmat');
  if (!panel) return;
  /* While the gallery level is open, IT is what a rebuild rebuilds. */
  if (tipGallery) { buildMatGallery(); return; }
  panel.textContent = '';
  /* The panel edits the WHOLE selection: a prototype row selects all
     twelve rivets, and restyling them one by one is not a tool. The first
     selected part anchors what the panel DISPLAYS (its material, its
     facts); every gesture writes to all of them, each measured against
     its own reference. */
  const sel = [...state.selection];
  const part = sel[0];
  if (!part) { stopMatBalls(); setTipMat(null); return; }
  const st = matStateFor(part);
  const mats = (currentEntry && currentEntry.mats) || {};
  const eff = (key, factsKey, fallback) =>
    st.m[key] !== undefined ? st.m[key]
      : st.facts[factsKey] !== undefined ? st.facts[factsKey]
      : fallback;

  /* Head: what this is — a live rendered ball of the material AS EDITED,
     idling on a slow turn so brushed metal reads as brushed metal. */
  stopMatBalls();
  const head = document.createElement('div');
  head.className = 'mhead';
  const sw = document.createElement('canvas');
  sw.className = 'msw';
  sw.width = 60;
  /* The material the ball wears: the reference material's real props (its
     texture included) with this part's edits layered on — exactly the
     composition applyMatEditsToDraws paints the part with. */
  const headProps = () => {
    const props = ballPropsFor(st.refName);
    const m = (edits[part] && edits[part].material) || {};
    if (m.baseColor) props.color = [m.baseColor[0], m.baseColor[1], m.baseColor[2], props.color[3]];
    /* Same gating as the viewport: an overridden scalar silences that
       channel's map, so the ball previews exactly what the bake will do. */
    if (m.metallic !== undefined) {
      props.metallic = m.metallic;
      if (props.mrGate) props.mrGate = [props.mrGate[0], 0];
    }
    if (m.roughness !== undefined) {
      props.rough = m.roughness;
      if (props.mrGate) props.mrGate = [0, props.mrGate[1]];
    }
    if (m.emission || m.emissionStrength !== undefined) {
      const ec = m.emission || (st.facts.e || [0, 0, 0]);
      const es = m.emissionStrength !== undefined
        ? m.emissionStrength : (st.facts.s !== undefined ? st.facts.s : 1);
      props.emissive = [ec[0] * es, ec[1] * es, ec[2] * es];
      props.emTex = null;
    }
    if (m.alpha !== undefined) props.color[3] = m.alpha;
    return props;
  };
  const paintHead = (now) => {
    if (renderer) renderMatBall(renderer, headProps(), sw, (now || 0) * 0.0006);
  };
  paintHead(performance.now());
  matBallSpinners.set('head', paintHead);
  ensureMatBallLoop();
  const nm = document.createElement('span');
  nm.className = 'mname';
  /* The name carries the edit state, or a value-copy looks like nothing
     happened: overrides beyond a plain assignment read as "· edited",
     because the part no longer wears the named material as authored. */
  const liveMat = (edits[part] && edits[part].material) || {};
  const overrideKeys = Object.keys(liveMat).filter((k) => k !== 'assign');
  nm.textContent = (st.refName || 'no material') + (overrideKeys.length > 0 ? ' · edited' : '');
  nm.title = st.refName
    ? st.refName + (overrideKeys.length > 0 ? ' with overrides: ' + overrideKeys.join(', ') : '')
    : '';
  head.appendChild(sw); head.appendChild(nm);
  const use = document.createElement('span');
  use.className = 'muse';
  const count = st.facts.u;
  if (sel.length > 1) {
    /* Group mode: the one fact that changes everything downstream. */
    use.textContent = sel.length + ' parts';
    use.title = 'Editing all ' + sel.length + ' selected parts';
  } else if (typeof count === 'number' && count > 1) {
    use.textContent = '×' + count;
    use.title = 'Bound to ' + count + ' parts — your changes here become this part’s own copy';
  } else {
    use.textContent = '';
  }
  head.appendChild(use);
  panel.appendChild(head);

  /* Swap: what else it could be.
     Two shelves in one row. The scene's own materials assign by NAME —
     the cheapest restyle, everything travels including textures. After a
     thin divider, materials from the REST of the kit: those cannot be
     assigned (this scene's build never authored them), so picking one
     applies its census-measured VALUES as overrides — colour, surface,
     glow, alpha — which ride the existing channel untouched. That is the
     first rung of a shared material library: any material anywhere in the
     project is one click away. */
  const localNames = Object.keys(mats);
  const foreign = [];
  if (Array.isArray(KIT.entries)) {
    /* Dedupe by LOOK, not by name: a creature kit ships hundreds of
       per-part materials that are the same six colours. The shelf offers
       appearances — two materials whose measured facts round to the same
       ball are one choice, and the alike-count rides the tooltip. */
    const seenNames = new Set(localNames);
    const seenLooks = new Set();
    const round2 = (v) => Math.round(v * 50) / 50;
    for (const name of localNames) {
      const f = mats[name] || {};
      seenLooks.add(JSON.stringify([
        (f.c || [0.8, 0.8, 0.8]).map(round2), round2(f.r !== undefined ? f.r : 0.5),
        round2(f.m !== undefined ? f.m : 0), f.e ? f.e.map(round2) : 0,
        f.s !== undefined ? round2(f.s) : 0, f.a !== undefined ? round2(f.a) : 1,
      ]));
    }
    for (const other of KIT.entries) {
      if (other === currentEntry || !other.mats) continue;
      for (const [name, facts] of Object.entries(other.mats)) {
        if (seenNames.has(name)) continue;
        seenNames.add(name);
        const look = JSON.stringify([
          (facts.c || [0.8, 0.8, 0.8]).map(round2),
          round2(facts.r !== undefined ? facts.r : 0.5),
          round2(facts.m !== undefined ? facts.m : 0),
          facts.e ? facts.e.map(round2) : 0,
          facts.s !== undefined ? round2(facts.s) : 0,
          facts.a !== undefined ? round2(facts.a) : 1,
        ]);
        if (seenLooks.has(look)) {
          const twin = foreign.find((x) => x.look === look);
          if (twin) twin.alike += 1;
          continue;
        }
        seenLooks.add(look);
        foreign.push({ name: name, from: other.name, facts: facts, look: look, alike: 0 });
      }
    }
  }
  const FOREIGN_CAP = 12;
  if (localNames.length > 1 || foreign.length > 0) {
    const swap = document.createElement('div');
    swap.className = 'mswap';
    const addBall = (opt, propsFor, spinKey) => {
      /* A rendered ball of the material itself — real factors, real
         texture where a draw carries one, same shader as the viewport.
         Hover spins it: a material is an angular phenomenon, and the turn
         is what separates brushed gold from yellow paint. */
      const ball = document.createElement('canvas');
      ball.width = 48;
      const paintBall = (az) => { if (renderer) renderMatBall(renderer, propsFor(), ball, az); };
      paintBall(0.6);
      opt.appendChild(ball);
      opt.addEventListener('mouseenter', () => {
        matBallSpinners.set(spinKey, (now) => paintBall(0.6 + now * 0.002));
        ensureMatBallLoop();
      });
      opt.addEventListener('mouseleave', () => {
        matBallSpinners.delete(spinKey);
        paintBall(0.6);
      });
    };
    /* The ring marks the material the part wears EXACTLY. With overrides
       in play no ball is ringed — the part is wearing something none of
       the shelf offers, and a ring on the base material would claim
       clicking it changes nothing (the exact confusion it caused). */
    const anchorOverridden = Object.keys((edits[part] && edits[part].material) || {})
      .some((k) => k !== 'assign');
    for (const name of localNames) {
      const facts = mats[name];
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'mopt' + (name === st.refName && !anchorOverridden ? ' on' : '');
      addBall(opt, () => ballPropsFor(name), name);
      opt.title = name + (facts.t ? ' · textured' : '') + (facts.e && facts.s ? ' · emissive' : '');
      opt.setAttribute('aria-label', 'Use ' + name);
      opt.addEventListener('click', () => {
        const before = snapshot(sel);
        for (const p of sel) {
          const e = editFor(p);
          /* Picking a ball means "wear THIS material, as authored" — it
             REPLACES the whole channel, overrides included. Without this
             there was no way back: clicking the original ball only
             removed the assignment and every override survived it. */
          e.material = {};
          if (name !== matStateFor(p).orig) e.material.assign = name;
          if (Object.keys(e.material).length === 0) delete e.material;
        }
        applyMatEditsToDraws();
        refreshEditButtons();
        commitHistory(before, snapshot(sel));
        buildMatPanel();
      });
      swap.appendChild(opt);
    }
    if (foreign.length > 0) {
      const div = document.createElement('span');
      div.className = 'mshelf-div';
      div.title = 'Materials from the rest of the kit — picking one copies its values';
      swap.appendChild(div);
    }
    for (const item of foreign.slice(0, FOREIGN_CAP)) {
      const facts = item.facts;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'mopt';
      addBall(opt, () => factsBallProps(facts), 'kit:' + item.name);
      opt.title = item.name + ' · from ' + item.from +
        (item.alike > 0 ? ' (+' + item.alike + ' alike)' : '') +
        (facts.t ? ' · textured there; values only travel' : ' · copies its values');
      opt.setAttribute('aria-label', 'Copy values of ' + item.name);
      opt.addEventListener('click', () => {
        const before = snapshot(sel);
        /* Values, not a name: this scene's build has no such material, so
           the pick writes the measured properties as overrides — exactly
           what the runner can honour. */
        for (const p of sel) copyMatValues(editFor(p), facts);
        applyMatEditsToDraws();
        refreshEditButtons();
        commitHistory(before, snapshot(sel));
        buildMatPanel();
      });
      swap.appendChild(opt);
    }
    /* The shelf is a taste; the gallery is the library. The door is a
       ball-shaped chip so it reads as "more of these", and it goes one
       level DEEPER in the same journey grammar the chip taught. */
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.className = 'mopt mbrowse';
    browse.title = 'Browse all materials in this kit';
    browse.setAttribute('aria-label', 'Browse all materials');
    browse.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="4" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/>' +
      '<circle cx="12" cy="8" r="1.4"/></svg>';
    browse.addEventListener('click', () => {
      tipGallery = true;
      buildMatGallery();
    });
    swap.appendChild(browse);
    panel.appendChild(swap);
  }

  /* Property rows. Each holds its own gesture: history commits once per
     released slider, not once per pixel of travel — over the whole
     selection, so undoing a group recolour is one step, not twelve. */
  let pendingBefore = null;
  const beginGesture = () => { if (!pendingBefore) pendingBefore = snapshot(sel); };
  const endGestureRow = () => {
    if (pendingBefore) { commitHistory(pendingBefore, snapshot(sel)); pendingBefore = null; }
    buildMatPanel();
  };
  const row = (labelText, revertKeys, touched) => {
    const r = document.createElement('div');
    r.className = 'mrow' + (touched ? ' touched' : '');
    const label = document.createElement('label');
    label.textContent = labelText;
    if (touched) {
      label.title = 'Overridden — click to put it back';
      label.addEventListener('click', () => {
        const before = snapshot(sel);
        for (const p of sel) {
          const e = edits[p];
          if (e && e.material) {
            for (const k of revertKeys) delete e.material[k];
            if (Object.keys(e.material).length === 0) delete e.material;
          }
        }
        applyMatEditsToDraws();
        refreshEditButtons();
        commitHistory(before, snapshot(sel));
        buildMatPanel();
      });
    }
    r.appendChild(label);
    panel.appendChild(r);
    return r;
  };
  const num = (v) => (Math.round(v * 100) / 100).toString();

  /* Colour — the tint it really is when a texture drives the surface. */
  const colorRow = row(st.facts.t ? 'Tint' : 'Color', ['baseColor'], st.m.baseColor !== undefined);
  const colorIn = document.createElement('input');
  colorIn.type = 'color';
  colorIn.value = linHex(eff('baseColor', 'c', [0.8, 0.8, 0.8]));
  colorIn.addEventListener('input', () => {
    beginGesture();
    setMatPropSel(sel, 'baseColor', hexLin(colorIn.value), 'c');
    /* The head ball repaints itself every frame from the live edit state;
       nothing here has to chase it. */
  });
  colorIn.addEventListener('change', endGestureRow);
  colorRow.appendChild(colorIn);

  const slider = (labelText, key, factsKey, fallback, max, step) => {
    const value = eff(key, factsKey, fallback);
    const r = row(labelText, [key], st.m[key] !== undefined);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0'; input.max = String(max); input.step = String(step);
    input.value = String(value);
    const out = document.createElement('span');
    out.className = 'mnum';
    out.textContent = num(value);
    input.addEventListener('input', () => {
      beginGesture();
      const v = Number(input.value);
      // Each part is measured against its OWN raw census fact (undefined
      // when unmeasured), never the display fallback: the delete-on-equal
      // shortcut must compare against a value the material actually has —
      // see setMatPropSel/setMatProp.
      setMatPropSel(sel, key, v, factsKey);
      out.textContent = num(v);
    });
    input.addEventListener('change', endGestureRow);
    r.appendChild(input); r.appendChild(out);
    return input;
  };

  /* The surface pad — roughness and metallic as ONE draggable point in
     the appearance plane. x: polished -> matte; y: dielectric -> metal.
     The field is computed with the viewport's own lighting formulas over
     the material's own colour, so it previews appearance rather than
     graphing axes; the dot is the material's current position in it. */
  const surfTouched = st.m.roughness !== undefined || st.m.metallic !== undefined;
  const surfRow = row('Surface', ['roughness', 'metallic'], surfTouched);
  surfRow.style.alignItems = 'flex-start';
  const padWrap = document.createElement('div');
  padWrap.className = 'mpad';
  padWrap.style.flex = '1 1 auto';
  padWrap.style.minWidth = '0';
  const pad = document.createElement('canvas');
  pad.width = 156; pad.height = 64;
  const dot = document.createElement('div');
  dot.className = 'mdot';
  const padOut = document.createElement('span');
  padOut.className = 'mnum';
  /* Fixed, widest-case width ("0.88 · 0.85"): a readout that resizes with
     its value resizes the row, and the row resizes the card. */
  padOut.style.width = '58px';
  const baseC = eff('baseColor', 'c', [0.8, 0.8, 0.8]);
  {
    /* CPU render of the same shading the fragment shader does — key
       diffuse plus the roughness-sharpened, metal-gated highlight,
       integrated over a small arc so tight highlights survive sampling —
       then the same display transform. One field, painted once. */
    const ctx2 = pad.getContext('2d');
    const img = ctx2.createImageData(pad.width, pad.height);
    for (let y = 0; y < pad.height; y++) {
      const metal = 1 - y / (pad.height - 1);
      for (let x = 0; x < pad.width; x++) {
        const rough = x / (pad.width - 1);
        const shin = 8 + (128 - 8) * (1 - rough);
        let spec = 0;
        for (let k = 0; k < 6; k++) spec += Math.pow(0.997 - k * 0.028, shin);
        spec = (spec / 6) * (0.12 + 0.78 * metal);
        const at = (y * pad.width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const base = baseC[c];
          const lit = base * (0.22 + 0.85 * 0.9) * (1 - 0.35 * metal) +
            spec * (1 - metal + base * metal * 2.2);
          img.data[at + c] = Math.round(Math.pow(Math.min(1, Math.max(0, lit)), 1 / 2.2) * 255);
        }
        img.data[at + 3] = 255;
      }
    }
    ctx2.putImageData(img, 0, 0);
  }
  const tag = (text, style) => {
    const el = document.createElement('span');
    el.className = 'mtag';
    el.textContent = text;
    Object.assign(el.style, style);
    padWrap.appendChild(el);
  };
  tag('metal', { top: '3px', left: '5px' });
  tag('gloss', { bottom: '3px', left: '5px' });
  tag('matte', { bottom: '3px', right: '5px' });
  /* Read the LIVE edit record, not the state captured at build: setMatProp
     replaces the material object, so a captured reference goes stale the
     moment the first drag lands — and the dot would freeze while the part
     kept changing. */
  const surf = () => {
    const live = (edits[part] && edits[part].material) || {};
    return {
      rough: live.roughness !== undefined ? live.roughness
        : st.facts.r !== undefined ? st.facts.r : 0.5,
      metal: live.metallic !== undefined ? live.metallic
        : st.facts.m !== undefined ? st.facts.m : 0,
    };
  };
  const placeDot = () => {
    const v = surf();
    dot.style.left = (v.rough * 100) + '%';
    dot.style.top = ((1 - v.metal) * 100) + '%';
    padOut.textContent = num(v.rough) + ' · ' + num(v.metal);
  };
  placeDot();
  const padApply = (ev) => {
    const r = pad.getBoundingClientRect();
    let rough = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    let metal = Math.min(1, Math.max(0, 1 - (ev.clientY - r.top) / r.height));
    /* Ctrl snaps to the quarter grid, same modifier as every other snap
       in this editor. The corners are the canonical materials. */
    if (ev.ctrlKey) { rough = Math.round(rough * 4) / 4; metal = Math.round(metal * 4) / 4; }
    beginGesture();
    setMatPropSel(sel, 'roughness', rough, 'r');
    setMatPropSel(sel, 'metallic', metal, 'm');
    placeDot();
  };
  let padHeld = false;
  pad.addEventListener('pointerdown', (ev) => {
    padHeld = true;
    pad.setPointerCapture(ev.pointerId);
    padApply(ev);
  });
  pad.addEventListener('pointermove', (ev) => { if (padHeld) padApply(ev); });
  pad.addEventListener('pointerup', (ev) => {
    padHeld = false;
    try { pad.releasePointerCapture(ev.pointerId); } catch (_) {}
    endGestureRow();
  });
  padWrap.appendChild(pad);
  padWrap.appendChild(dot);
  surfRow.appendChild(padWrap);
  surfRow.appendChild(padOut);

  /* Glow: colour + energy on one row. Pulling energy up on a material that
     never emitted lights it in its OWN hue — the panel proposes, the
     census never has to have measured it. */
  const glowTouched = st.m.emission !== undefined || st.m.emissionStrength !== undefined;
  const glowRow = row('Glow', ['emission', 'emissionStrength'], glowTouched);
  const glowColor = document.createElement('input');
  glowColor.type = 'color';
  const effGlowC = st.m.emission || st.facts.e || null;
  glowColor.value = effGlowC ? linHex(effGlowC) : linHex(eff('baseColor', 'c', [0.8, 0.8, 0.8]));
  const glowStrength = document.createElement('input');
  glowStrength.type = 'range';
  const effGlowS = st.m.emissionStrength !== undefined ? st.m.emissionStrength
    : st.facts.s !== undefined ? st.facts.s : 0;
  /* The scale adapts to what is already there: a beam baked at strength 12
     must not open with its own value past the end of the slider. Capped at
     the wire contract's 1000 — a slider that could reach past what the
     daemon accepts would build an edit whose whole save gets rejected. */
  const glowMax = Math.min(1000, Math.max(8, Math.ceil(effGlowS * 1.5)));
  glowStrength.min = '0'; glowStrength.max = String(glowMax); glowStrength.step = '0.05';
  glowStrength.value = String(effGlowS);
  const glowOut = document.createElement('span');
  glowOut.className = 'mnum';
  glowOut.textContent = num(effGlowS);
  const applyGlow = () => {
    beginGesture();
    const s = Number(glowStrength.value);
    const c = hexLin(glowColor.value);
    setMatPropSel(sel, 'emissionStrength', s, 's');
    /* Zero energy needs no colour on record; anything above zero does,
       because the runner will not guess one. */
    setMatPropSel(sel, 'emission', s > 0 ? c : undefined, 'e');
    glowOut.textContent = num(s);
  };
  glowColor.addEventListener('input', applyGlow);
  glowColor.addEventListener('change', endGestureRow);
  glowStrength.addEventListener('input', applyGlow);
  glowStrength.addEventListener('change', endGestureRow);
  glowRow.appendChild(glowColor); glowRow.appendChild(glowStrength); glowRow.appendChild(glowOut);

  slider('Alpha', 'alpha', 'a', 1, 1, 0.01);

  /* Where this sits in the co-studio: tweaks are the human's lane, and the
     next compile bakes them; the agent reads the same file. Deeper surgery
     — textures, shader kernels, UVs — is a REAL edit, which belongs in the
     conversation. */
  const note = document.createElement('div');
  note.className = 'mnote';
  note.textContent = st.facts.t
    ? 'Texture-driven material — these settings layer over its maps. Save keeps them; the next compile bakes them.'
    : 'Live preview. Save keeps these; the next compile bakes them.';
  panel.appendChild(note);
}

/* Painted gallery balls, cached across filter keystrokes and reopenings —
   a creature kit carries hundreds, and repainting them on every keystroke
   would freeze the search. Keyed by entry+material name; cleared when the
   open model changes. Painting is CHUNKED through rAF so opening the
   gallery never blocks a frame on hundreds of FBO renders. */
const matGalleryCanvases = new Map();
const galPaintQueue = [];
let galPaintPump = null;
function queueGalleryPaint(job) {
  galPaintQueue.push(job);
  if (galPaintPump === null) {
    const pump = () => {
      galPaintPump = null;
      for (const j of galPaintQueue.splice(0, 14)) {
        try { j(); } catch (_) { /* a dead ball is repainted on reopen */ }
      }
      if (galPaintQueue.length) galPaintPump = requestAnimationFrame(pump);
    };
    galPaintPump = requestAnimationFrame(pump);
  }
}

/**
 * The material gallery — the panel, one level deeper again.
 *
 * Everything the kit knows, browsable: this scene's materials first (they
 * ASSIGN — textures and all), then every other scene's, grouped under
 * sticky headers (they COPY VALUES — a build cannot bind a material it
 * never authored). A native search input filters by name or scene without
 * rebuilding, so focus and scroll survive typing. Picking pops back up to
 * the panel, where the head ball wears the result. The chevron remains
 * the single way back at every depth.
 */
function buildMatGallery() {
  const panel = tip.querySelector('.tmat');
  if (!panel) return;
  stopMatBalls();
  galPaintQueue.length = 0;
  panel.textContent = '';
  tip.classList.add('gal');
  const sel = [...state.selection];
  const part = sel[0];
  if (!part) { setTipMat(null); return; }
  const st = matStateFor(part);
  const btn = document.getElementById('tipFold');
  if (btn) btn.title = 'Back';

  const headRow = document.createElement('div');
  headRow.className = 'mgal-head';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Find a material…';
  search.setAttribute('aria-label', 'Filter materials');
  const countEl = document.createElement('span');
  countEl.className = 'mgal-count';
  headRow.appendChild(search);
  headRow.appendChild(countEl);
  panel.appendChild(headRow);

  const scroll = document.createElement('div');
  scroll.className = 'mgal';
  panel.appendChild(scroll);

  const groups = [];
  if (currentEntry && currentEntry.mats) {
    groups.push({ title: 'this scene', entry: currentEntry, local: true });
  }
  for (const other of (KIT.entries || [])) {
    if (other === currentEntry || !other.mats) continue;
    groups.push({ title: other.name, entry: other, local: false });
  }

  const items = [];
  const groupEls = [];
  let total = 0;
  for (const g of groups) {
    const header = document.createElement('div');
    header.className = 'mgroup';
    header.textContent = g.title;
    scroll.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'mgrid';
    scroll.appendChild(grid);
    groupEls.push({ header: header, grid: grid });
    for (const [name, facts] of Object.entries(g.entry.mats)) {
      total += 1;
      const item = document.createElement('button');
      item.type = 'button';
      /* Ring only an EXACT wear — same rule as the shelf. */
      const worn = g.local && name === st.refName &&
        !Object.keys((edits[part] && edits[part].material) || {}).some((k) => k !== 'assign');
      item.className = 'mitem' + (worn ? ' on' : '');
      const key = g.entry.name + ':' + name;
      let ball = matGalleryCanvases.get(key);
      if (!ball) {
        ball = document.createElement('canvas');
        ball.width = 52;
        matGalleryCanvases.set(key, ball);
      }
      if (!ball.dataset.painted) {
        const propsFor = g.local ? () => ballPropsFor(name) : () => factsBallProps(facts);
        queueGalleryPaint(() => {
          if (renderer && ball.isConnected) {
            renderMatBall(renderer, propsFor(), ball, 0.6);
            ball.dataset.painted = '1';
          }
        });
      }
      item.appendChild(ball);
      const lab = document.createElement('span');
      lab.className = 'mlab';
      lab.textContent = name.replace(/^mtl_/, '');
      item.appendChild(lab);
      item.title = name +
        (g.local ? '' : ' · from ' + g.entry.name + ' — copies its values') +
        (facts.t ? ' · textured' : '') + (facts.e && facts.s ? ' · emissive' : '');
      item.dataset.search = (name + ' ' + g.entry.name).toLowerCase();
      item.addEventListener('click', () => {
        const before = snapshot(sel);
        for (const p of sel) {
          const e = editFor(p);
          if (g.local) {
            /* "Wear THIS material, as authored" — replaces the whole
               channel, overrides included, same as the shelf. */
            e.material = {};
            if (name !== matStateFor(p).orig) e.material.assign = name;
            if (Object.keys(e.material).length === 0) delete e.material;
          } else {
            /* Values, not a name — same contract as the shelf. */
            copyMatValues(e, facts);
          }
        }
        applyMatEditsToDraws();
        refreshEditButtons();
        commitHistory(before, snapshot(sel));
        /* Picking surfaces to the panel, where the head ball wears it. */
        tipGallery = false;
        tip.classList.remove('gal');
        buildMatPanel();
        tipSize = { w: tip.offsetWidth || 170, h: tip.offsetHeight || 120 };
        tipPlacement = null; tipAt = null;
        positionTip();
        invalidate();
      });
      grid.appendChild(item);
      items.push(item);
    }
  }

  const empty = document.createElement('div');
  empty.className = 'mempty';
  empty.textContent = 'No material matches.';
  empty.hidden = true;
  scroll.appendChild(empty);

  /* Filter by hiding, never by rebuilding: focus and scroll survive. */
  const applyFilter = () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    for (const item of items) {
      const hit = !q || item.dataset.search.indexOf(q) !== -1;
      item.hidden = !hit;
      if (hit) visible += 1;
    }
    for (const g of groupEls) {
      let any = false;
      for (const child of g.grid.children) if (!child.hidden) { any = true; break; }
      g.header.hidden = !any;
    }
    countEl.textContent = visible + '/' + total;
    empty.hidden = visible !== 0;
  };
  search.addEventListener('input', applyFilter);
  applyFilter();
  search.focus();

  tipSize = { w: tip.offsetWidth || 170, h: tip.offsetHeight || 120 };
  tipPlacement = null;
  tipAt = null;
  positionTip();
  invalidate();
}

const mm = (v) => (v < 0.1 ? Math.round(v * 1000) + 'mm' : (Math.round(v * 1000) / 1000) + 'm');

/**
 * Re-read the selected part's dimensions into the label.
 *
 * The card is built when the selection changes, but a resize changes the
 * part's size without changing what is selected — so the label kept
 * reporting the size the part used to be, which is precisely the number
 * the user is watching while they drag a scale knob.
 */
/**
 * Compress a compiler message into something that fits one narrow line.
 *
 * Compiler messages are written for a log, where naming both operands is
 * correct. On this card one of those operands is the part you already have
 * selected, so repeating it spends most of the width restating the obvious.
 * Dropping it leaves the half that is news.
 */
function shortIssue(message, selfName) {
  let text = String(message || '');
  // "coplanar overlap between 'a' and 'b' (2 face pair(s))" -> "overlaps b"
  const pair = text.match(/between '([^']+)' and '([^']+)'/);
  if (pair) {
    const other = pair[1] === selfName ? pair[2] : pair[1];
    return 'overlaps ' + other;
  }
  /*
   * Drop the subject when it is the part the card already names.
   *
   * Every lint message quotes its subject, but not in one shape: sometimes
   * behind a kind word ("mesh 'x' has ...", "object 'x' is ..."), sometimes
   * bare ("'x' sinks ..."). The old pattern required the kind word, so the
   * bare form fell through and the line repeated a name the heading was
   * already showing, pushing the actual measurement past the ellipsis.
   *
   * The name is only dropped when it IS this part. A message about some
   * other object keeps its subject — without it the line would silently
   * read as if it were about the selected part.
   */
  if (selfName) {
    /* Plain string search, not a built regex. Escaping a part name into a
       pattern means backslashes, and this file is authored inside a raw
       template where backslashes ship verbatim — the escape collapsed to a
       no-op that happened to work only because part names are word
       characters. Nothing here needs escaping. */
    const quoted = String.fromCharCode(39) + selfName + String.fromCharCode(39);
    const at = text.indexOf(quoted);
    // Only when it OPENS the message, optionally behind one kind word
    // ("mesh 'x' has ..."); a name quoted mid-sentence is not the subject.
    if (at >= 0 && /^(\w+ )?$/.test(text.slice(0, at))) {
      text = text.slice(at + quoted.length).replace(/^ (is |has )?/, '');
    }
  }
  // Trailing parenthetical counts are detail for the hover, not the glance.
  text = text.replace(/\s*\([^)]*\)\s*$/, '');
  /*
   * No sentence-casing. This is a fragment beside a heading, not a
   * sentence, and the first word is as often a part name as it is prose —
   * capitalising rewrote "prp_body overlaps ..." into "Prp_body ...", an
   * identifier that does not exist in the scene and cannot be searched for.
   */
  return text;
}

/**
 * True when any selected part carries a rotation the user applied.
 *
 * It matters for the size readout: the number is a world-aligned bounding
 * box, so turning a 1m plank 45° makes it report 1.41m. That is correct
 * for a box and wrong for a plank, and the difference only appears once
 * something is rotated off-axis.
 */
function selectionRotated(names) {
  return names.some((n) => {
    const q = edits[n] && edits[n].quat;
    return q ? Math.abs(Math.abs(q[3]) - 1) > 1e-9 : false;
  });
}

/** Combined extent of a selection, which for one part is just its own. */
function selectionSize(names) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const d of renderer.draws) {
    if (names.indexOf(d.name) < 0) continue;
    for (let a = 0; a < 3; a++) {
      if (d.min[a] < lo[a]) lo[a] = d.min[a];
      if (d.max[a] > hi[a]) hi[a] = d.max[a];
    }
  }
  if (!isFinite(lo[0])) return [0, 0, 0];
  return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
}

/**
 * Say what the user has changed but not yet saved.
 *
 * An edited part is otherwise state you cannot see: the card reports the
 * post-edit size with nothing to say the size is post-edit, so "have I
 * touched this?" and "what would Reset cost me?" have no answer on screen.
 * Only non-identity terms appear, so a part that was merely clicked stays
 * silent and the line costs nothing in the common case.
 */
function refreshEditNote() {
  const el = tip.querySelector('.tedit');
  if (!el) return;
  const names = [...state.selection];
  const parts = [];
  let moved = 0, turned = 0, scaled = 1, touched = 0, restyled = 0;
  for (const name of names) {
    const e = edits[name];
    if (!e) continue;
    const t = e.translate || [0, 0, 0];
    const q = e.quat || [0, 0, 0, 1];
    const s = e.scale || [1, 1, 1];
    const d = Math.hypot(t[0], t[1], t[2]);
    // Angle of a unit quaternion: 2·acos(w), clamped for float drift.
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q[3])));
    const sc = Math.max(s[0], s[1], s[2]);
    const styled = e.material && Object.keys(e.material).length > 0;
    if (d > 1e-6 || ang > 1e-6 || Math.abs(sc - 1) > 1e-9 || styled) touched++;
    if (styled) restyled++;
    moved = Math.max(moved, d);
    turned = Math.max(turned, ang);
    if (Math.abs(sc - 1) > Math.abs(scaled - 1)) scaled = sc;
  }
  if (touched === 0) { el.hidden = true; return; }
  if (moved > 1e-6) parts.push('moved ' + formatLength(moved));
  if (turned > 1e-6) parts.push('turned ' + Math.round(turned * 180 / Math.PI) + '°');
  if (Math.abs(scaled - 1) > 1e-9) parts.push('scaled ' + (Math.round(scaled * 100) / 100) + '×');
  if (restyled > 0) parts.push('restyled');
  /*
   * Three states, not two.
   *
   * An edit is unsaved, or saved but not yet in the geometry, or fully
   * built — and the line used to call every one of them "unsaved". After a
   * successful save it still said unsaved, which is the tool contradicting
   * the thing it had just done; a user who believed it would press Save
   * again, or conclude that saving does not work.
   *
   * "needs a recompile" is the honest name for the middle state: the edit is
   * safely on disk and the exported mesh does not carry it yet.
   */
  const status = dirty()
    ? 'unsaved'
    : 'saved · needs a recompile';
  el.textContent = (touched > 1 ? touched + ' parts · ' : '') + parts.join(' · ') + ' · ' + status;
  el.hidden = false;
}

function refreshTipDims() {
  /* No single-selection guard. The line reports the COMBINED bounds of the
     selection, so bailing out on a multi-select left a stale number on
     screen for the whole drag — the one case where the combined size is
     the reason you are looking at the card. */
  if (!renderer || !tipAnchor || state.selection.size === 0) return;
  const el = tip.querySelector('.tdim');
  const sel = [...state.selection];
  if (el) {
    el.textContent = selectionSize(sel).map(mm).join(' × ') +
      (sel.length > 1 || selectionRotated(sel) ? ' bounds' : '');
  }
  refreshEditNote();
}

/* Trim a part name down to something that fits a 46px node without
   becoming a mystery. Asset names are near-universally prefixed
   (prp_, sm_, mesh_), so the prefix is the least informative part. */
function shortName(name) {
  const tail = name.replace(/^[a-z]{2,4}_/i, '');
  if (tail.length <= 11) return tail;
  /* Ellipsise the MIDDLE, not the end. Real part names are hierarchical
     and share long prefixes — bracket_fr_side and bracket_fr_top both
     truncate to "bracket_f…", which turns two distinct parts into one
     ambiguous label. The distinguishing token is almost always the last
     one, so keep both ends. */
  return tail.slice(0, 5) + '…' + tail.slice(-5);
}

const MAP = { w: 168, h: 96, padX: 26, padY: 13 };
/* Nodes of the current neighbourhood map. Built when the selection changes,
   repositioned every frame — see positionMap. */
let mapNodes = [];

/*
 * The neighbourhood map.
 *
 * This is a miniature of what is on screen, not an abstract tree. A
 * neighbour that sits up and to the right in the viewport sits up and to
 * the right in the map, because both come from the same projection — so
 * reading the map never requires translating between two mental pictures.
 *
 * Three things are encoded, and each is measured rather than assumed:
 *   position — the neighbour's real projected offset from this part, under
 *              ONE shared scale so the near thing genuinely looks nearer
 *              than the far thing;
 *   size     — the neighbour's footprint relative to this part, so a
 *              structural member never looks like a bolt;
 *   edge     — dashed upward for what this part carries, solid for what
 *              carries it, weighted by proximity.
 *
 * An evenly-spaced row of identical boxes would have been easier and would
 * have quietly lied about all three.
 */
function buildMap(draw, anchorName, near) {
  const map = tip.querySelector('.tmap');
  map.textContent = '';
  mapNodes = [];
  if (!near.length) return;

  const shown = near.slice(0, 6);
  const selfVol = Math.max(1e-9, drawSize(draw).reduce((a, b) => a * b, 1));
  const maxDist = Math.max(...shown.map((n) => n.distance)) || 1;

  const node = (name, kind, other) => {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'node' + (kind ? ' ' + kind : ''));
    if (state.selection.has(name)) g.classList.add('picked');
    // Width belongs to the label — a pill its own text spills out of is
    // the kind of detail that makes everything around it look unfinished.
    // Footprint therefore rides on HEIGHT, in three coarse steps: finer
    // reads as noise at this size, coarser stops carrying information.
    const label = shortName(name);
    const vol = other ? drawSize(other).reduce((a, b) => a * b, 1) : selfVol;
    const ratio = vol / selfVol;
    const h = ratio > 1.6 ? 17 : ratio < 0.35 ? 12 : 14.5;
    // 8.5px ui-monospace advances at very close to 0.6em.
    const w = Math.round(label.length * 5.1 + 12);
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    const t = document.createElementNS(SVGNS, 'text');
    t.textContent = label;
    // The pill shows a trimmed name because it has to fit; hovering gives
    // back the full name and the measured distance, so nothing the map
    // abbreviates is actually lost.
    const title = document.createElementNS(SVGNS, 'title');
    title.textContent = name;
    g.append(r, t, title);
    g.titleEl = title;
    // Same rule as the canvas: plain click replaces, shift adds.
    g.addEventListener('click', (e) => selectPart(name, e.shiftKey ? 'add' : 'replace'));
    map.appendChild(g);
    return { name: name, g: g, rect: r, text: t, w: w, h: h, draw: other, x: 0, y: 0 };
  };

  const self = node(anchorName, 'self', draw);
  for (const n of shown) {
    const other = renderer.draws.find((d) => d.name === n.name);
    if (!other) continue;
    const entry = node(n.name, null, other);
    // Dashed upward means "this rests on the selected part". The direction
    // is read from the contact itself, not from centre heights, so a wide
    // lid straddling a narrow body still resolves correctly.
    entry.up = other.min[1] >= draw.max[1] - 0.002;
    entry.weight = 1 - Math.min(1, n.distance / maxDist) * 0.6;
    // Three relations, not two: a part meeting this one side-on neither
    // carries it nor is carried by it, and saying otherwise would be a
    // confident wrong answer.
    const under = other.max[1] <= draw.min[1] + 0.002;
    /* The real surface separation, not a centre distance. Centre-to-centre
       reads as far for a large neighbour lying flush against you, which is
       the opposite of what it is describing. Negative means the boxes
       overlap, which is worth saying out loud. */
    const gap = n.gap === undefined ? null : n.gap;
    const how = gap === null ? ''
      : gap < -0.0005 ? 'overlapping by ' + formatLength(-gap)
      : gap < 0.0005 ? 'flush'
      : formatLength(gap) + ' apart';
    entry.g.titleEl.textContent =
      n.name + (how ? ' · ' + how : '') + ' · ' +
      (entry.up ? 'rests on this' : under ? 'supports this' : 'meets this side-on');
    const l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('class', 'edge' + (entry.up ? ' up' : ''));
    l.setAttribute('stroke-opacity', (0.35 + entry.weight * 0.5).toFixed(2));
    entry.edge = l;
    map.insertBefore(l, map.firstChild);
    mapNodes.push(entry);
  }
  // The anchor is drawn last so it is never occluded by a neighbour that
  // projects close to it.
  map.appendChild(self.g);
  mapNodes.push(self);
  self.isSelf = true;

  if (near.length > shown.length) {
    const more = document.createElementNS(SVGNS, 'text');
    more.setAttribute('class', 'tmore');
    more.setAttribute('x', MAP.w - 2);
    more.setAttribute('y', MAP.h - 2);
    // Never let the map imply it showed everything.
    more.textContent = '+' + (near.length - shown.length) + ' more';
    map.appendChild(more);
  }
  positionMap();
}

/*
 * Project the neighbourhood into the card. Runs per frame so the map turns
 * with the model — the whole point is that it agrees with the viewport at
 * every camera angle, not just the one it was built at.
 */
function positionMap() {
  if (!mapNodes.length || !renderer) return;
  const self = mapNodes[mapNodes.length - 1];
  const origin = worldToScreen(renderer, state, canvas, drawCenter(self.draw));
  if (!origin) return;

  // Offsets in screen pixels, then ONE scale for both axes. Scaling each
  // axis to fit independently would stretch the layout and destroy the
  // relative distances the map exists to show.
  let maxX = 1e-6, maxY = 1e-6;
  for (const n of mapNodes) {
    if (n.isSelf) { n.dx = 0; n.dy = 0; continue; }
    const p = worldToScreen(renderer, state, canvas, drawCenter(n.draw));
    if (!p) { n.dx = 0; n.dy = 0; continue; }
    n.dx = p.x - origin.x; n.dy = p.y - origin.y;
    maxX = Math.max(maxX, Math.abs(n.dx));
    maxY = Math.max(maxY, Math.abs(n.dy));
  }
  // A first-guess scale from the offsets alone. The nodes have real size,
  // so this cannot be the final answer — it only gets the arrangement into
  // roughly the right shape before the fit pass measures it for real.
  const room = { x: MAP.w / 2 - MAP.padX, y: MAP.h / 2 - MAP.padY };
  let scale = Math.min(room.x / maxX, room.y / maxY);

  const place = () => {
    for (const n of mapNodes) {
      n.x = MAP.w / 2 + n.dx * scale;
      n.y = MAP.h / 2 + n.dy * scale;
    }
    // Relaxation so parts that project almost on top of each other stay
    // readable, without moving far enough to misreport direction.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < mapNodes.length; i++) {
        for (let j = i + 1; j < mapNodes.length; j++) {
          const a = mapNodes[i], b = mapNodes[j];
          const dy = b.y - a.y;
          const overlapY = (a.h + b.h) / 2 + 2.5 - Math.abs(dy);
          const overlapX = (a.w + b.w) / 2 + 3 - Math.abs(b.x - a.x);
          if (overlapY <= 0 || overlapX <= 0) continue;
          const push = (overlapY / 2) * (dy < 0 ? -1 : 1);
          // The anchor holds still: it is the one fixed point the reader
          // orients from, and a map whose centre drifts is disorienting.
          if (a.isSelf) b.y += push * 2;
          else if (b.isSelf) a.y -= push * 2;
          else { a.y -= push; b.y += push; }
        }
      }
    }
  };

  /* Fit the arrangement to the box by measuring what it actually occupies,
     nodes included, rather than trusting the offset-only scale. Without
     this the cluster sits off-centre with dead space on one side and a
     label clipped on the other — which is precisely how it first looked. */
  place();
  for (let attempt = 0; attempt < 6; attempt++) {
    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
    for (const n of mapNodes) {
      lo = Math.min(lo, n.x - n.w / 2); hi = Math.max(hi, n.x + n.w / 2);
      top = Math.min(top, n.y - n.h / 2); bot = Math.max(bot, n.y + n.h / 2);
    }
    const fitX = (MAP.w - 4) / Math.max(1e-6, hi - lo);
    const fitY = (MAP.h - 4) / Math.max(1e-6, bot - top);
    const fit = Math.min(fitX, fitY);
    // Converge on filling the box in BOTH directions — a layout that only
    // ever shrinks leaves the map floating in dead space, which reads as an
    // afterthought no matter how correct the geometry underneath is.
    if (Math.abs(fit - 1) < 0.02) break;
    // Only the offsets scale, never the nodes: label legibility is not
    // negotiable, and the spacing is what the room is for.
    scale *= fit;
    place();
  }

  // Centre whatever the arrangement ended up being.
  let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
  for (const n of mapNodes) {
    lo = Math.min(lo, n.x - n.w / 2); hi = Math.max(hi, n.x + n.w / 2);
    top = Math.min(top, n.y - n.h / 2); bot = Math.max(bot, n.y + n.h / 2);
  }
  const shiftX = MAP.w / 2 - (lo + hi) / 2;
  const shiftY = MAP.h / 2 - (top + bot) / 2;

  for (const n of mapNodes) {
    const x = n.x + shiftX;
    const y = n.y + shiftY;
    n.rect.setAttribute('x', (x - n.w / 2).toFixed(1));
    n.rect.setAttribute('y', (y - n.h / 2).toFixed(1));
    n.text.setAttribute('x', x.toFixed(1));
    n.text.setAttribute('y', (y + 0.5).toFixed(1));
    n.px = x; n.py = y;
  }
  for (const n of mapNodes) {
    if (n.isSelf || !n.edge) continue;
    n.edge.setAttribute('x1', self.px.toFixed(1)); n.edge.setAttribute('y1', self.py.toFixed(1));
    n.edge.setAttribute('x2', n.px.toFixed(1)); n.edge.setAttribute('y2', n.py.toFixed(1));
  }
}

/** Content, rebuilt only when the selection changes. */
function buildTip() {
  if (!renderer || state.selection.size === 0) {
    tip.classList.remove('on'); tipAnchor = null; return;
  }
  const names = [...state.selection];
  const anchorName = names[names.length - 1];
  const draw = renderer.draws.find((d) => d.name === anchorName);
  if (!draw) { tip.classList.remove('on'); tipAnchor = null; return; }
  tipAnchor = draw;

  tip.querySelector('.tname').textContent =
    names.length > 1 ? names.length + ' parts selected' : anchorName;
  /* For a multi-selection the useful size is the COMBINED one — it is what
     you check before asking whether the assembly fits somewhere. Naming the
     anchor instead answered a question nobody had. */
  /* Name the measurement when it stops being the part's size. Unlabelled
     millimetres imply a caliper reading; this is a bounding box, and once
     a part is turned off-axis the two are different numbers. */
  const dim = tip.querySelector('.tdim');
  dim.textContent = selectionSize(names).map(mm).join(' × ') +
    (names.length > 1 || selectionRotated(names) ? ' bounds' : '');
  dim.title = 'World-aligned bounding box of the selection';
  refreshEditNote();

  /* Compiler findings for THIS part, above everything except its name.
     Conditional, so a clean part — the common case — pays nothing for it.
     Abbreviated on the surface with the full text on hover, the same
     pattern the neighbourhood map already established. */
  const err = tip.querySelector('.terr');
  const found = (currentEntry && currentEntry.partIssues && currentEntry.partIssues[anchorName]) || [];
  if (err) {
    if (found.length === 0) err.hidden = true;
    else {
      const worst = found.find((i) => i.severity === 'error') || found[0];
      const more = found.length > 1 ? ' +' + (found.length - 1) : '';
      /* Say what is wrong, not its catalogue number.
         The card's job here is POINTING — "this part is the broken one" —
         and a bare S3D-E-324 cannot do that for a human; it is a lookup
         key. The stable code is what the agent reads, and the agent reads
         the compiler's output, not this card. So the message leads and the
         code lives in the hover, which is where the map already puts the
         precise version of everything it abbreviates. */
      /* Findings describe the LAST COMPILE. If the part has been edited
         since, the two rows of this card describe different worlds — and
         the edit may be exactly what fixed the thing being reported. Saying
         so is the difference between two true lines and one misleading
         pair. */
      const edited = names.some((n) => {
        const e = edits[n];
        if (!e) return false;
        const t = e.translate || [0, 0, 0];
        const q = e.quat || [0, 0, 0, 1];
        const sc = e.scale || [1, 1, 1];
        return Math.hypot(t[0], t[1], t[2]) > 1e-6 ||
          Math.abs(Math.abs(q[3]) - 1) > 1e-9 ||
          sc.some((v) => Math.abs(v - 1) > 1e-9);
      });
      err.textContent = shortIssue(worst.message, anchorName) + more +
        (edited ? ' · last compile' : '');
      /* Newlines built rather than escaped: this whole script lives inside
         a template literal, and a backslash escape here has to survive two
         layers of quoting to reach the browser intact. */
      const nl = String.fromCharCode(10);
      err.title = found.map((i) => i.code + ' — ' + i.message).join(nl) +
        (edited ? nl + nl + 'From the last compile; this part has unsaved edits since.' : '');
      err.className = 'terr' +
        (edited ? ' stale' : worst.severity === 'error' ? ' bad' : ' warn');
      err.hidden = false;
    }
  }

  /* Compiler facts, single selection only: a multi-selection's card is
     about the assembly (combined bounds above); per-part detail there
     would attribute one part's facts to many. Everything here is census-
     measured and carried by the tree payload — absent facts simply do not
     render, so a scene compiled by an older pipeline shows the same card
     it always did. */
  const factsEl = tip.querySelector('.tfacts');
  if (factsEl) {
    factsEl.textContent = '';
    const node = names.length === 1 && currentEntry && currentEntry.tree
      ? currentEntry.tree.find((t) => t.n === anchorName)
      : null;
    const bits = [];
    if (node && typeof node.r === 'number') {
      bits.push(node.r.toLocaleString() + ' tris');
    }
    for (const text of bits) {
      const span = document.createElement('span');
      span.textContent = text;
      factsEl.appendChild(span);
    }
    if (node && typeof node.b === 'number') {
      const clips = (currentEntry.clips || []);
      const bones = document.createElement('span');
      bones.textContent = node.b + ' bones';
      if (clips.length > 0) bones.title = 'clips: ' + clips.join(', ');
      factsEl.appendChild(bones);
    }
    if (node && typeof node.x === 'number') {
      const px = document.createElement('span');
      px.textContent = node.x.toLocaleString() + ' px/m';
      px.title = 'Mean texel density of the bound textures';
      factsEl.appendChild(px);
    }
    /* A live assignment supersedes the census: the chip names the material
       the part is WEARING right now, not the one the last compile measured
       — the card must never disagree with the viewport beside it. */
    const liveAssign = names.length === 1 && edits[anchorName] &&
      edits[anchorName].material && edits[anchorName].material.assign;
    const chipMats = liveAssign ? [liveAssign] : (node && node.m) || [];
    for (const matName of chipMats) {
      /* The chip is a BUTTON: clicking it expands the card into the
         material panel — pick a different material, or shape this one.
         It stays a quiet fact until hovered; the affordance is the hover. */
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tmatchip';
      const color = (currentEntry.matColors || {})[matName];
      if (color) {
        const sw = document.createElement('span');
        sw.className = 'tsw';
        sw.style.background = color;
        chip.appendChild(sw);
      }
      const label = document.createElement('span');
      /* The star is the card-sized "· edited": this part carries material
         overrides on top of the named material. Without it a value-copy
         reads as nothing having happened. */
      const liveMat = (edits[anchorName] && edits[anchorName].material) || {};
      const edited = Object.keys(liveMat).some((k) => k !== 'assign');
      label.textContent = matName + (edited ? '*' : '');
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      chip.title = matName + (edited ? ' (edited)' : '') + ' — click to open the material panel';
      chip.appendChild(label);
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        setTipMat(matName);
      });
      factsEl.appendChild(chip);
    }
    if (node && typeof node.o === 'number') {
      /* Jump-to-definition for geometry: the line the author wrote. The
         page cannot open host files, so the click copies "scene.json:47"
         — the exact string an editor's goto and the agent's Edit both
         accept — using the same clipboard gesture the tree already
         taught for prim paths. */
      const src = document.createElement('button');
      src.type = 'button';
      src.className = 'tsrc';
      src.textContent = 'scene.json:' + node.o;
      src.title = 'The line that authored this part - click to copy';
      src.addEventListener('click', (e) => {
        e.stopPropagation();
        try { navigator.clipboard.writeText('scene.json:' + node.o); } catch (_) {}
        src.textContent = 'copied';
        setTimeout(() => { src.textContent = 'scene.json:' + node.o; }, 900);
      });
      factsEl.appendChild(src);
    }
    /* Multi-selection: one chip for the whole group. A prototype row
       selects twelve rivets at once — restyling them one by one is not a
       tool, so the door into the material panel has to exist here too.
       The panel itself edits every selected part. */
    if (names.length > 1) {
      const groupMats = new Set();
      for (const n of names) {
        const row = currentEntry && currentEntry.tree &&
          currentEntry.tree.find((t) => t.n === n);
        for (const mn of (row && row.m) || []) groupMats.add(mn);
      }
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tmatchip';
      const first = [...groupMats][0];
      const color = first && (currentEntry.matColors || {})[first];
      if (color) {
        const sw = document.createElement('span');
        sw.className = 'tsw';
        sw.style.background = color;
        chip.appendChild(sw);
      }
      const label = document.createElement('span');
      label.textContent = groupMats.size > 1
        ? groupMats.size + ' materials'
        : (first || 'material');
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      chip.title = 'Restyle all ' + names.length + ' selected parts';
      chip.appendChild(label);
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        setTipMat(first || '*');
      });
      factsEl.appendChild(chip);
    }
    factsEl.hidden = factsEl.childNodes.length === 0;
  }

  const near = touchingParts(renderer, anchorName).slice(0, 6);
  tip.querySelector('.tnear').hidden = near.length === 0;
  buildMap(draw, anchorName, near);
  tip.classList.add('on');
  // Measure once here, not per frame: reading offsetWidth inside the draw
  // loop forces a synchronous layout on every single frame.
  tipSize = { w: tip.offsetWidth || 170, h: tip.offsetHeight || 120 };
  // New card, new decision: carrying the previous side over would make it
  // appear already committed to a placement chosen for a different part.
  tipPlacement = null;
  tipAt = null;
  positionTip();
}

/** Position only — safe to run every frame. */
/*
 * Rectangles the card must not sit under, in canvas coordinates.
 *
 * The card is an in-world label, but it shares a plane with the app's own
 * chrome — the asset rail, the identity chip, the bottom bar. Landing
 * beneath the rail made it look like the card had failed to appear at all,
 * which is worse than showing it somewhere less ideal.
 *
 * Measured lazily and cached: reading getBoundingClientRect for several
 * elements inside the draw loop forces a synchronous layout every frame,
 * and this geometry only changes when the window resizes or the rail is
 * toggled. Both of those invalidate it explicitly.
 */
let chromeRects = null;

function invalidateChrome() { chromeRects = null; }

function chromeObstacles() {
  if (chromeRects) return chromeRects;
  const host = canvas.getBoundingClientRect();
  const out = [];
  // Everything the page floats over the viewport. The overlay class covers
  // the identity chip, the rail, the toggle and the bottom bar; querying by
  // that shared class means a new piece of chrome is respected
  // automatically rather than needing to be listed here.
  for (const el of document.querySelectorAll('.overlay, .tip')) {
    if (el === tip) continue;
    if (el.hidden || el.classList.contains('hidden')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({ x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height });
  }
  chromeRects = out;
  return out;
}

/** Area of the intersection of two rectangles; 0 when they do not meet. */
function overlapArea(a, b) {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return x > 0 && y > 0 ? x * y : 0;
}

/*
 * Coarse screen occupancy of the WHOLE model.
 *
 * Keeping the card off the part it describes is not enough. On any scene
 * with more than a couple of parts, dodging the selected box lands the card
 * squarely on a neighbour - which occludes the model just as badly and, to
 * a reader, looks like the card was placed at random. Every part's screen
 * footprint is stamped into a low resolution grid so a candidate can be
 * charged for whatever geometry it covers, not only the selected part's.
 *
 * A grid rather than a per-part loop because ten candidates are scored per
 * frame: rasterising once costs O(parts) per camera change instead of
 * O(parts x candidates) per frame. The key is the camera, so a static view
 * reuses the same grid for as long as it stays static.
 *
 * Each part contributes the axis-aligned box of its projected corners,
 * which over-covers a rotated part. That bias is the right way round: it
 * makes the card slightly shy of geometry rather than slightly on top of
 * it.
 */
const OCC_COLS = 40;

function sceneOccupancy() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // The selection is part of the key: this map measures OTHER geometry (the
  // subject is stamped and scored separately, more heavily), so it changes
  // whenever the excluded set changes, not only when the camera moves.
  const sel = [...state.selection].sort().join('|');
  const key = [
    state.azimuth, state.elevation, state.distance,
    state.pan[0], state.pan[1], state.pan[2],
    w, h, renderer.draws.length,
  ].map((v) => Math.round(v * 1000)).join(',') + ';' + sel;
  if (occupancy && occupancyKey === key) return occupancy;
  const rows = Math.max(1, Math.round(OCC_COLS * h / Math.max(1, w)));
  const cellW = w / OCC_COLS, cellH = h / rows;
  const cells = new Uint8Array(OCC_COLS * rows);
  for (const d of renderer.draws) {
    // Skip the selected part(s): the card already scores covering its own
    // subject on a dedicated, heavier term. Counting it here too would charge
    // the subject twice and inflate the "other geometry" cost with the very
    // part the card is trying to sit beside.
    if (state.selection.has(d.name)) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, seen = 0;
    for (let i = 0; i < 8; i++) {
      const q = worldToScreen(renderer, state, canvas, [
        i & 1 ? d.max[0] : d.min[0],
        i & 2 ? d.max[1] : d.min[1],
        i & 4 ? d.max[2] : d.min[2],
      ]);
      if (!q) continue;
      seen++;
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    // Same rule as the card's own anchor: fewer than two corners in front
    // of the camera is a guess, not a footprint.
    if (seen < 2) continue;
    const c0 = Math.max(0, Math.floor(x0 / cellW));
    const c1 = Math.min(OCC_COLS - 1, Math.floor(x1 / cellW));
    const r0 = Math.max(0, Math.floor(y0 / cellH));
    const r1 = Math.min(rows - 1, Math.floor(y1 / cellH));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) cells[r * OCC_COLS + c] = 1;
    }
  }
  occupancy = { cells: cells, cols: OCC_COLS, rows: rows, cellW: cellW, cellH: cellH };
  occupancyKey = key;
  return occupancy;
}

/** Screen area of the model a rectangle would cover, in square pixels. */
function occludedArea(rect) {
  const o = sceneOccupancy();
  const c0 = Math.max(0, Math.floor(rect.x / o.cellW));
  const c1 = Math.min(o.cols - 1, Math.floor((rect.x + rect.w) / o.cellW));
  const r0 = Math.max(0, Math.floor(rect.y / o.cellH));
  const r1 = Math.min(o.rows - 1, Math.floor((rect.y + rect.h) / o.cellH));
  let n = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) n += o.cells[r * o.cols + c];
  }
  return n * o.cellW * o.cellH;
}

/* The placement chosen last frame, kept so the card commits to a side.
   Re-deciding from scratch every frame makes it flip between two nearly
   equal options as the camera moves, which reads as a glitch. */
let tipPlacement = null;
let tipAt = null;

function positionTip() {
  if (!tipAnchor || !renderer || state.selection.size === 0) return;
  const draw = tipAnchor;
  // Project all eight corners so the card sits beside the part's real
  // screen footprint rather than beside a single point that may be behind
  // the geometry at some angles.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let seen = 0;
  for (let i = 0; i < 8; i++) {
    const p = worldToScreen(renderer, state, canvas, [
      i & 1 ? draw.max[0] : draw.min[0],
      i & 2 ? draw.max[1] : draw.min[1],
      i & 4 ? draw.max[2] : draw.min[2],
    ]);
    if (!p) continue;
    seen++;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Fewer than two corners in front of the camera means the footprint is a
  // guess, not a measurement — anchoring to it would fling the card around.
  if (seen < 2) { tip.classList.remove('on'); return; }

  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pad = 10;
  const gap = 14;
  const box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const cx = minX + box.w / 2, cy = minY + box.h / 2;

  /*
   * Candidate placements, in preference order.
   *
   * Right of the part first because that is where a reader looks after the
   * subject, and because the rail lives on the left. Each is scored rather
   * than taken on sight, so the order only breaks ties.
   */
  const candidates = [
    { id: 'right', x: maxX + gap, y: cy - tipSize.h / 2 },
    { id: 'left', x: minX - tipSize.w - gap, y: cy - tipSize.h / 2 },
    { id: 'right-top', x: maxX + gap, y: minY },
    { id: 'left-top', x: minX - tipSize.w - gap, y: minY },
    { id: 'below', x: cx - tipSize.w / 2, y: maxY + gap },
    { id: 'above', x: cx - tipSize.w / 2, y: minY - tipSize.h - gap },
    // Diagonals: when a part fills the frame, every edge-adjacent slot
    // overlaps it and only a corner is clear.
    { id: 'right-below', x: maxX + gap, y: maxY + gap },
    { id: 'left-below', x: minX - tipSize.w - gap, y: maxY + gap },
    { id: 'right-above', x: maxX + gap, y: minY - tipSize.h - gap },
    { id: 'left-above', x: minX - tipSize.w - gap, y: minY - tipSize.h - gap },
  ];

  const obstacles = chromeObstacles();

  /* The gizmo is the one overlay the card must never park on: the handles
     are the entire edit surface, and a card sitting on the vertical arrow
     makes the part uneditable while LOOKING like a working label. The
     footprint positionGizmo publishes is sampled into points — the ring
     band, the hub, and each arm's run out to its tag — and a candidate is
     charged for the FRACTION of handle points it would cover. Points
     rather than a bounding box because the diagonal notches between arms
     are exactly where a card next to a small part belongs, and only the
     drawn shape knows where they are. */
  const gizmoPts = [];
  if (!gizmoHidden && gizmoFootprint) {
    const g = gizmoFootprint;
    const RING_SAMPLES = 16;
    const ARM_STEP = 14;
    for (let a = 0; a < RING_SAMPLES; a++) {
      const t = (a / RING_SAMPLES) * Math.PI * 2;
      gizmoPts.push({ x: g.x + Math.cos(t) * g.ringR, y: g.y + Math.sin(t) * g.ringR });
    }
    gizmoPts.push({ x: g.x, y: g.y });
    for (const arm of g.arms) {
      const adx = arm.x - g.x, ady = arm.y - g.y;
      const n = Math.max(2, Math.ceil(Math.hypot(adx, ady) / ARM_STEP));
      for (let i = 1; i <= n; i++) {
        gizmoPts.push({ x: g.x + (adx * i) / n, y: g.y + (ady * i) / n });
      }
    }
  }

  /* One scorer for every candidate INCLUDING the incumbent. These were two
     copies of the same arithmetic; whenever a term was added to one and not
     the other the hysteresis compared two different things and the card
     stuck to a placement the sweep had already rejected. */
  function place(c, i) {
    // Clamp into the viewport FIRST, then score — a candidate is judged on
    // where it would actually end up, not where it wished to be.
    const x = Math.max(pad, Math.min(w - tipSize.w - pad, c.x));
    const y = Math.max(pad, Math.min(h - tipSize.h - pad, c.y));
    const rect = { x: x, y: y, w: tipSize.w, h: tipSize.h };

    /*
     * Every penalty is expressed as a FRACTION of the card's own area, so
     * the terms are commensurable and the weights mean something.
     *
     * They were raw pixel-areas against a raw pixel-distance, which is an
     * apples-to-oranges comparison the area always wins: a card covering
     * geometry scores ~100000 while being dragged 150px off its anchor
     * scores ~6000, so the placement fled to whatever empty corner existed
     * and read as a floating panel rather than a label on a part.
     *
     * Each weight is now "how many pixels of displacement is this worth
     * avoiding", divided through by the displacement rate below:
     *   - behind chrome: 1500px — never acceptable, always worth fleeing
     *   - over the subject: 300px — the card must not hide its own subject
     *   - over other geometry: 100px — a real cost, but a tie-breaker
     */
    const area = Math.max(1, tipSize.w * tipSize.h);
    const RATE = 40;
    let score = 0;
    // Overlapping the app's own chrome is the thing to avoid above all
    // else: the card disappears behind it and looks broken.
    let chrome = 0;
    for (const o of obstacles) chrome += overlapArea(rect, o);
    score += Math.min(1, chrome / area) * 1500 * RATE;
    // Covering the gizmo is covering the controls: worse than covering
    // the subject (a hidden part is a shame, an unusable handle is a
    // broken tool), better only than vanishing under chrome. The margin
    // widens the card by the grab corridor's half-width so "beside a
    // handle" also means "not pressed against it".
    if (gizmoPts.length > 0) {
      const margin = GIZMO.grabWidth / 2;
      let covered = 0;
      for (const q of gizmoPts) {
        if (
          q.x >= rect.x - margin && q.x <= rect.x + rect.w + margin &&
          q.y >= rect.y - margin && q.y <= rect.y + rect.h + margin
        ) covered++;
      }
      score += (covered / gizmoPts.length) * 600 * RATE;
    }
    // Covering the part it describes is the second worst outcome.
    score += Math.min(1, overlapArea(rect, box) / area) * 300 * RATE;
    // Covering any OTHER part is a lesser sin than covering the subject but
    // a real one — enough to pick the clearer of two equally close slots,
    // not enough to abandon the part it is labelling.
    score += Math.min(1, occludedArea(rect) / area) * 100 * RATE;
    // Being dragged far from where it wanted to sit reads as arbitrary.
    score += (Math.abs(x - c.x) + Math.abs(y - c.y)) * RATE;
    // Gentle preference for earlier candidates, small enough that it only
    // decides genuine ties.
    score += i * 30;
    return { id: c.id, x: x, y: y, score: score };
  }

  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const cand = place(candidates[i], i);
    if (!best || cand.score < best.score) best = cand;
  }

  /* Commit to the chosen side until another is clearly better.
     Without this the card swaps sides every time the score crosses over
     during an orbit, which looks like a flicker rather than a decision. */
  if (tipPlacement && tipPlacement.id !== best.id) {
    const keep = candidates.findIndex((c) => c.id === tipPlacement.id);
    if (keep >= 0) {
      const held = place(candidates[keep], keep);
      const x = held.x, y = held.y, score = held.score;
      // The incumbent has to be beaten by a real margin, not a rounding
      // error, before the card is allowed to jump.
      /* Margin in the same currency as everything else: the incumbent
         keeps the slot unless the challenger is worth more than 60px of
         displacement. Tuned against the old raw-area scale it was
         effectively zero. */
      if (score < best.score + 60 * 40) best = { id: tipPlacement.id, x: x, y: y, score: score };
    }
  }
  tipPlacement = best;

  /* Ease toward the target instead of snapping to it. The card is chasing a
     projection that moves every frame; interpolating makes it feel attached
     to the part rather than teleporting alongside it. The factor is high
     enough that it never lags noticeably behind a fast orbit. */
  if (!tipAt || tipAt.id !== best.id) tipAt = { id: best.id, x: best.x, y: best.y };
  else {
    tipAt.x += (best.x - tipAt.x) * 0.35;
    tipAt.y += (best.y - tipAt.y) * 0.35;
    if (Math.abs(best.x - tipAt.x) > 0.4 || Math.abs(best.y - tipAt.y) > 0.4) invalidate();
  }

  tip.style.left = Math.round(tipAt.x) + 'px';
  tip.style.top = Math.round(tipAt.y) + 'px';
  tip.classList.add('on');

  /*
   * Leader line, drawn only when the card has been pushed away.
   *
   * When the card sits flush beside the part the gap alone reads as
   * attachment. Once dodging the rail or the viewport edge moves it a real
   * distance, that reading breaks — it becomes a panel that happens to be
   * on screen. A leader restores the relationship, and drawing it ONLY in
   * that case keeps it from being decoration the rest of the time.
   *
   * It runs from the nearest point on the card's edge to the nearest
   * corner of the part's own projected footprint, which is the shortest
   * honest connection and never crosses the card.
   */
  if (tipLead) {
    const card = { x: tipAt.x, y: tipAt.y, w: tipSize.w, h: tipSize.h };
    // Closest point on the part's box to the card's centre, and vice versa.
    const ccx = card.x + card.w / 2, ccy = card.y + card.h / 2;
    const ax = Math.max(box.x, Math.min(box.x + box.w, ccx));
    const ay = Math.max(box.y, Math.min(box.y + box.h, ccy));
    const bx = Math.max(card.x, Math.min(card.x + card.w, ax));
    const by = Math.max(card.y, Math.min(card.y + card.h, ay));
    const span = Math.hypot(bx - ax, by - ay);
    // Below this the card is effectively touching the part and a line
    // would only add clutter.
    const show = span > 26;
    tipLead.setAttribute('x1', ax.toFixed(1));
    tipLead.setAttribute('y1', ay.toFixed(1));
    tipLead.setAttribute('x2', bx.toFixed(1));
    tipLead.setAttribute('y2', by.toFixed(1));
    tipLead.style.opacity = show ? '1' : '0';
    if (tipLeadDot) {
      tipLeadDot.setAttribute('cx', ax.toFixed(1));
      tipLeadDot.setAttribute('cy', ay.toFixed(1));
      tipLeadDot.style.opacity = show ? '1' : '0';
    }
  }
  // The map is a projection, so it belongs to the per-frame pass with the
  // gizmo — not to the rebuild-on-selection pass.
  positionMap();
}

/** Selection changed: rebuild both overlays. */
function updateTip() { buildTip(); buildGizmo(); }

/* Grow the selection outward by one ring of contact. This was a button in
   the card; as a key it costs no space and composes — press it twice and
   the selection walks two joints out from where you started. */
function selectTouching() {
  const names = [...state.selection];
  const anchor = names[names.length - 1];
  if (!anchor || !renderer) return;
  selectPart([...new Set([...names, ...touchingParts(renderer, anchor).map((n) => n.name)])], 'set');
}

function setXray(on) {
  state.xray = !!on;
  // Tween from wherever the fade currently sits, so a fast re-toggle reverses
  // smoothly instead of jumping.
  xrayFrom = state.xrayMix || 0;
  xrayTo = state.xray ? 1 : 0;
  xrayAt = performance.now();
  // The button is removed on an empty kit, but the X shortcut is still
  // bound — so the toggle has to survive its own control not existing.
  const btn = document.getElementById('xray');
  if (btn) btn.setAttribute('aria-pressed', state.xray ? 'true' : 'false');
  invalidate();
}
document.getElementById('xray').addEventListener('click', () => setXray(!state.xray));

/* The colour modes, each answering a different question — not three recolours
   of one fact: curvature reads how the form is built, normals flags faces
   pointing the wrong way, clearance finds gaps and buried parts. Each carries
   its own legend ramp because its colour LANGUAGE differs (diverging, binary,
   sequential+alarm); the legend states the ends, the menu states the purpose. */
/* Injected from src/viewer/xray-modes.ts — the ONE mode catalogue this
   page shares with the host compile panel (via its contracts mirror). */
const XRAY_MODES = ${xrayModesJson};

function closeXrayMenu() {
  const menu = document.getElementById('xrayMenu');
  const caret = document.getElementById('xrayCaret');
  if (menu) menu.hidden = true;
  if (caret) caret.setAttribute('aria-expanded', 'false');
}
/* Keep the menu fully on screen. It is right-anchored to the caret, so on a
   wide viewport it never touches the right edge, but on a narrow one its left
   side can run past 0. Measure the natural rect (with the clamp offset zeroed)
   and, if either edge spills, translate it back inside a small margin. Only X
   is corrected here: the menu opens upward from a bottom bar, so top/bottom are
   handled by max-height. Correcting via a CSS var keeps the entrance animation
   intact (the keyframe folds --mdx into its transform). */
function positionXrayMenu() {
  const menu = document.getElementById('xrayMenu');
  if (!menu || menu.hidden) return;
  const margin = 10;
  menu.style.setProperty('--mdx', '0px');
  const r = menu.getBoundingClientRect();
  let dx = 0;
  if (r.left < margin) dx = margin - r.left;
  else if (r.right > window.innerWidth - margin) dx = (window.innerWidth - margin) - r.right;
  if (dx) menu.style.setProperty('--mdx', dx.toFixed(1) + 'px');
}
function openXrayMenu() {
  const menu = document.getElementById('xrayMenu');
  const caret = document.getElementById('xrayCaret');
  if (menu) menu.hidden = false;
  if (caret) caret.setAttribute('aria-expanded', 'true');
  positionXrayMenu();
}

/* Build the mode menu from XRAY_MODES, so the caret, the number keys and the
   legend all read from one source of truth. Each row names the mode, says what
   it is FOR, and shows its number key — the point is that the tool explains
   what each colour lens answers without a manual. */
function buildXrayMenu() {
  const menu = document.getElementById('xrayMenu');
  if (!menu) return;
  menu.textContent = '';
  XRAY_MODES.forEach((m, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'xray-menu-item';
    item.setAttribute('role', 'menuitemradio');
    item.dataset.mode = String(i);
    const text = document.createElement('span');
    text.className = 'mi-text';
    const name = document.createElement('span');
    name.className = 'mi-name';
    name.textContent = m.name;
    const desc = document.createElement('span');
    desc.className = 'mi-desc';
    desc.textContent = m.desc;
    const ramp = document.createElement('span');
    ramp.className = 'mi-ramp';
    ramp.style.background = m.ramp;
    text.append(name, desc, ramp);
    const key = document.createElement('span');
    key.className = 'mi-key';
    // The chord, spelled out: hold X, press the digit.
    key.textContent = 'X' + (i + 1);
    item.append(text, key);
    item.addEventListener('click', () => {
      setXrayMode(i);
      if (!state.xray) setXray(true);
      closeXrayMenu();
    });
    menu.append(item);
  });
}

function setXrayMode(i) {
  state.xrayMode = ((i % XRAY_MODES.length) + XRAY_MODES.length) % XRAY_MODES.length;
  const menu = document.getElementById('xrayMenu');
  if (menu) {
    for (const item of menu.querySelectorAll('.xray-menu-item')) {
      item.setAttribute('aria-checked', Number(item.dataset.mode) === state.xrayMode ? 'true' : 'false');
    }
  }
  invalidate();
}

{
  buildXrayMenu();
  setXrayMode(0);
  const caret = document.getElementById('xrayCaret');
  const menu = document.getElementById('xrayMenu');
  if (caret) {
    caret.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu && menu.hidden) openXrayMenu();
      else closeXrayMenu();
    });
  }
  // The menu is a transient picker, not a panel: any click outside it, or
  // Escape, dismisses it.
  document.addEventListener('click', (e) => {
    const cluster = document.getElementById('xrayCluster');
    if (menu && !menu.hidden && cluster && !cluster.contains(e.target)) closeXrayMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeXrayMenu();
  });
  // Re-clamp against the edges if the viewport changes while the menu is open.
  window.addEventListener('resize', () => { if (menu && !menu.hidden) positionXrayMenu(); });
}

/* Step to the next part the compiler flagged, and frame it.
   Selecting alone is not enough — the part may be behind the camera or off
   screen entirely, which is precisely the situation this exists to fix. */
function gotoFaulted() {
  if (!faultedParts.length || !renderer) return;
  faultedAt = (faultedAt + 1) % faultedParts.length;
  const name = faultedParts[faultedAt];
  const draw = renderer.draws.find((d) => d.name === name);
  if (!draw) return;
  selectPart(name, 'replace');
  // Centre the view on it without changing how far away the camera is: a
  // jump that also re-zooms makes it hard to tell what moved.
  const c = drawCenter(draw);
  const b = renderer.bounds || { center: [0, 0, 0] };
  state.pan = [c[0] - b.center[0], c[1] - b.center[1], c[2] - b.center[2]];
  invalidate();
}
const jumpBtn = document.getElementById('jump');
if (jumpBtn) jumpBtn.addEventListener('click', gotoFaulted);

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Never while a number is being typed — letters are unit characters there.
  if (typed !== '') return;
  // !e.repeat: a held key autorepeats. Without the guard, holding A ratchets
  // selectTouching outward across the scene frame after frame.
  if ((e.key === 'a' || e.key === 'A') && !e.repeat) { selectTouching(); e.preventDefault(); }
  if (e.key === 'x' || e.key === 'X') {
    // X is a chord leader, not an instant toggle: hold it and press 1/2/3 to
    // pick a mode; tap it alone to toggle (on release, in the keyup below).
    // Toggling on release is what lets the same key start a chord without also
    // flipping x-ray the instant it goes down.
    if (!e.repeat) { xHeld = true; xChordUsed = false; }
    e.preventDefault();
  }
  /* X+1 / X+2 / X+3: pick a colour mode, turning x-ray on if it was off. The
     typed==='' guard above means a digit meant for a measurement is never
     stolen; xHeld means bare digits do nothing. */
  if (xHeld && e.key >= '1' && e.key <= String(XRAY_MODES.length)) {
    setXrayMode(Number(e.key) - 1);
    if (!state.xray) setXray(true);
    xChordUsed = true;
    e.preventDefault();
  }
  /* G for the handles. Same guards as the others: no modifier, and never
     while a number is being typed, where letters are unit characters. */
  // !e.repeat, same reason as X and A: a held G autorepeats and flickers the
  // handles on and off rather than toggling once.
  if ((e.key === 'g' || e.key === 'G') && !e.repeat) { setGizmoHidden(!gizmoHidden); e.preventDefault(); }
});

/* Release of the chord leader: a clean tap (no digit pressed during the hold)
   toggles x-ray; a chord already did its work on the digit and must not also
   toggle. A lost window focus clears the hold so it cannot wedge. */
window.addEventListener('keyup', (e) => {
  if (e.key === 'x' || e.key === 'X') {
    if (xHeld && !xChordUsed) setXray(!state.xray);
    xHeld = false;
  }
});
window.addEventListener('blur', () => { xHeld = false; });

try {
  renderer = createRenderer(canvas);
  /* The zoom clamp is expressed in scene radii, so the controls need the
     model's bounds. Read through an accessor rather than captured, because
     the renderer is replaced whenever a different asset is selected. */
  attachControls(
    canvas,
    state,
    invalidate,
    () => (renderer ? renderer.bounds : null),
    // The gizmo covers the viewport and its handles carry pointer-events,
    // so without this a wheel over a handle reaches nothing at all.
    [gizmo],
  );
  window.addEventListener('resize', () => { invalidateChrome(); invalidate(); });
  /* The host panel resizes without a window resize (splitter drags, rail
     toggles in the embedding document). The canvas box is the truth every
     projection and px-per-world formula reads, so watch IT — otherwise
     the raster, aspect, and gizmo math stay pinned to the stale size
     until the next unrelated interaction. */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { invalidateChrome(); invalidate(); }).observe(canvas);
  }

  /* A GPU context can be taken away at any time — driver reset, laptop
     sleep, the browser reclaiming contexts from a backgrounded tab. It
     presents as the model silently vanishing with no error, so the viewer
     rebuilds itself from the bytes it already holds and reapplies the
     user's unsaved edits. Camera, selection and undo history are plain JS
     state and survive untouched. */
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      renderer = createRenderer(canvas);
      if (lastGlb) loadModel(renderer, lastGlb);
      applyEditsToDraws();
      invalidate();
    } catch (err) {
      document.getElementById('meta').textContent = 'could not restore view: ' + err.message;
    }
  }, false);

  /* Hover cue, borrowed from SketchUp: the part under the cursor lifts
     slightly before you commit to anything. It answers "what am I about to
     click" for free, with no chrome and nothing to dismiss — which is what
     makes an unfamiliar asset explorable rather than a guessing game.
     Picking is a ray/AABB test against a handful of parts, so this is
     cheap; it still only redraws when the answer actually changes. */
  canvas.addEventListener('pointermove', (e) => {
    // While space-panning, the pan cursor (grab/grabbing) owns the canvas —
    // the part-hover pointer must not fight it back to a click affordance.
    if (dragging || state.spaceHeld) return;
    const hit = pickPart(renderer, state, canvas, e.clientX, e.clientY);
    const name = hit ? hit.name : null;
    if (name === state.hover) return;
    state.hover = name;
    canvas.style.cursor = name ? 'pointer' : '';
    invalidate();
  });
  canvas.addEventListener('pointerleave', () => {
    if (state.hover === null) return;
    state.hover = null;
    invalidate();
  });

  /* Click = pick. Drag on an ALREADY-SELECTED part = move the selection
     (ground plane; Shift lifts; Ctrl snaps to 5mm). Drag anywhere else =
     orbit, which attachControls owns — suppressed only while part-dragging.

     Two rules exist purely so nothing moves by accident: a part must
     already be selected before it can be dragged (so the first click on
     anything is always harmless), and the drag must pass a small threshold
     before it becomes an edit (so a shaky click never nudges geometry).
     Escape mid-drag restores the pre-drag position. */
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > DRAG_THRESHOLD || e.button !== 0) return;
    const hit = pickPart(renderer, state, canvas, e.clientX, e.clientY);
    selectPart(hit ? hit.name : null, e.shiftKey ? 'add' : 'replace');
  });

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') {
      if (dragging) endDrag(true);
      else selectPart(null);
    }
  });
} catch (err) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = 'WebGL2 is unavailable here: ' + err.message;
  document.body.appendChild(p);
}

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('save').addEventListener('click', saveEdits);
document.getElementById('bake').addEventListener('click', bakeScene);
document.getElementById('reset').addEventListener('click', async () => {
  const btn = document.getElementById('reset');
  // Clearing locally also clears the persisted file, so Reset is a real
  // undo rather than a "looks undone until the next compile". That means
  // the server call is the part that matters, and it has to be allowed to
  // fail loudly — a viewport that looks reset while the file still holds
  // the old tweaks is the tool lying about what it did.
  const base = apiBase();
  const hadPersisted = Object.keys(bakedTweaks).length > 0 || Object.keys(savedAtLoad).length > 0;
  if ((base || canHostBridge()) && hadPersisted) {
    const body = { tweaks: {} };
    if (currentEntry && currentEntry.scenePath) body.scenePath = currentEntry.scenePath;
    btn.textContent = 'Resetting…';
    try {
      if (preferHostBridge() || !base) {
        await hostTweaksRequest('save', body);
      } else {
        try {
          const resp = await fetch(base + '/scene3d/tweaks', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
        } catch (fetchErr) {
          if (!canHostBridge()) throw fetchErr;
          await hostTweaksRequest('save', body);
        }
      }
    } catch (_) {
      btn.textContent = 'Reset failed — retry';
      return;
    }
    btn.textContent = 'Reset';
    bakedTweaks = {};
  }
  edits = {};
  savedAtLoad = {};
  history.length = 0; historyAt = 0;
  applyEditsToDraws();
  refreshEditButtons();
  updateTip();
  invalidate();
});

/* Rail toggle */
const rail = document.getElementById('rail');
const railToggle = document.getElementById('railToggle');
function setRail(open) {
  rail.classList.toggle('hidden', !open);
  railToggle.classList.toggle('rail-open', open);
  /* The rail is the largest thing the card has to dodge. When it collapses,
     the space it occupied becomes available again — without re-measuring,
     the card keeps avoiding a panel that is no longer on screen. The
     transition is 180ms, so re-measure after it settles as well as now. */
  invalidateChrome();
  invalidate();
  setTimeout(() => { invalidateChrome(); invalidate(); }, 220);
}
railToggle.addEventListener('click', () => setRail(true));
document.getElementById('railHide').addEventListener('click', () => setRail(false));
// A single-asset kit has nothing to browse; both the rail and the control
// that reveals it would be pure chrome.
const browsable = KIT.entries.length > 1;
railToggle.hidden = !browsable;
setRail(browsable && window.innerWidth >= 640);

/* No in-page download control. The host reads this kit's deliverable paths
   off the artifact sidecar and serves them from its own Export menu, so the
   page carries exactly one job: the viewport. A second download surface here
   would drift from the host's the first time either changed. */

/* The no-modal discard ask (see the guard inside select): which entry is
   armed for a confirming second click, and the timer that stands it down. */
let discardArmedEntry = null;
let discardArmedTimer = 0;

async function select(entry, button) {
  // Switching assets throws away the current one's unsaved edits.
  // Silently discarding a user's work because they clicked the wrong row
  // is not defensible — but neither is confirm(): in the sandboxed srcdoc
  // mount this page documents, a sandbox without allow-modals makes
  // confirm() return false WITHOUT SHOWING ANYTHING, which locked asset
  // switching completely the moment anything was dirty. So the ask lives
  // in the row itself: the first click arms it and says so, a second
  // click within the window is the answer.
  if (entry !== currentEntry && dirty()) {
    if (discardArmedEntry !== entry) {
      discardArmedEntry = entry;
      clearTimeout(discardArmedTimer);
      const label = button && button.querySelector('.label');
      if (label) {
        if (!label.dataset.restore) label.dataset.restore = label.textContent;
        label.textContent = 'discard edits?';
      }
      discardArmedTimer = setTimeout(() => {
        discardArmedEntry = null;
        if (label && label.dataset.restore) {
          label.textContent = label.dataset.restore;
          delete label.dataset.restore;
        }
      }, 3000);
      return;
    }
    clearTimeout(discardArmedTimer);
    const armedLabel = button && button.querySelector('.label');
    if (armedLabel && armedLabel.dataset.restore) {
      armedLabel.textContent = armedLabel.dataset.restore;
      delete armedLabel.dataset.restore;
    }
  }
  discardArmedEntry = null;
  for (const other of document.querySelectorAll('.chip')) other.setAttribute('aria-pressed', 'false');
  if (button) button.setAttribute('aria-pressed', 'true');
  currentEntry = entry;
  /* Selection is per-model. Carrying it across a switch would leave the
     gizmo and the in-world label pointing at a part name that no longer
     exists in the scene. 'force' overrides the pin: these parts stop
     existing, so "never leave" cannot apply. */
  selectPart(null, 'force');
  history.length = 0; historyAt = 0;
  edits = {}; savedAtLoad = {};
  /* Gallery balls were painted from the outgoing model's draws and
     textures; the incoming one repaints its own. */
  matGalleryCanvases.clear();
  // Fire and forget: it only gates the Save button, and the model should
  // not wait on it to appear.
  loadBakedTweaks(entry);
  refreshEditButtons();
  document.getElementById('part').textContent = '';

  updateIdent(entry, null);
  if (!renderer) return;
  try {
    const response = await fetch(entry.glb);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    lastGlb = await response.arrayBuffer();
    const stats = loadModel(renderer, lastGlb);
    /*
     * Edits attach to the DRAWS, so a freshly loaded model has to be given
     * them again.
     *
     * The saved-edit fetch is deliberately fire-and-forget — the model must
     * not wait on it — which means the two finish in whichever order the
     * network decides. When the fetch won, the edits were applied to a draw
     * list that did not exist yet and silently did nothing: the part sat at
     * its original position while the card correctly reported it as moved.
     * Re-applying here removes the race entirely rather than ordering it,
     * because "a new model needs the current edits" is true however it got
     * loaded.
     */
    applyEditsToDraws();
    refreshEditButtons();
    state.distance = renderer.bounds.radius * 3.2;
    state.pan = [0, 0, 0];
    /* One-shot restore of the pre-reload camera and selection, consumed on
       the FIRST model load only: it must beat the framing default above,
       and it must not follow the user to a different scene they open next.
       Every number is validated and the distance re-clamped to this scene's
       zoom range — the reload may be showing a recompiled, resized asset. */
    if (pendingViewCam) {
      const cam = pendingViewCam;
      pendingViewCam = null;
      if (Array.isArray(cam) && cam.length === 6 && cam.every(Number.isFinite)) {
        state.azimuth = cam[0];
        state.elevation = Math.max(-1.5, Math.min(1.5, cam[1]));
        const range = zoomRange(renderer.bounds);
        state.distance = Math.min(range.max, Math.max(range.min, cam[2]));
        state.pan = [cam[3], cam[4], cam[5]];
      }
    }
    if (pendingViewSel) {
      const names = pendingViewSel.filter(
        (n) => typeof n === 'string' && renderer.draws.some((d) => d.name === n),
      );
      pendingViewSel = null;
      for (let k = 0; k < names.length; k++) selectPart(names[k], k === 0 ? 'replace' : 'add');
    }
    updateIdent(entry,
      stats.parts + (stats.parts === 1 ? ' part · ' : ' parts · ') +
      stats.tris.toLocaleString() + (stats.tris === 1 ? ' tri' : ' tris'));
    /* The host needs the inventory before anything is clicked, and loading
       an asset genuinely does change the selection — to nothing. Emitting
       here rather than adding a second message type keeps one shape on the
       wire. */
    broadcastSelection();
    invalidate();
  } catch (err) {
    updateIdent(entry, 'could not load: ' + err.message);
  }
}

/**
 * The identity line: the name IS the verdict (green compiles clean, red has
 * issues), and everything else — stats, issue codes — is the hover title.
 * The same line is posted to a hosting parent; if the host acknowledges, it
 * owns the display and the in-page chip hides to give the viewport the
 * corner back. A standalone export has no host, keeps the chip, loses
 * nothing.
 */
function updateIdent(entry, statsText) {
  const ok = entry.ok !== false;
  const verdictText =
    entry.ok === undefined ? '' : ok ? 'compiles clean' : ((entry.issueCodes || []).join(' · ') || 'has issues');
  const name = document.getElementById('name');
  name.textContent = entry.name;
  name.className = 'name' + (entry.ok === undefined ? '' : ok ? ' ok' : ' bad');
  // The verdict phrase is the one thing the colour already says, so IT is
  // what moves to hover. Parts and triangles stay on screen: this is a
  // modelling viewer, and those numbers are the reading on the dial.
  name.title = verdictText;
  /* The claims shield: scene.json asserted properties and the census
     proved every one — the strongest statement a compile can make about
     itself, worn as two quiet characters. A failed claim shows nothing
     here (the verdict colour and issue codes already own failure), and a
     scene with no claims shows nothing at all — the badge cannot be
     cheapened by appearing by default. The checked count gates it the
     same way: a claim nobody adjudicated (no census) is not held, so an
     unadjudicated ledger earns no shield. The checked count must be
     PRESENT and full — every manifest this compiler writes carries it, so
     an absent count means a manifest that predates adjudication counting,
     and an unknown is never worn as a pass. A stale page loses its
     shield until the recompile that can actually vouch for it. */
  const proven =
    entry.claims && entry.claims.declared > 0 && entry.claims.failed === 0 &&
    entry.claims.checked === entry.claims.declared
      ? entry.claims.declared
      : 0;
  const meta = document.getElementById('meta');
  meta.textContent = (statsText || '') + (proven > 0 ? ' · ✓' + proven : '');
  meta.title = proven > 0
    ? proven + ' claim' + (proven === 1 ? '' : 's') + ' declared in scene.json, all proven against the measured build'
    : '';

  /*
   * Route to the broken part, don't just report that one exists.
   *
   * Every diagnostic in this viewer used to be gated on selection: the card
   * only exists once you have clicked something, so a scene with thirty-nine
   * clean parts and one broken one showed nothing at all until you happened
   * to click the broken one. The verdict colour said "something is wrong"
   * and then left you to find it by hunting.
   *
   * This makes the count itself the way there. It is silent when the scene
   * is clean — no new chrome, no shouting — and when it is not, clicking
   * steps to the next affected part, so "where" is one click rather than a
   * search.
   */
  const jump = document.getElementById('jump');
  const faulted = Object.keys(entry.partIssues || {}).filter((n) =>
    renderer && renderer.draws.some((d) => d.name === n),
  ).sort();
  faultedParts = faulted;
  faultedAt = -1;
  if (jump) {
    if (faulted.length === 0) jump.hidden = true;
    else {
      jump.hidden = false;
      // Not "N parts" — the chip already says how many parts the scene
      // has, two words to the left, and the two counts differ.
      jump.textContent = faulted.length + ' flagged';
      const nl = String.fromCharCode(10);
      jump.title = 'Go to the affected part' + (faulted.length > 1 ? 's' : '') +
        ':' + nl + faulted.join(nl);
    }
  }
  try {
    window.parent.postMessage({
      type: 'od:scene3d-ident',
      name: entry.name,
      ok: entry.ok !== false,
      known: entry.ok !== undefined,
      meta: statsText || '',
      detail: verdictText,
      // The derived asset kind, so the host toolbar chip can draw the
      // same kind glyph the compile panel does.
      kind: entry.kind || null,
    }, '*');
  } catch (_) {}
}

window.addEventListener('message', (e) => {
  // Only the embedding parent may flip hosted mode: any frame can post a
  // message, and an unchecked ack would let a stranger hide the chrome.
  if (e && e.source === window.parent && e.data && e.data.type === 'od:scene3d-ident-ack') {
    document.body.classList.add('hosted');
  }
});

/* Kind glyphs — the same drawn vocabulary the host panel's kind chip uses
   (static here: the rail is a list, not a stage). Inline strings because
   this page is self-contained; keep the paths in step with KindGlyphArt in
   Scene3dPanel.tsx. */
const KIND_SVG_OPEN = '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const KIND_GLYPHS = {
  animation: KIND_SVG_OPEN + '<circle cx="8" cy="8" r="6.2"/><path d="M6.7 5.7l4 2.3-4 2.3z" fill="currentColor" stroke="none"/></svg>',
  prop: KIND_SVG_OPEN + '<path d="M8 1.9 13.5 5v6L8 14.1 2.5 11V5z"/><path d="M2.5 5 8 8.1 13.5 5M8 8.1v6"/></svg>',
  kit: KIND_SVG_OPEN + '<rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/><rect x="5.5" y="2" width="5" height="5" rx="1"/></svg>',
  texture: KIND_SVG_OPEN + '<rect x="2" y="2" width="12" height="12" rx="2"/><rect x="2.9" y="2.9" width="5.1" height="5.1" fill="currentColor" stroke="none" opacity="0.55"/><rect x="8" y="8" width="5.1" height="5.1" fill="currentColor" stroke="none" opacity="0.55"/></svg>',
  skybox: KIND_SVG_OPEN + '<circle cx="8" cy="8" r="6.2"/><path d="M2 9.6c2-1.5 4-1.5 6 0s4 1.5 6 0"/><circle cx="10.4" cy="5.4" r="1.4" fill="currentColor" stroke="none"/></svg>',
  sprite: KIND_SVG_OPEN + '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M8 2v12M2 8h12"/><rect x="3.6" y="3.6" width="3" height="3" rx="0.8" fill="currentColor" stroke="none"/></svg>',
  flipbook: KIND_SVG_OPEN + '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M8 3v10"/></svg>',
  vfx: KIND_SVG_OPEN + '<path d="M8 1.8v3.4M8 10.8v3.4M1.8 8h3.4M10.8 8h3.4"/><path d="M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12"/></svg>',
  scene: KIND_SVG_OPEN + '<ellipse cx="8" cy="12.2" rx="5.9" ry="1.8"/><path d="M8 2.2 12.1 4.5v4L8 10.9 3.9 8.5v-4z"/><path d="M3.9 4.5 8 6.9l4.1-2.4M8 6.9v4"/></svg>',
};
/* Per-row kind glyphs earn their pixels only when the kit MIXES kinds — a
   rail of twelve identical cubes is noise; prop-vs-animation-vs-texture is
   information. */
const mixedKinds = new Set(KIT.entries.map((e) => e.kind || 'scene')).size > 1;

const host = document.getElementById('catalog');
const groups = new Map();
for (const entry of KIT.entries) {
  if (!groups.has(entry.category)) groups.set(entry.category, []);
  groups.get(entry.category).push(entry);
}
let first = null;
/* Every rail row, so the boot can reopen the entry a reload interrupted. */
const railRows = [];
for (const [category, entries] of groups) {
  const heading = document.createElement('div');
  heading.className = 'group';
  heading.textContent = category;
  host.appendChild(heading);
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.setAttribute('aria-pressed', 'false');
    button.title = entry.name;

    // A failing asset gets a dot rather than its codes: the rail is for
    // choosing what to look at, and the codes are already on the asset.
    const dot = document.createElement('span');
    dot.className = 'dot' + (entry.ok === false ? '' : ' ok');
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = entry.name;
    button.append(dot, label);
    if (mixedKinds && entry.kind && KIND_GLYPHS[entry.kind]) {
      const kglyph = document.createElement('span');
      kglyph.className = 'kindg';
      kglyph.innerHTML = KIND_GLYPHS[entry.kind];
      kglyph.title = entry.kind;
      button.appendChild(kglyph);
    }
    if (typeof entry.parts === 'number') {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(entry.parts);
      button.appendChild(n);
    }

    button.addEventListener('click', () => select(entry, button));
    chips.appendChild(button);

    /* Part tree — the USD stage breakdown, folded under the scene row.
       Rendered lazily on first expand: a four-scene kit with 150 parts
       should not pay 600 DOM rows to draw a closed rail. Rows select the
       part in the viewport (switching scene first when needed); the hover
       title carries the prim path, type, and face count; alt-click copies
       the prim path — the exact handle usdview and scripting want. */
    if (entry.tree && entry.tree.length) {
      const caret = document.createElement('span');
      caret.className = 'caret';
      caret.setAttribute('role', 'button');
      caret.setAttribute('aria-label', 'Toggle part tree');
      caret.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" style="display:block" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
      button.insertBefore(caret, button.firstChild);
      const treeHost = document.createElement('div');
      treeHost.className = 'tree';
      treeHost.hidden = true;
      chips.appendChild(treeHost);
      let built = false;
      const toggleTree = (e) => {
        e.stopPropagation();
        if (!built) { built = true; buildTree(treeHost, entry, button); }
        treeHost.hidden = !treeHost.hidden;
        caret.classList.toggle('open', !treeHost.hidden);
        syncTreeSelection();
        syncRailFade();
      };
      caret.addEventListener('click', toggleTree);
      button.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' && treeHost.hidden) toggleTree(e);
        else if (e.key === 'ArrowLeft' && !treeHost.hidden) toggleTree(e);
      });
    }
    if (!first) first = { entry: entry, button: button };
    railRows.push({ entry: entry, button: button });
  }
  host.appendChild(chips);
}

/** Prim paths from the flat parent list, e.g. "/crate/lid/prp_handle". */
function primPaths(tree) {
  const byName = new Map(tree.map((p) => [p.n, p]));
  const paths = new Map();
  const pathOf = (node, guard) => {
    if (paths.has(node.n)) return paths.get(node.n);
    if (guard.has(node.n)) return '/' + node.n; // cycle: fall back to root form
    guard.add(node.n);
    const parent = node.p !== null ? byName.get(node.p) : undefined;
    const full = (parent ? pathOf(parent, guard) : '') + '/' + node.n;
    paths.set(node.n, full);
    return full;
  };
  for (const node of tree) pathOf(node, new Set());
  return paths;
}

/*
 * A trailing naming token: an ordinal (_1, _f2, blade3) or a position
 * (_left, _fl, _upper, _side…). Stripped at most twice, so mirror-and-
 * corner families like bracket_bl_side / bracket_fr_top meet at
 * "bracket", while distinct prototypes with real names never merge. The
 * stem must keep at least four characters — collapsing to a fragment
 * groups things that share letters, not identity.
 */
const TREE_STEM_SUFFIX =
  /[._-](?:[a-z]*\d+|l|r|fl|fr|bl|br|left|right|front|back|top|bottom|upper|lower|mid|middle|side|end|a|b|c|xn|xp|yn|yp|zn|zp)$/i;

function protoStem(name) {
  let stem = String(name);
  for (let i = 0; i < 2; i++) {
    const next = stem.replace(TREE_STEM_SUFFIX, '');
    if (next === stem || next.length < 4) break;
    stem = next;
  }
  return stem;
}

/*
 * The rail tree, shaped around what a part inventory actually IS.
 *
 * An asset's parts form a DAG: a few prototypes instanced many times —
 * mirrored brackets, rivet rings, repeat-grid clones. One row per
 * instance turned a 66-part crate into a scroll fest where the eighth
 * bracket row communicated nothing the first didn't. So sibling LEAVES
 * that are instances of one prototype (same census type, names differing
 * only by trailing ordinal/position tokens, three or more of them)
 * render as ONE row: the prototype name and an instance count. Clicking
 * it selects every instance — which is also the edit a user reaching for
 * "the rivets" almost always means; individual instances stay reachable
 * by clicking them in the viewport. True hierarchy is never grouped:
 * structure is meaning, multiplicity is noise.
 */
function buildTree(treeHost, entry, chipButton) {
  const tree = entry.tree || [];
  const byParent = new Map();
  for (const node of tree) {
    const key = node.p !== null && tree.some((t) => t.n === node.p) ? node.p : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }
  const paths = primPaths(tree);

  const icons = {
    a: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.8 1.1l4.8 2.9-4.8 2.9z"/></svg>',
    w: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M4 .7 7.1 2.5v3L4 7.3.9 5.5v-3z"/></svg>',
    x: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1h2.5v2.5H1zM4.5 1H7v2.5H4.5zM1 4.5h2.5V7H1zM4.5 4.5H7V7H4.5z"/></svg>',
  };

  /* One row shell shared by instance rows and prototype rows, so the two
     kinds stay visually one species. */
  const rowShell = (depth) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tree-row';
    row.style.paddingLeft = (8 + depth * 11) + 'px';
    return row;
  };
  const addGlyphs = (row, y) => {
    if (!y) return;
    const glyphs = document.createElement('span');
    glyphs.className = 'tglyphs';
    /* Inline SVG, never font glyphs — the page's standing rule (a
       character the font lacks renders as a tofu box and the row
       looks broken rather than annotated). */
    glyphs.innerHTML = ['a', 'w', 'x']
      .filter((c) => y.indexOf(c) >= 0)
      .map((c) => icons[c])
      .join('');
    row.appendChild(glyphs);
  };
  const addFloat = (row, g) => {
    /* A part resting where it should says nothing; one floating past
       tolerance whispers its gap — millimetres, from the census. */
    if (typeof g !== 'number') return;
    const float = document.createElement('span');
    float.className = 'tfloat';
    float.textContent = '↑' + Math.round(g * 1000) + 'mm';
    float.title = 'Floats ' + Math.round(g * 1000) + 'mm above the ground plane';
    row.appendChild(float);
  };
  const addType = (row, node) => {
    /* Meshes are the norm; a type badge only earns pixels when it says
       something (an empty, a light, a camera in the tree). A rig's most
       useful fact IS its size, so armatures spend the badge on the bone
       count instead of the word "armature". */
    if (!node.t || node.t === 'MESH') return;
    const type = document.createElement('span');
    type.className = 'ttype';
    type.textContent =
      node.t === 'ARMATURE' && typeof node.b === 'number'
        ? node.b + ' bones'
        : node.t.toLowerCase();
    row.appendChild(type);
  };
  const activate = (row, target) => {
    row.addEventListener('click', (e) => {
      if (e.altKey) {
        const text = Array.isArray(target)
          ? target.map((n) => paths.get(n)).join(String.fromCharCode(10))
          : paths.get(target);
        try { navigator.clipboard.writeText(text); } catch (_) {}
        return;
      }
      const mode = e.shiftKey ? 'add' : 'replace';
      if (currentEntry !== entry) {
        select(entry, chipButton).then(() => selectPart(target, mode));
      } else {
        selectPart(target, mode);
      }
    });
  };

  const emitInstance = (node, depth) => {
    const row = rowShell(depth);
    row.dataset.part = node.n;
    const label = document.createElement('span');
    label.className = 'tname';
    label.textContent = node.n;
    row.appendChild(label);
    addGlyphs(row, node.y);
    addFloat(row, node.g);
    addType(row, node);
    row.title = paths.get(node.n)
      + (node.t ? ' · ' + node.t.toLowerCase() : '')
      + (node.d ? ' · ' + node.d.join(' × ') + ' m' : '')
      + (typeof node.r === 'number' ? ' · ' + node.r.toLocaleString() + ' tris'
         : typeof node.f === 'number' ? ' · ' + node.f.toLocaleString() + ' faces' : '')
      + (node.y ? ' · ' +
          [node.y.indexOf('a') >= 0 ? 'animated' : '',
           node.y.indexOf('w') >= 0 ? 'watertight' : '',
           node.y.indexOf('x') >= 0 ? 'textured' : ''].filter(Boolean).join(', ')
        : '')
      + ' · alt-click copies path';
    activate(row, node.n);
    treeHost.appendChild(row);
  };

  /* Every name in a node's subtree, itself included. A prototype row for
     duplicated ASSEMBLIES must select the geometry inside the instances —
     the instance roots are often empties with nothing drawable, and a
     click that selects twelve invisible empties reads as a dead row. */
  const subtreeNames = (node, out) => {
    out.push(node.n);
    for (const child of byParent.get(node.n) || []) subtreeNames(child, out);
    return out;
  };

  const emitPrototype = (stem, members, depth) => {
    const names = [];
    for (const m of members) subtreeNames(m, names);
    const row = rowShell(depth);
    row.dataset.parts = JSON.stringify(names);
    const label = document.createElement('span');
    label.className = 'tname';
    label.textContent = stem;
    row.appendChild(label);
    const count = document.createElement('span');
    count.className = 'tcount';
    count.textContent = String.fromCharCode(215) + members.length; /* × */
    row.appendChild(count);
    /* Facts aggregate the way a reader would: glyphs are the union (any
       instance animated marks the family), the float whisper is the worst
       offender's gap. */
    const y = ['a', 'w', 'x'].filter((c) => members.some((m) => m.y && m.y.indexOf(c) >= 0)).join('');
    addGlyphs(row, y || null);
    let worstGap = null;
    for (const m of members) {
      if (typeof m.g === 'number' && (worstGap === null || m.g > worstGap)) worstGap = m.g;
    }
    addFloat(row, worstGap);
    addType(row, members[0]);
    row.title = members.length + ' instances: ' + members.map((m) => m.n).join(', ')
      + ' · click selects all · alt-click copies every path';
    activate(row, names);
    treeHost.appendChild(row);
  };

  /* A subtree's structural signature: its own prototype stem and census
     type, plus the sorted signatures of its children. Two siblings with
     equal signatures are instances of the same prototype ALL THE WAY
     DOWN, which is what duplicated assemblies (a kit's twelve arrows, a
     repeat grid's clones) actually are. Leaves reduce to stem+type, so
     the simple mirrored-bracket case falls out of the same rule. */
  const sigCache = new Map();
  const sigOf = (node) => {
    if (sigCache.has(node.n)) return sigCache.get(node.n);
    const kids = (byParent.get(node.n) || []).map(sigOf).sort();
    const sig = protoStem(node.n) + '|' + (node.t || 'MESH') + '(' + kids.join(',') + ')';
    sigCache.set(node.n, sig);
    return sig;
  };

  const walk = (parentKey, depth) => {
    const siblings = byParent.get(parentKey) || [];
    /* Partition the sibling list into prototype clusters by subtree
       signature. Order is kept: a cluster renders where its first
       instance sat. */
    const slots = [];
    const clusters = new Map();
    for (const node of siblings) {
      const key = sigOf(node);
      if (clusters.has(key)) {
        clusters.get(key).members.push(node);
        continue;
      }
      const cluster = { stem: protoStem(node.n), members: [node] };
      clusters.set(key, cluster);
      slots.push(cluster);
    }
    for (const slot of slots) {
      if (slot.members.length >= 3) {
        emitPrototype(slot.stem, slot.members, depth);
        /* The first instance's internals render once beneath the count:
           the prototype's anatomy is structure and belongs in the rail;
           repeating it per instance is what made large kits a scroll
           fest. The other instances are identical by signature, and any
           single instance stays reachable by clicking it in the
           viewport. */
        walk(slot.members[0].n, depth + 1);
      } else {
        /* One or two lookalikes are not a family; they read better named. */
        for (const member of slot.members) {
          emitInstance(member, depth);
          walk(member.n, depth + 1);
        }
      }
    }
  };
  walk(null, 0);
}

/** Keep tree rows highlighting whatever the viewport has selected. A
    prototype row lights when its whole family is selected — it acts as
    one unit, so it reads as one unit. */
function syncTreeSelection() {
  for (const row of document.querySelectorAll('.tree-row')) {
    if (row.dataset.parts) {
      let names = [];
      try { names = JSON.parse(row.dataset.parts); } catch (_) {}
      row.classList.toggle(
        'sel',
        names.length > 0 && names.every((n) => state.selection.has(n)),
      );
    } else {
      row.classList.toggle('sel', state.selection.has(row.dataset.part));
    }
  }
}
document.getElementById('railCount').textContent = String(KIT.entries.length);
function syncRailFade() {
  host.classList.toggle('scrollable', host.scrollHeight > host.clientHeight + 1);
}
requestAnimationFrame(syncRailFade);
window.addEventListener('resize', syncRailFade);
/* Reopen where the last load left off: the host reloads this page on every
   recompile and file refresh, and without this each reload dumped the user
   back at the first scene with a reframed camera. The saved entry must
   still exist (a recompile can rename or drop scenes); anything missing
   falls back to the first entry exactly as before. */
const savedView = loadViewState();
let bootRow = first;
if (savedView) {
  if (Array.isArray(savedView.cam)) pendingViewCam = savedView.cam;
  if (Array.isArray(savedView.sel) && savedView.sel.length > 0) pendingViewSel = savedView.sel;
  if (savedView.xrayMode === 1 || savedView.xrayMode === 2) state.xrayMode = savedView.xrayMode;
  if (typeof savedView.rail === 'boolean') setRail(browsable && savedView.rail);
  if (typeof savedView.entry === 'string') {
    const match = railRows.find((r) => r.entry.name === savedView.entry);
    if (match) bootRow = match;
  }
}
if (bootRow) select(bootRow.entry, bootRow.button);
else {
  // Nothing compiled: every control refers to an asset that does not
  // exist. An empty identity pill and a hint about clicking parts read as
  // a broken page rather than an empty one, so the chrome goes away and
  // the page says what is true.
  /* Removed by selector with a null check, not by a hardcoded id list.
     The list still named 'verdict', an element that stopped existing when
     the verdict moved onto the name's hover title — so this threw on the
     very first id and NONE of the rest of the empty state ran: the chip
     stayed, the hint stayed, and the "no assets" message was never
     appended. An empty kit is exactly the case nobody screenshots, so a
     missing id must degrade rather than abort. */
  for (const sel of ['#name', '#meta', '#part', '.ident', '#xray']) {
    const el = document.querySelector(sel);
    if (el) el.remove();
  }
  // The centred message already says it. A second sentence along the bottom
  // that says the same thing in different words reads as two states, not
  // one, so the shortcut bar simply goes away with everything else.
  document.getElementById('hint').textContent = '';
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = 'No compiled assets yet.';
  document.body.appendChild(p);
}
</script>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The catalog roll-up banner — the portfolio verdict for the whole kit. A
 * clean `pass` with nothing systemic renders nothing, so a healthy kit stays
 * uncluttered. Each systemic code shows its human title (when the caller could
 * resolve one) and the count of scenes it recurs in.
 */
function rollupBanner(rollup: NonNullable<KitPage["rollup"]>): string {
  const hasSystemic = rollup.systemic.length > 0;
  if (rollup.grade === "pass" && !hasSystemic) return "";
  const items = rollup.systemic
    .map(
      (s) =>
        '<li><span class="rollup-code">' +
        escapeHtml(s.title ?? s.code) +
        '</span><span class="rollup-n">' +
        s.scenes +
        " scenes</span></li>",
    )
    .join("");
  const systemic = hasSystemic
    ? '<div class="rollup-label">systemic across the kit</div><ul class="rollup-list">' +
      items +
      "</ul>"
    : "";
  return (
    '<div class="rollup rollup-' +
    escapeHtml(rollup.grade) +
    '"><span class="rollup-grade">' +
    escapeHtml(rollup.grade) +
    "</span>" +
    systemic +
    "</div>"
  );
}
