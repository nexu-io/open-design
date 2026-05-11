"""Narration audio discovery and PPTX XML helpers."""

from __future__ import annotations

import base64
import json
import re
import subprocess
from pathlib import Path


MEDIA_REL_TYPE = "http://schemas.microsoft.com/office/2007/relationships/media"
AUDIO_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio"
IMAGE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"

AUDIO_CONTENT_TYPES = {
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aif": "audio/aiff",
    ".aiff": "audio/aiff",
}

NARRATION_EXTENSIONS = tuple(AUDIO_CONTENT_TYPES.keys())

TRANSPARENT_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/"
    "lBf7WQAAAABJRU5ErkJggg=="
)


def _normalize_title(title: str) -> str:
    text = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "_", title.strip())
    return re.sub(r"_+", "_", text).strip("_").lower()


def _leading_number(text: str) -> int | None:
    match = re.match(r"^(\d{1,3})", text.strip())
    return int(match.group(1)) if match else None


def find_narration_files(audio_dir: Path, svg_files: list[Path]) -> dict[str, Path]:
    """Return `{svg_stem: audio_path}` matched by exact stem, normalized stem, or index."""
    if not audio_dir.exists() or not audio_dir.is_dir():
        return {}

    audio_files = [
        path for path in sorted(audio_dir.iterdir())
        if path.is_file() and path.suffix.lower() in NARRATION_EXTENSIONS
    ]
    exact = {path.stem: path for path in audio_files}
    normalized: dict[str, Path] = {}
    numbered: dict[int, Path] = {}
    for path in audio_files:
        normalized.setdefault(_normalize_title(path.stem), path)
        number = _leading_number(path.stem)
        if number is not None:
            numbered.setdefault(number, path)

    matched: dict[str, Path] = {}
    for index, svg in enumerate(svg_files, 1):
        stem = svg.stem
        if stem in exact:
            matched[stem] = exact[stem]
            continue
        norm = _normalize_title(stem)
        if norm in normalized:
            matched[stem] = normalized[norm]
            continue
        if index in numbered:
            matched[stem] = numbered[index]
    return matched


def probe_audio_duration(audio_path: Path) -> float | None:
    """Return duration in seconds using ffprobe when available."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "json",
                str(audio_path),
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        data = json.loads(result.stdout or "{}")
        duration = float(data.get("format", {}).get("duration", 0))
        return duration if duration > 0 else None
    except Exception:
        return None


def next_shape_id(slide_xml: str) -> int:
    ids = [int(value) for value in re.findall(r'<p:cNvPr[^>]*\sid="(\d+)"', slide_xml)]
    return max(ids, default=1) + 1


def create_audio_pic_xml(
    shape_id: int,
    shape_name: str,
    audio_rid: str,
    media_rid: str,
    poster_rid: str,
) -> str:
    """Create a tiny audio picture shape carrying narration media."""
    return f'''<p:pic>
        <p:nvPicPr>
          <p:cNvPr id="{shape_id}" name="{shape_name}">
            <a:hlinkClick r:id="" action="ppaction://media"/>
          </p:cNvPr>
          <p:cNvPicPr>
            <a:picLocks noChangeAspect="1"/>
          </p:cNvPicPr>
          <p:nvPr>
            <a:audioFile r:link="{audio_rid}"/>
            <p:extLst>
              <p:ext uri="{{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}}">
                <p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="{media_rid}"/>
              </p:ext>
            </p:extLst>
          </p:nvPr>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="{poster_rid}"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="1" cy="1"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>'''


def _next_timing_id(slide_xml: str) -> int:
    ids = [int(value) for value in re.findall(r'<p:cTn[^>]*\sid="(\d+)"', slide_xml)]
    return max(ids, default=1) + 1


def _create_audio_timing_xml(shape_id: int, ctn_id: int) -> str:
    return f'''<p:audio>
                <p:cMediaNode vol="80000">
                  <p:cTn id="{ctn_id}" fill="hold" display="0">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                  </p:cTn>
                  <p:tgtEl><p:spTgt spid="{shape_id}"/></p:tgtEl>
                </p:cMediaNode>
              </p:audio>'''


def inject_narration(
    slide_xml: str,
    *,
    shape_id: int,
    shape_name: str,
    audio_rid: str,
    media_rid: str,
    poster_rid: str,
) -> str:
    """Inject a hidden narration media shape and slide-entry autoplay timing."""
    audio_pic_xml = create_audio_pic_xml(
        shape_id=shape_id,
        shape_name=shape_name,
        audio_rid=audio_rid,
        media_rid=media_rid,
        poster_rid=poster_rid,
    )
    slide_xml = slide_xml.replace("</p:spTree>", audio_pic_xml + "\n    </p:spTree>", 1)

    audio_timing_xml = _create_audio_timing_xml(shape_id, _next_timing_id(slide_xml))
    if "<p:timing>" not in slide_xml:
        timing_xml = f'''  <p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
          <p:childTnLst>
              {audio_timing_xml}
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:tnLst>
  </p:timing>'''
        return slide_xml.replace("</p:sld>", timing_xml + "\n</p:sld>", 1)

    pattern = re.compile(r'(<p:cTn\s+id="1"[^>]*>\s*<p:childTnLst>)', re.S)
    if pattern.search(slide_xml):
        return pattern.sub(r"\1\n              " + audio_timing_xml, slide_xml, count=1)
    return slide_xml.replace("</p:tnLst>", audio_timing_xml + "\n    </p:tnLst>", 1)


def apply_recorded_timing(
    slide_xml: str,
    *,
    advance_after: float,
    transition_duration: float,
    transition_effect: str | None = "fade",
) -> str:
    """Set slide auto-advance timing so exported video follows narration length."""
    adv_ms = max(1, int(advance_after * 1000))
    dur_ms = max(1, int(transition_duration * 1000))

    transition_match = re.search(r"<p:transition\b[^>]*>", slide_xml)
    if transition_match:
        tag = transition_match.group(0)
        if "advTm=" in tag:
            new_tag = re.sub(r'\sadvTm="[^"]*"', f' advTm="{adv_ms}"', tag, count=1)
        else:
            new_tag = tag[:-1] + f' advTm="{adv_ms}">'
        return slide_xml[:transition_match.start()] + new_tag + slide_xml[transition_match.end():]

    effect = transition_effect or "fade"
    transition_xml = f'''  <p:transition p14:dur="{dur_ms}" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" advTm="{adv_ms}">
    <p:{effect}/>
  </p:transition>'''
    if "<p:timing>" in slide_xml:
        return slide_xml.replace("<p:timing>", transition_xml + "\n  <p:timing>", 1)
    return slide_xml.replace("</p:sld>", transition_xml + "\n</p:sld>", 1)
