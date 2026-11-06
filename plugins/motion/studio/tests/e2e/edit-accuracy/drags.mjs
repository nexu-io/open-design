// Drag paths (one long move) and sequences (several edits, no settle between), gsap none but for GSAP_SEQUENCES.
// Ids keep the grid's scheme with a letters-only gesture token, so `^[a-z]+-none-` selects the plain ones.

const MOVE = { do: "drag", gesture: "move", by: [90, 60] };
const BACK = { do: "drag", gesture: "move", by: [-70, 50] };
const UP = { do: "drag", gesture: "move", by: [60, -80] };

const PATHS = ["zigzag", "circle", "flick", "pause", "edge", "stray"];

/** Each sequence's steps; a drag names its element (A is #target, B is #other) and its screen-px path. */
const SEQUENCES = {
  repeat: [MOVE, BACK, UP],
  undo: [MOVE, { do: "undo" }, BACK],
  nudge: [MOVE, { do: "nudge", count: 3 }, BACK],
  ab: [MOVE, { ...BACK, element: "B" }, { ...UP, element: "A" }],
  resize: [{ do: "drag", gesture: "resize" }, MOVE],
  seek: [{ do: "seek", time: 2 }, MOVE],
  // Pressed again in the frame after pointer-up, while that drag's save is still in flight.
  inflight: [MOVE, { ...BACK, inFlight: true }],
  // Undone at once, before the edit's save lands: the undo must win.
  resizeundo: [{ do: "drag", gesture: "resize" }, { do: "undo" }],
  nudgeundo: [{ do: "nudge", count: 1 }, { do: "undo" }],
  rotatenudge: [
    { do: "drag", gesture: "rotate" },
    { do: "nudge", count: 3 },
  ],
};

// A plain element animated the way a person does it: auto-record on, a keyframe added at the playhead (1 s),
// then edits at a later keyframe (3 s) and between (2 s); seeks back check each keyframe kept its box.
// Upward moves keep the grown, rotated box inside the nested frame, which clips it in preview and render alike.
const PLAIN_TO_KEYS = [
  { do: "drag", gesture: "move", by: [90, -40] },
  { do: "autokey" },
  { do: "addkey" },
  { do: "seek", time: 3 },
  BACK,
  { do: "drag", gesture: "resize" },
  { do: "seek", time: 2 },
  { do: "drag", gesture: "resize" },
  { do: "drag", gesture: "move", by: [60, -30] },
  { do: "seek", time: 3 },
  { do: "seek", time: 1 },
];

/** Add keyframe, then moves pressed before its tween reaches the preview: each must key where it is let go. */
const FAST_KEYS = [
  { do: "drag", gesture: "move", by: [90, -40] },
  { do: "autokey" },
  { do: "addkey" },
  { do: "seek", time: 2 },
  { do: "drag", gesture: "move", by: [60, -30] },
  { do: "seek", time: 3 },
  { do: "drag", gesture: "move", by: [-50, 20] },
];

/** On a GSAP-tweened box: a resize, then a drag (with or without an undo between) must save where it is let go. */
const GSAP_SEQUENCES = {
  resizeundodrag: [{ do: "drag", gesture: "resize" }, { do: "undo" }, MOVE],
  resizedrag: [{ do: "drag", gesture: "resize" }, MOVE],
};

/** A box a timeline set holds: a second resize and drag after the first pair must save too. */
const HELD_TWICE = [
  { do: "drag", gesture: "resize" },
  MOVE,
  { do: "drag", gesture: "resize" },
  { ...MOVE, by: [-90, -60] },
];

/** Text in place: a double press opens it, Enter commits; `select` first double-clicks a word to replace. */
const TEXT = {
  edit: [{ do: "text", word: "Teleport" }],
  select: [{ do: "text", word: "Teleport", select: "accuracy" }],
};

const row = (gesture, c, steps, gsap = "none") => ({
  id: [gesture, gsap, c.placement, `r${c.rotation}`, c.nesting, `z${c.zoom}`].join("-"),
  gesture,
  gsap,
  ...c,
  steps,
  other: Boolean(steps?.some((s) => s.element === "B")),
});

const base = { rotation: 0, zoom: 100 };
const everyPlacement = ["px", "pct", "center"].flatMap((placement) =>
  ["root", "nested"].map((nesting) => ({ ...base, placement, nesting })),
);
const pxRoot = (extra) => ({ ...base, placement: "px", nesting: "root", ...extra });

export function dragCases() {
  const route = (path) => [{ do: "drag", gesture: "move", route: path }];
  const paths = PATHS.flatMap((p) =>
    [...everyPlacement, pxRoot({ rotation: 30 }), pxRoot({ zoom: 50 }), pxRoot({ zoom: 200 })].map(
      (c) => row(`path${p}`, c, route(p)),
    ),
  );
  const sequences = Object.entries(SEQUENCES).flatMap(([name, steps]) =>
    everyPlacement.map((c) => row(`seq${name}`, c, steps)),
  );
  const texts = Object.entries(TEXT).flatMap(([name, steps]) =>
    ["root", "nested"].map((nesting) => ({
      ...row(`text${name}`, { ...base, placement: "px", nesting }, steps),
      text: true,
    })),
  );
  const plainToKeys = [0, 30].flatMap((rotation) =>
    everyPlacement.map((c) => ({
      ...row("seqplainkeys", { ...c, rotation }, PLAIN_TO_KEYS),
      settle: true,
      keyRender: 3,
    })),
  );
  const fastKeys = [row("seqfastkeys", pxRoot(), FAST_KEYS)];
  // Saves slowed as on a busy machine: each press lands before the previous save does.
  const heldTwice = ["root", "nested"].map((nesting) => ({
    ...row("seqheldtwice", pxRoot({ nesting }), HELD_TWICE, "tlhold"),
    slowSaves: 800,
  }));
  // Settled: a resize on a tween saves its size and its anchor separately, still one undo.
  const gsapSequences = Object.entries(GSAP_SEQUENCES).flatMap(([name, steps]) =>
    ["root", "nested"].map((nesting) => ({
      ...row(`seq${name}`, pxRoot({ nesting }), steps, "tween"),
      settle: true,
    })),
  );
  // Rotate on the common centring idiom, a transform rather than the translate property.
  const centred = [0, 30].flatMap((rotation) =>
    ["root", "nested"].map((nesting) => ({
      ...row("rotate", { ...base, rotation, placement: "transform", nesting }, undefined),
      steps: undefined,
      other: false,
    })),
  );
  return [
    ...paths,
    ...sequences,
    ...plainToKeys,
    ...fastKeys,
    ...heldTwice,
    ...gsapSequences,
    ...texts,
    ...centred,
  ];
}
