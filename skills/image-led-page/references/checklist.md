# Pre-handoff checklist

Run top to bottom. `od lint` covers none of this — it reads markup, not
pixels, not cascade outcomes.

## Images

- [ ] Every slot in the manifest exists in the page, and every image in the
      page is in the manifest.
- [ ] Each image opened and inspected: correct brand name, correct spelling,
      correct language, plausible geometry.
- [ ] No unverified number, rating, or certification is visible in any image.
- [ ] Every `<img>` has `width` and `height`; content images have descriptive
      `alt`, atmospheric ones `alt=""`.
- [ ] Images resized and compressed; transparency-bearing files still PNG.

## Text over imagery

- [ ] Text on photographs is fully opaque and backed by a scrim or plate.
- [ ] Body text meets at least 4.5:1 against its actual background; muted
      tokens are not sitting on photographs, textures, or tinted panels.
- [ ] Every button on a coloured surface checked visually, header included
      (see pitfall 3).

## Robustness

- [ ] Rendered at mobile and desktop widths, and the produced screenshots are
      the widths that were requested.
- [ ] No `ad`, `ads`, `banner`, or `sponsor` token in any filename, class, or
      id.
- [ ] If the page travels as a single file: opened from an empty directory
      with every image still rendering.
- [ ] `od lint index.html --fail-on p0` exits 0.
