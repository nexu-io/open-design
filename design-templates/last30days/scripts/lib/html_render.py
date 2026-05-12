"""HTML rendering for shareable last30days reports."""

from __future__ import annotations

import html
import re
from datetime import date

from . import render, schema


PROSE_LABELS = [
    ("What I learned:", "What I learned"),
    ("KEY PATTERNS from the research:", "Key patterns from the research"),
]

INVITATION_PATTERN = re.compile(r"^---\nI'm now an expert.*?Just ask\.$", re.MULTILINE | re.DOTALL)
EVIDENCE_BLOCK_PATTERN = re.compile(r"<!-- EVIDENCE FOR SYNTHESIS.*?<!-- END EVIDENCE FOR SYNTHESIS -->", re.DOTALL)
PASS_THROUGH_FOOTER_PATTERN = re.compile(r"<!-- PASS-THROUGH FOOTER.*?-->\n(.*?)<!-- END PASS-THROUGH FOOTER -->", re.DOTALL)
CANONICAL_BOUNDARY_PATTERN = re.compile(r"\n?---\n# END OF last30days CANONICAL OUTPUT.*$", re.DOTALL)
# render_for_html emits metadata as <!-- META: ... --> so it survives the
# markdown converter (which escapes raw HTML inside paragraphs). Promoted to
# a styled <div class="meta"> after conversion.
META_MARKER_PATTERN = re.compile(r"<!--\s*META:\s*(.*?)\s*-->")

CSS = """
:root {
  --bg: #0e0e10;
  --bg-elev: #18181b;
  --fg: #fafafa;
  --fg-muted: #a1a1aa;
  --fg-subtle: #71717a;
  --accent: #a855f7;
  --accent-soft: #c4b5fd;
  --border: #27272a;
  --code-bg: #1a1a1d;
  --max-w: 720px;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #ffffff;
    --bg-elev: #fafafa;
    --fg: #18181b;
    --fg-muted: #52525b;
    --fg-subtle: #71717a;
    --accent: #7c3aed;
    --accent-soft: #6d28d9;
    --border: #e4e4e7;
    --code-bg: #f4f4f5;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

body {
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 4rem 1.5rem 6rem;
}

.badge {
  display: inline-block;
  padding: 0.4rem 0.85rem;
  margin-bottom: 2.5rem;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-muted);
  letter-spacing: 0;
}

.badge .accent { color: var(--accent); }

.meta {
  margin: -1.5rem 0 2.5rem;
  color: var(--fg-subtle);
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.01em;
}

h1 {
  margin: 0 0 1.5rem;
  color: var(--fg);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
}

h2,
.prose-label {
  margin: 2.75rem 0 1.25rem;
  color: var(--fg);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0;
}

.badge + h2,
.badge + .prose-label { margin-top: 0.5rem; }

h3 {
  margin: 2rem 0 0.85rem;
  color: var(--fg);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0;
}

p {
  margin: 0 0 1.4rem;
  color: var(--fg-muted);
}

p strong,
li strong,
td strong {
  color: var(--fg);
  font-weight: 600;
}

a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

a:hover { border-bottom-color: var(--accent); }

ul,
ol {
  margin: 0 0 1.6rem;
  padding-left: 1.5rem;
  color: var(--fg-muted);
}

li {
  margin: 0.6rem 0;
  padding-left: 0.4rem;
}

li::marker {
  color: var(--accent);
  font-weight: 600;
}

blockquote {
  margin: 1.5rem 0;
  padding-left: 1rem;
  border-left: 3px solid var(--accent);
  color: var(--fg-muted);
}

hr {
  margin: 2.5rem 0;
  border: 0;
  border-top: 1px solid var(--border);
}

code {
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 0.92em;
  background: var(--code-bg);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  color: var(--accent-soft);
}

pre {
  margin: 1.4rem 0;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  font-size: 14px;
  line-height: 1.6;
}

pre code {
  background: none;
  padding: 0;
  color: var(--fg);
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 15px;
}

th,
td {
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

th {
  color: var(--fg-muted);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0;
  text-transform: uppercase;
}

td { color: var(--fg-muted); }
td:first-child { color: var(--fg); font-weight: 500; }

.engine-footer {
  margin: 3rem 0 2.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--fg-muted);
}

.engine-footer pre {
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.75;
  color: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.colophon {
  margin-top: 4rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border);
  color: var(--fg-subtle);
  font-size: 13px;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  line-height: 1.7;
}

.colophon .rerun {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  margin-left: 0.25rem;
  background: var(--code-bg);
  border-radius: 4px;
  color: var(--accent-soft);
  font-size: 0.95em;
}

@media print {
  :root {
    --bg: #ffffff;
    --bg-elev: #f5f5f5;
    --fg: #000000;
    --fg-muted: #1f2937;
    --fg-subtle: #4b5563;
    --accent: #6d28d9;
    --accent-soft: #6d28d9;
    --border: #d4d4d8;
    --code-bg: #f4f4f5;
  }

  @page { size: A4; margin: 1.5cm 2cm; }

  body {
    max-width: none;
    padding: 0;
    font-size: 11pt;
  }

  a {
    color: inherit;
    border-bottom: 0;
    text-decoration: underline;
  }

  a[href]::after {
    content: " (" attr(href) ")";
    font-size: 0.85em;
    color: var(--fg-subtle);
  }

  .engine-footer { page-break-inside: avoid; }
}

@media (max-width: 600px) {
  body {
    padding: 2.5rem 1.25rem 4rem;
    font-size: 16px;
  }

  h1 { font-size: 25px; }
  .badge { font-size: 12px; }
  th, td { padding: 0.65rem 0.5rem; }
}
""".strip()

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>last30days · __TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<style>
__CSS__
</style>
</head>
<body>
__BODY__
__COLOPHON__
</body>
</html>
"""


def render_html(
    report: schema.Report,
    *,
    fun_level: str = "medium",
    save_path: str | None = None,
    synthesis_md: str | None = None,
) -> str:
    _ = fun_level
    md = render.render_for_html(report, synthesis_md=synthesis_md, save_path=save_path)
    md = _strip_evidence_block(md)
    md = _strip_invitation(md)
    md = _strip_canonical_boundary(md)
    md = _promote_prose_labels(md)
    body = _markdown_to_html(md)
    body = _wrap_engine_footer(body)
    body = _promote_meta_marker(body)
    colophon = _build_colophon(report)
    return _wrap_in_template(body, colophon, report.topic)


def render_html_comparison(
    entity_reports: list[tuple[str, schema.Report]],
    *,
    fun_level: str = "medium",
    save_path: str | None = None,
    synthesis_md: str | None = None,
) -> str:
    _ = fun_level
    md = render.render_for_html_comparison(
        entity_reports, synthesis_md=synthesis_md, save_path=save_path,
    )
    md = _strip_evidence_block(md)
    md = _strip_invitation(md)
    md = _strip_canonical_boundary(md)
    md = _promote_prose_labels(md)
    body = _markdown_to_html(md)
    body = _wrap_engine_footer(body)
    body = _promote_meta_marker(body)
    topic = " vs ".join(label for label, _ in entity_reports)
    colophon = _build_colophon(entity_reports[0][1], topic=topic)
    return _wrap_in_template(body, colophon, topic)


def _strip_evidence_block(md: str) -> str:
    return EVIDENCE_BLOCK_PATTERN.sub("", md)


def _strip_invitation(md: str) -> str:
    return INVITATION_PATTERN.sub("", md)


def _strip_canonical_boundary(md: str) -> str:
    return CANONICAL_BOUNDARY_PATTERN.sub("", md)


def _promote_prose_labels(md: str) -> str:
    for source, normalized in PROSE_LABELS:
        md = re.sub(
            rf"^{re.escape(source)}$",
            f"## {normalized}",
            md,
            flags=re.MULTILINE,
        )
    return md


def _markdown_to_html(md: str) -> str:
    md, footers = _protect_engine_footers(md)
    global _ENGINE_FOOTER_STORE
    _ENGINE_FOOTER_STORE = footers
    # Strip HTML comments EXCEPT preserved markers used for post-processing
    # (META is promoted to <div class="meta"> after markdown conversion).
    md = re.sub(r"<!--(?!\s*META:).*?-->", "", md, flags=re.DOTALL)
    lines = md.splitlines()
    out: list[str] = []
    paragraph: list[str] = []
    list_type: str | None = None
    in_code = False
    code_lines: list[str] = []
    index = 0

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            text = " ".join(part.strip() for part in paragraph).strip()
            if text:
                out.append(f"<p>{_inline_markdown(text)}</p>")
            paragraph = []

    def close_list() -> None:
        nonlocal list_type
        if list_type:
            out.append(f"</{list_type}>")
            list_type = None

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if in_code:
            if stripped.startswith("```"):
                out.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")
                code_lines = []
                in_code = False
            else:
                code_lines.append(line)
            index += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            close_list()
            in_code = True
            code_lines = []
            index += 1
            continue

        if stripped in footers:
            flush_paragraph()
            close_list()
            out.append(stripped)
            index += 1
            continue

        if not stripped:
            flush_paragraph()
            close_list()
            index += 1
            continue

        if stripped == "---":
            flush_paragraph()
            close_list()
            out.append("<hr>")
            index += 1
            continue

        if index + 1 < len(lines) and _is_table_row(stripped) and _is_table_separator(lines[index + 1].strip()):
            flush_paragraph()
            close_list()
            table_lines = [stripped]
            index += 2
            while index < len(lines) and _is_table_row(lines[index].strip()):
                table_lines.append(lines[index].strip())
                index += 1
            out.append(_render_table(table_lines))
            continue

        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            close_list()
            level = min(len(heading.group(1)), 3)
            out.append(f"<h{level}>{_inline_markdown(heading.group(2))}</h{level}>")
            index += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            close_list()
            quote_lines = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote_lines.append(lines[index].strip().lstrip(">").strip())
                index += 1
            out.append(f"<blockquote>{_inline_markdown(' '.join(quote_lines))}</blockquote>")
            continue

        unordered = re.match(r"^[-*]\s+(.+)$", stripped)
        ordered = re.match(r"^\d+[.)]\s+(.+)$", stripped)
        if unordered or ordered:
            flush_paragraph()
            next_type = "ul" if unordered else "ol"
            if list_type != next_type:
                close_list()
                out.append(f"<{next_type}>")
                list_type = next_type
            item = unordered.group(1) if unordered else ordered.group(1)
            out.append(f"<li>{_inline_markdown(item)}</li>")
            index += 1
            continue

        if stripped.startswith("🌐 last30days"):
            flush_paragraph()
            close_list()
            badge_text = _inline_markdown(stripped.removeprefix("🌐").strip())
            out.append(f'<div class="badge"><span class="accent">🌐</span> {badge_text}</div>')
            index += 1
            continue

        paragraph.append(line)
        index += 1

    if in_code:
        out.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")
    flush_paragraph()
    close_list()
    return "\n".join(out).strip()


def _protect_engine_footers(md: str) -> tuple[str, dict[str, str]]:
    footers: dict[str, str] = {}

    def replace(match: re.Match[str]) -> str:
        token = f"__LAST30DAYS_ENGINE_FOOTER_{len(footers)}__"
        footers[token] = match.group(1).strip("\n")
        return f"\n{token}\n"

    return PASS_THROUGH_FOOTER_PATTERN.sub(replace, md), footers


def _wrap_engine_footer(body: str) -> str:
    def replace(match: re.Match[str]) -> str:
        footer = html.escape(_ENGINE_FOOTER_STORE.get(match.group(0), ""), quote=False)
        return f'<div class="engine-footer"><pre>{footer}</pre></div>'

    return re.sub(
        r"__LAST30DAYS_ENGINE_FOOTER_\d+__",
        replace,
        body,
    )


def _promote_meta_marker(body: str) -> str:
    """Promote ``<!-- META: ... -->`` markers into a styled ``<div class="meta">``.

    The marker is preserved through the comment-strip pass (see
    _markdown_to_html exemption) but the markdown converter wraps it in
    ``<p>`` and HTML-escapes the angle brackets. After conversion the body
    contains shapes like:
      <p>&lt;!-- META: TEXT --&gt;</p>
      <p><!-- META: TEXT --></p>     (when not escaped)
    Both collapse to ``<div class="meta">TEXT</div>``.
    """
    def replace(match: re.Match[str]) -> str:
        text = match.group(1).strip()
        return f'<div class="meta">{text}</div>'

    # Escaped form (most common after markdown conversion)
    body = re.sub(
        r"<p>\s*&lt;!--\s*META:\s*(.*?)\s*--&gt;\s*</p>",
        replace,
        body,
    )
    body = re.sub(r"&lt;!--\s*META:\s*(.*?)\s*--&gt;", replace, body)
    # Unescaped form (paranoid fallback)
    body = re.sub(r"<p>\s*<!--\s*META:\s*(.*?)\s*-->\s*</p>", replace, body)
    body = re.sub(r"<!--\s*META:\s*(.*?)\s*-->", replace, body)
    return body


_ENGINE_FOOTER_STORE: dict[str, str] = {}


def _inline_markdown(text: str) -> str:
    escaped = html.escape(text, quote=True)
    code_tokens: dict[str, str] = {}

    def code_replace(match: re.Match[str]) -> str:
        token = f"__CODE_{len(code_tokens)}__"
        code_tokens[token] = f"<code>{match.group(1)}</code>"
        return token

    escaped = re.sub(r"`([^`]+)`", code_replace, escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        r'<a href="\2">\1</a>',
        escaped,
    )
    for token, value in code_tokens.items():
        escaped = escaped.replace(token, value)
    return escaped


def _is_table_row(line: str) -> bool:
    return "|" in line and len(_split_table_cells(line)) >= 2


def _is_table_separator(line: str) -> bool:
    cells = _split_table_cells(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def _split_table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _render_table(rows: list[str]) -> str:
    header = _split_table_cells(rows[0])
    body_rows = [_split_table_cells(row) for row in rows[1:]]
    out = ["<table>", "<thead>", "<tr>"]
    out.extend(f"<th>{_inline_markdown(cell)}</th>" for cell in header)
    out.extend(["</tr>", "</thead>", "<tbody>"])
    for row in body_rows:
        out.append("<tr>")
        out.extend(f"<td>{_inline_markdown(cell)}</td>" for cell in row)
        out.append("</tr>")
    out.extend(["</tbody>", "</table>"])
    return "\n".join(out)


def _build_colophon(report: schema.Report, *, topic: str | None = None) -> str:
    display_topic = topic or report.topic
    generated = _generated_date(report)
    version = render._skill_version()
    escaped_topic = html.escape(display_topic)
    rerun = html.escape(f"/last30days {display_topic}")
    return (
        '<div class="colophon">\n'
        f"  Generated {generated} by /last30days v{html.escape(version)} · topic: {escaped_topic}<br>\n"
        f'  Re-run for fresh data: <span class="rerun">{rerun}</span>\n'
        "</div>"
    )


def _generated_date(report: schema.Report) -> str:
    if report.generated_at:
        return report.generated_at[:10]
    return date.today().strftime("%Y-%m-%d")


def _wrap_in_template(body: str, colophon: str, title: str) -> str:
    return (
        HTML_TEMPLATE
        .replace("__TITLE__", html.escape(title))
        .replace("__CSS__", CSS)
        .replace("__BODY__", body)
        .replace("__COLOPHON__", colophon)
    )
