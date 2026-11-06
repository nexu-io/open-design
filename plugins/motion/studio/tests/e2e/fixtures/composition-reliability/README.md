# Composition reliability acceptance fixture

Compact, media-free Studio project for validating composition editing as one stack:

- two root hosts reuse `title-card.html` at different times;
- `nested-shell.html` hosts the same title card one level deeper;
- the title card uses a transparent overflow mask around an editable headline;
- adjacent clips on one track provide a clean collision/new-track drop target;
- a cross-track overlap exercises normal visual layering.

Copy this directory to scratch before browser acceptance. Exercise open, composition insert,
single/multi move, collision placement, overlap layering, cut, headline color/font-size, and one-step
undo. The checked-in fixture must remain unchanged.
