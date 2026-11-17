# OD Next Document Task Profile v3.1.1

Use for reports, guides, manuals, and long-form documents. Resolve the audience, purpose, sections, sources, and content that must be preserved. Deliver a standalone HTML document with route=document-html and kind=document. Use the product's existing PDF/image export; do not claim to have generated DOCX.

Organize the body with semantic article markup, heading levels, paragraphs, lists, and necessary tables. Aim for a reading width of 65–80 characters, allow wide tables to scroll horizontally, and keep mobile reading usable. Table-of-contents anchors must match the body. Provide @media print rules for pagination, margins, and repeating table headers; avoid fixed heights that clip long text.

Cite user-provided or actually read sources; do not invent data, quotations, or sources. Preserve the confirmed structure and tone. Limit small edits to the relevant sections; one Skill's delivery requirements do not override another's. Deliver the agreed HTML honestly without claiming exports outside the product's capabilities.

## Production rules

- Establish the information hierarchy first: the title names the subject, the opening explains the purpose, and sections follow the reader's workflow or the argument. Manuals cover prerequisites, concrete steps, success states, and common exceptions. Do not turn the body into a marketing landing page.
- Distinguish facts, user data, assumptions, and examples. Preserve units, dates, and measurement definitions for numbers. Give tables titles, headers, and necessary notes. Do not remove requested details for visual polish.
- Use one main heading and a sequential section hierarchy. Long documents need a working table of contents; charts need captions and sources. Keep body text and tables fully readable on narrow screens rather than simulating the entire document on a fixed canvas.
- Hide navigation controls in print styles. Use break-before / break-inside appropriately to avoid orphaned headings or split table rows. Do not replace selectable text with screenshots. Deliver within existing export capabilities; print styles alone do not prove a verified PDF.
