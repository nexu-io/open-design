"""Markdown to plain text conversion and notes slide XML generation."""

from __future__ import annotations

import re


def markdown_to_plain_text(md_content: str) -> str:
    """Convert Markdown notes to plain text for PPTX notes.

    Args:
        md_content: Markdown formatted notes content.

    Returns:
        Plain text content.
    """
    def strip_inline_bold(text: str) -> str:
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        text = re.sub(r'__(.+?)__', r'\1', text)
        return text

    lines: list[str] = []
    for line in md_content.split('\n'):
        if line.startswith('#'):
            text = re.sub(r'^#+\s*', '', line).strip()
            text = strip_inline_bold(text)
            if text:
                lines.append(text)
                lines.append('')
        elif line.strip().startswith('- '):
            item_text = line.strip()[2:]
            item_text = strip_inline_bold(item_text)
            lines.append('• ' + item_text)
        elif line.strip():
            text = strip_inline_bold(line.strip())
            lines.append(text)
        else:
            lines.append('')

    # Merge consecutive empty lines
    result: list[str] = []
    is_prev_empty = False
    for line in lines:
        if line == '':
            if not is_prev_empty:
                result.append(line)
            is_prev_empty = True
        else:
            result.append(line)
            is_prev_empty = False

    return '\n'.join(result).strip()


def create_notes_slide_xml(slide_num: int, notes_text: str) -> str:
    """Create notes slide XML.

    Args:
        slide_num: Slide number.
        notes_text: Notes text in plain text format.

    Returns:
        Notes slide XML string.
    """
    notes_text = (notes_text
                  .replace('&', '&amp;')
                  .replace('<', '&lt;')
                  .replace('>', '&gt;'))

    paragraphs: list[str] = []
    for para in notes_text.split('\n'):
        if para.strip():
            paragraphs.append(f'''<a:p>
              <a:r>
                <a:rPr lang="zh-CN" dirty="0"/>
                <a:t>{para}</a:t>
              </a:r>
            </a:p>''')
        else:
            paragraphs.append('<a:p><a:endParaRPr lang="zh-CN" dirty="0"/></a:p>')

    paragraphs_xml = (
        '\n            '.join(paragraphs)
        if paragraphs
        else '<a:p><a:endParaRPr lang="zh-CN" dirty="0"/></a:p>'
    )

    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
         xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Slide Image Placeholder 1"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="sldImg"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Notes Placeholder 2"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="body" idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          {paragraphs_xml}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:notes>'''


def create_notes_slide_rels_xml(slide_num: int) -> str:
    """Create notes slide relationship file XML.

    Args:
        slide_num: Slide number.

    Returns:
        Relationship file XML string.
    """
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide{slide_num}.xml"/>
</Relationships>'''
