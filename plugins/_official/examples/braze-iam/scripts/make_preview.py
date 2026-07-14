#!/usr/bin/env python3
"""
Role: Braze IAM 발송본 HTML → 프리뷰 HTML 기계 변환 (placeholder → data-URI)
Key Features: __BRAZE_MEDIA__/<name> 치환 (img src + CSS url()), base64 인라인, 누락 에셋 검출
Dependencies: 표준 라이브러리만 (base64, pathlib, re, argparse)
Notes: 발송본에 data-URI를 넣으면 Braze 에디터가 버퍼링됨(실무 실측) — 프리뷰 파일은
       FileViewer 확인 전용이며 발송본과 이 스크립트로만 분기한다 (수기 2벌 금지, drift 방지).
       placeholder 폴백 경로 전용 (2026-07-14) — 기본 경로는 upload_media.py가 Media Library
       CDN URL을 발송본에 직기입하므로 프리뷰 변환이 필요 없다 (SKILL.md Step 4a-b).
"""
import argparse
import base64
import re
import sys
from pathlib import Path

# 확장자 → MIME (Braze 허용 3종만 — BRAZE-DOMAIN §1.3)
MIME = {'.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}

PLACEHOLDER = re.compile(r'__BRAZE_MEDIA__/([A-Za-z0-9._-]+)')


def to_data_uri(asset_path: Path) -> str:
    # data-URI 조립 — 프리뷰 iframe이 외부 참조 없이 렌더되도록 전체 인라인
    mime = MIME.get(asset_path.suffix.lower())
    if mime is None:
        raise ValueError(f'unsupported asset extension: {asset_path.name} (PNG/GIF/JPEG only)')
    encoded = base64.b64encode(asset_path.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{encoded}'


def main() -> int:
    parser = argparse.ArgumentParser(description='Braze IAM 발송본 → 프리뷰 변환')
    parser.add_argument('variant_html', type=Path)
    parser.add_argument('assets_dir', type=Path)
    parser.add_argument('--out', type=Path, default=None)
    args = parser.parse_args()

    html = args.variant_html.read_text(encoding='utf-8')
    out_path = args.out or args.variant_html.with_name(
        args.variant_html.stem + '-preview.html')

    names = sorted(set(PLACEHOLDER.findall(html)))
    missing = [n for n in names if not (args.assets_dir / n).is_file()]
    if missing:
        # 누락 에셋 = 발송본-에셋 manifest 불일치 — 조용한 부분 변환 금지
        print(f'MISSING assets in {args.assets_dir}: {", ".join(missing)}', file=sys.stderr)
        return 1

    for name in names:
        html = html.replace(f'__BRAZE_MEDIA__/{name}', to_data_uri(args.assets_dir / name))

    out_path.write_text(html, encoding='utf-8')
    print(f'OK {out_path} ({len(names)} asset(s) inlined)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
