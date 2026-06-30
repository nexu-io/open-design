# Social Card Checklist

Run this manually before delivery. If the user asks for an automatic pass, run
`node scripts/validate-social-deck.mjs <task-dir>` and fix every FAIL.

- [ ] Ratio and safe area match the named platform.
- [ ] Each frame has one dominant idea and no filler/lorem ipsum.
- [ ] The longest title remains readable as a 360px-wide thumbnail.
- [ ] Real evidence is present: user image/screenshot, sourced asset,
  generated bitmap, or bundled background asset.
- [ ] Text on images avoids faces/subjects and uses only localized tint when
  needed.
- [ ] WeChat outputs include both 21:9 and 1:1 crops in one HTML preview.
- [ ] Rednote/Xiaohongshu vertical pages are filled across the full 3:4 canvas.
- [ ] Footer, page number, logo, and attribution do not collide with body copy.
- [ ] Export size is documented in an HTML comment near each frame.
