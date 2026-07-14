#!/usr/bin/env python3
"""
Role: 생성 에셋 PNG를 Braze Media Library에 업로드하고 에셋명→CDN URL 매핑을 반환
Key Features: /media_library/create multipart POST, env/파일 자격 해석, 에러 코드 한국어 매핑, --dry-run, --json
Dependencies: 표준 라이브러리만 (urllib, json, uuid, pathlib, argparse)
Notes: 자격 해석 순서 = 프로세스 env(BRAZE_REST_API_KEY/BRAZE_REST_ENDPOINT) → --env-file →
       ~/.config/marketing-ax/braze.env. 키를 CLI 인자로 받지 않는다 (ps 노출 방지).
       실패 에셋이 1건이라도 있으면 exit 1 — 메인 에이전트는 해당 에셋을 수동 폴백
       (placeholder 경로, SKILL.md Step 7 폴백 절)으로 전환한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
import urllib.request
import urllib.error
from pathlib import Path

# Braze 허용 이미지 3종만 (craft/braze-custom-html.md — WebP 금지)
ALLOWED_EXT = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif'}
MAX_SIZE = 5 * 1024 * 1024  # Braze 문서 명시 5MB 상한 — 초과분은 API 왕복 없이 사전 차단
DEFAULT_ENV_FILE = Path.home() / '.config' / 'marketing-ax' / 'braze.env'
REQUEST_TIMEOUT = 60

# Braze 에러 코드 → 운영자 액션이 보이는 한국어 설명
ERROR_CODE_MAP = {
    'UNSUPPORTED_FILE_TYPE': '미지원 파일 형식 — PNG/JPEG/GIF만 허용',
    'ASSET_SIZE_EXCEEDS_LIMIT': '파일이 5MB 상한 초과 — 프리멀티 다운스케일로 축소 후 재시도',
    'MEDIA_LIBRARY_LIMIT_REACHED': '워크스페이스 에셋 한도 도달 — 대시보드에서 미사용 에셋 정리 필요',
    'INVALID_ASSET_URL': 'asset_url 형식 오류 (이 스크립트는 asset_file 경로만 사용 — 발생 시 버그)',
    'GENERIC_ERROR': 'Braze 서버 오류 — 잠시 후 재시도',
}


def load_credentials(env_file: 'Path | None') -> 'tuple[str, str]':
    # 프로세스 env가 항상 우선 — 파일은 미설정 변수만 보충한다
    key = os.environ.get('BRAZE_REST_API_KEY', '').strip()
    endpoint = os.environ.get('BRAZE_REST_ENDPOINT', '').strip()
    candidates = [env_file] if env_file else [DEFAULT_ENV_FILE]
    for cand in candidates:
        if cand is None or not cand.is_file() or (key and endpoint):
            continue
        for line in cand.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            name, _, value = line.partition('=')
            name, value = name.strip(), value.strip().strip('"').strip("'")
            if name == 'BRAZE_REST_API_KEY' and not key:
                key = value
            elif name == 'BRAZE_REST_ENDPOINT' and not endpoint:
                endpoint = value
    return key, endpoint


def validate_asset(path: Path) -> 'str | None':
    # API 왕복 전에 로컬에서 걸러지는 실패는 전부 사전 차단
    if not path.is_file():
        return '파일 없음'
    if path.suffix.lower() not in ALLOWED_EXT:
        return f'미지원 확장자 {path.suffix} (PNG/JPEG/GIF만 — WebP 금지)'
    if path.stat().st_size > MAX_SIZE:
        return f'5MB 초과 ({path.stat().st_size / 1024 / 1024:.1f}MB)'
    return None


def build_multipart(name: str, path: Path) -> 'tuple[bytes, str]':
    # urllib에는 multipart 조립기가 없다 — boundary 수동 조립
    boundary = f'----braze-iam-{uuid.uuid4().hex}'
    mime = ALLOWED_EXT[path.suffix.lower()]
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n{name}\r\n'.encode('utf-8'),
        (f'--{boundary}\r\nContent-Disposition: form-data; name="asset_file"; '
         f'filename="{path.name}"\r\nContent-Type: {mime}\r\n\r\n').encode('utf-8'),
        path.read_bytes(),
        f'\r\n--{boundary}--\r\n'.encode('utf-8'),
    ]
    return b''.join(parts), boundary


def upload_one(endpoint: str, api_key: str, name: str, path: Path) -> 'tuple[str | None, str | None]':
    """단건 업로드 — (url, None) 성공 / (None, 사유) 실패."""
    body, boundary = build_multipart(name, path)
    req = urllib.request.Request(
        f'{endpoint.rstrip("/")}/media_library/create',
        data=body,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': f'multipart/form-data; boundary={boundary}',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:500]
        if exc.code == 429:
            return None, '레이트 리밋 초과 (100건/시) — 대기 후 재시도'
        if exc.code == 403:
            return None, 'Media Library API 비활성 또는 키 권한 부족 (media_library.create 필요)'
        for code, meaning in ERROR_CODE_MAP.items():
            if code in detail:
                return None, f'{code}: {meaning}'
        return None, f'HTTP {exc.code}: {detail}'
    except (urllib.error.URLError, TimeoutError) as exc:
        return None, f'네트워크 실패: {exc}'
    assets = payload.get('new_assets') or []
    if not assets or not assets[0].get('url'):
        return None, f'응답에 URL 없음: {json.dumps(payload, ensure_ascii=False)[:300]}'
    return assets[0]['url'], None


def main() -> int:
    parser = argparse.ArgumentParser(description='Braze Media Library 업로드 — 에셋명→URL 매핑 반환')
    parser.add_argument('assets', nargs='+', help='업로드할 에셋 파일 경로들')
    parser.add_argument('--name-prefix', default='', help='Media Library 표시명 프리픽스 (권장: iam-<messageId>-)')
    parser.add_argument('--env-file', type=Path, default=None, help='자격 파일 경로 (기본 ~/.config/marketing-ax/braze.env)')
    parser.add_argument('--json', action='store_true', help='stdout에 JSON만 출력 (기계 소비용)')
    parser.add_argument('--dry-run', action='store_true', help='검증·계획만 출력, POST 안 함')
    args = parser.parse_args()

    key, endpoint = load_credentials(args.env_file)
    if not key or not endpoint:
        print('FAIL: BRAZE_REST_API_KEY / BRAZE_REST_ENDPOINT 미설정 — env 또는 '
              f'{args.env_file or DEFAULT_ENV_FILE} 확인 (샘플: 스킬 scripts/braze.env.example)', file=sys.stderr)
        return 2

    uploaded: 'dict[str, str]' = {}
    failed: 'list[dict[str, str]]' = []
    for raw in args.assets:
        path = Path(raw)
        reason = validate_asset(path)
        display_name = f'{args.name_prefix}{path.stem}'
        if reason:
            failed.append({'file': path.name, 'reason': reason})
            print(f'SKIP {path.name} — {reason}', file=sys.stderr)
            continue
        if args.dry_run:
            print(f'DRY  {path.name} → POST {endpoint.rstrip("/")}/media_library/create (name={display_name})',
                  file=sys.stderr)
            continue
        url, err = upload_one(endpoint, key, display_name, path)
        if err:
            failed.append({'file': path.name, 'reason': err})
            print(f'FAIL {path.name} — {err}', file=sys.stderr)
        else:
            uploaded[path.name] = url
            print(f'OK   {path.name} → {url}', file=sys.stderr)

    result = {'uploaded': uploaded, 'failed': failed}
    if args.json or not args.dry_run:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
