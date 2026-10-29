# Upstream provenance and integration scope

- Repository: https://github.com/JohnHeibel/ClaudeAnimationBase
- Commit: `0ac8bf2b31942376cb6b8c4074715595d512acd2`
- Author: John Heibel
- License: MIT; the complete original copyright/permission text is preserved in `../LICENSE`.
- Original guide: https://github.com/JohnHeibel/ClaudeAnimationBase/blob/0ac8bf2b31942376cb6b8c4074715595d512acd2/ANIMATION_GUIDE.md

`core.js` and `timeline.js` are unmodified copies from upstream src/. The
Motion scaffold copies them into each hand-painted source and disables the
studio controls. It does not inject or distribute clawd.js, character reference images,
upstream demos, Puppeteer or the standalone Chrome launcher.

../references/ANIMATION_GUIDE.md is an adapted guide for this host's original-character workflow.
The starter scene and baked sample draw an original rounded bird rather than the
Claude Code mascot. The default display name is Hand-painted Motion.
Existing internal IDs are retained for compatibility; they are not a branding or
endorsement claim. This independent integration is not affiliated with or
endorsed by Anthropic. The MIT code license is not a trademark authorization.

Pinned runtime dependencies have separate licenses: p5 2.3.3 is LGPL-2.1;
p5.brush 2.2.3 is MIT. See licenses/README.md for full texts, corresponding
source and the library replacement/build instructions.
