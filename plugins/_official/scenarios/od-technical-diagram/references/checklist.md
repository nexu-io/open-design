# Technical Diagram Checklist

- [ ] Diagram type matches the brief and the selected grammar.
- [ ] Every important node has a semantic label from the user's system.
- [ ] Important arrows are labeled with request/data/control/read/write/async
  semantics.
- [ ] Visual groups, swimlanes, or section bands explain the architecture.
- [ ] Node count stays readable; large systems are grouped rather than crammed.
- [ ] Legend is present when arrow colors or node families carry meaning.
- [ ] SVG is editable: real text, paths, shapes, and markers, not a raster-only
  screenshot.
- [ ] XML parses with `python3 -c "import xml.etree.ElementTree as ET; ET.parse('file.svg')"`.
- [ ] Rendered PNG/SVG has no clipped shadows, arrow labels on top of nodes,
  arrows through node interiors, or legend overlap.
- [ ] Export dimensions are documented when the artifact is intended for docs
  or slides.
