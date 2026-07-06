#!/usr/bin/env python3
# Role: 인스타 카드뉴스 합성 CLI — cards.json + bg-NN.png → <slug>-NN.png (1080×1350)
# Key Features: 4:5 중앙 크롭·LANCZOS 리사이즈, 역할별(cover/body/cta) 텍스트 오버레이,
#               로고 합성(폭 99px 고정), 인덱스 badge(N/총), --self-test 회귀 모드
# Dependencies: Pillow만 (시스템 python3 3.9+). 폰트는 Pretendard variable 우선 자동 탐색, 나눔 폴백.
# Notes: body 카드는 박스·스크림 밴드 절대 금지(사용자 반려 이력) — 전면 균일 다크닝(0.78)만.
#        결정성 계약: 같은 cards.json + 같은 배경 → 같은 출력 (텍스트 수정 시 배경 재생성 불필요).

import argparse
import json
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageEnhance, ImageFont
except ImportError:
    sys.exit("Pillow가 필요합니다. 설치: python3 -m pip install --user pillow")

W, H = 1080, 1350            # 최종 규격 4:5 (craft 룰 1)
LEFT = 84                    # 좌측 텍스트 여백 (craft 룰 6: 가장자리 ≥72px)
BOTTOM = 96                  # 하단 텍스트 여백
LOGO_W = 99                  # 로고 폭 고정 — 2026-07-06 사용자 확정
LOGO_Y = 72                  # 로고 상단 y
BODY_DARKEN = 0.78           # body 전면 균일 다크닝 계수 (스모크 실증)
CTA_DIM_ALPHA = 115          # cta 전면 딤 ~45% (255×0.45)

# 폰트 자동 탐색 후보 — Pretendard variable 우선, 나눔 폴백 (craft 룰 4: 텍스트 = 100% Pillow)
VARIABLE_CANDIDATES = [
    "~/Library/Fonts/PretendardVariable.ttf",
    "/Library/Fonts/PretendardVariable.ttf",
    "/usr/share/fonts/truetype/pretendard/PretendardVariable.ttf",
]
NANUM_REGULAR = [
    "~/Library/Fonts/NanumGothic.ttf",
    "/Library/Fonts/NanumGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]
NANUM_BOLD = [
    "~/Library/Fonts/NanumGothicBold.ttf",
    "/Library/Fonts/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]


class FontProvider:
    """weight 축 폰트 로더 — variable이면 set_variation_by_axes, 아니면 Bold/Regular 2파일 매핑."""

    def __init__(self, regular, bold, variable):
        self.regular, self.bold, self.variable = regular, bold, variable

    def get(self, size, weight):
        path = self.regular if (self.variable or weight < 700) else self.bold
        font = ImageFont.truetype(path, size)
        if self.variable:
            font.set_variation_by_axes([weight])
        return font


def _first_existing(candidates):
    # 후보 경로 순회 — 먼저 발견된 것 사용 (사용자 폰트 > 시스템 폰트 순)
    for c in candidates:
        p = Path(c).expanduser()
        if p.exists():
            return str(p)
    return None


def find_fonts(explicit):
    if explicit:
        p = Path(explicit).expanduser()
        if not p.exists():
            sys.exit(f"--font 경로가 없습니다: {p}")
        return FontProvider(str(p), str(p), variable=True)
    v = _first_existing(VARIABLE_CANDIDATES)
    if v:
        return FontProvider(v, v, variable=True)
    r = _first_existing(NANUM_REGULAR)
    if r:
        return FontProvider(r, _first_existing(NANUM_BOLD) or r, variable=False)
    sys.exit(
        "한글 폰트를 찾지 못했습니다. Pretendard 설치 권장: "
        "https://github.com/orioncactus/pretendard 의 PretendardVariable.ttf를 "
        "~/Library/Fonts 에 넣으세요 (나눔고딕도 폴백으로 지원)."
    )


def crop_resize(bg):
    """중앙 4:5 크롭 → 1080×1350 LANCZOS (craft 룰 1 — 규격은 여기서 보장)."""
    w, h = bg.size
    target = W / H
    if w / h > target:
        new_w = int(h * target)
        x0 = (w - new_w) // 2
        box = (x0, 0, x0 + new_w, h)
    else:
        new_h = int(w / target)
        y0 = (h - new_h) // 2
        box = (0, y0, w, y0 + new_h)
    return bg.crop(box).resize((W, H), Image.LANCZOS)


def draw_logo(img, logo):
    # 로고 = 이미지 에셋 합성(폭 99px 고정), 폰트 렌더 금지 — 없으면 스킵 (브랜드-범용)
    if logo is None:
        return
    resized = logo.resize((LOGO_W, max(1, round(logo.height * LOGO_W / logo.width))), Image.LANCZOS)
    img.paste(resized, ((W - LOGO_W) // 2, LOGO_Y), resized)


def draw_badge(img, fonts, index, total):
    # 카드 인덱스 N/총 — 우상단 (craft 룰 10)
    draw = ImageDraw.Draw(img)
    font = fonts.get(30, 600)
    text = f"{index}/{total}"
    tw = draw.textlength(text, font=font)
    draw.text((W - 72 - tw, 76), text, font=font, fill=(255, 255, 255))


def apply_bottom_gradient(img):
    """표지 하단 가독 그라디언트 — 부드러운 페더, 경계선 금지 (스크림 밴드 사용자 반려 이력)."""
    start = int(H * 0.45)
    mask = Image.new("L", (1, H), 0)
    for y in range(start, H):
        mask.putpixel((0, y), int(200 * (y - start) / (H - start)))
    img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), mask.resize((W, H)))


def compose_cover(img, card, fonts):
    apply_bottom_gradient(img)
    draw = ImageDraw.Draw(img)
    hook_lines = card["hook_lines"]
    hook_lh = round(92 * 1.18)
    # 좌하단 블록: 서브타이틀(44 w600) 위 + 훅(92 w800) 아래 — 하단 여백 96 기준 상향 적층
    y = H - BOTTOM - (44 + 20 + hook_lh * len(hook_lines))
    draw.text((LEFT, y), card["sub"], font=fonts.get(44, 600), fill=(255, 255, 255))
    y += 44 + 20
    hook_font = fonts.get(92, 800)
    for line in hook_lines:
        draw.text((LEFT, y), line, font=hook_font, fill=(255, 255, 255))
        y += hook_lh


def compose_body(img, card, fonts):
    # 박스·밴드 금지 — 전면 균일 다크닝만. 가독 1차 책임은 배경 생성 프롬프트(텍스트 영역 단순화).
    img.paste(ImageEnhance.Brightness(img).enhance(BODY_DARKEN), (0, 0))
    draw = ImageDraw.Draw(img)
    y = 260
    title_font = fonts.get(64, 800)
    for line in card["title_lines"][:2]:
        draw.text((LEFT, y), line, font=title_font, fill=(255, 255, 255))
        y += round(64 * 1.3)
    y += 40
    body_font = fonts.get(40, 500)
    for line in card["body_lines"]:
        draw.text((LEFT, y), line, font=body_font, fill=(240, 240, 240))
        y += round(40 * 1.65)


def compose_cta(img, card, fonts):
    # 표지 배경 재사용 전제(호출측 계약) + 전면 딤 ~45% + 중앙 정렬 핸들·서브
    img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), Image.new("L", (W, H), CTA_DIM_ALPHA))
    draw = ImageDraw.Draw(img)
    handle_font = fonts.get(112, 800)
    hw = draw.textlength(card["handle"], font=handle_font)
    draw.text(((W - hw) / 2, H / 2 - 130), card["handle"], font=handle_font, fill=(255, 255, 255))
    sub_font = fonts.get(42, 500)
    sw = draw.textlength(card["sub"], font=sub_font)
    draw.text(((W - sw) / 2, H / 2 + 24), card["sub"], font=sub_font, fill=(235, 235, 235))


COMPOSERS = {"cover": compose_cover, "body": compose_body, "cta": compose_cta}


def compose(spec, out_dir, bg_dir, fonts, logo):
    slug, cards = spec["slug"], spec["cards"]
    produced = []
    for card in cards:
        idx, role = card["index"], card["role"]
        if role not in COMPOSERS:
            sys.exit(f"알 수 없는 role: {role} (index {idx}) — cover|body|cta 만 허용")
        # CTA는 표지 배경 재사용 — 생성 호출 N-1회 계약 (craft 룰 9)
        bg_path = bg_dir / ("bg-01.png" if role == "cta" else f"bg-{idx:02d}.png")
        if not bg_path.exists():
            sys.exit(f"배경이 없습니다: {bg_path} (index {idx}, role {role})")
        img = crop_resize(Image.open(bg_path).convert("RGB"))
        COMPOSERS[role](img, card, fonts)
        draw_logo(img, logo)
        draw_badge(img, fonts, idx, len(cards))
        out = out_dir / f"{slug}-{idx:02d}.png"
        img.save(out)
        produced.append(out)
    return produced


def self_test():
    """외부 의존 없는 회귀 확인 — 단색 배경 3장 → 4카드(cover/body×2/cta) 합성 → 치수·파일명 assert."""
    fonts = find_fonts(None)
    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        for i, color in enumerate([(28, 52, 84), (36, 76, 60), (70, 44, 88)], start=1):
            Image.new("RGB", (1600, 2000), color).save(td / f"bg-{i:02d}.png")
        spec = {
            "slug": "self-test",
            "cards": [
                {"index": 1, "role": "cover", "sub": "자가 테스트 서브타이틀", "hook_lines": ["첫 줄 훅 문구", "둘째 줄 훅"]},
                {"index": 2, "role": "body", "title_lines": ["본문 카드 타이틀"], "body_lines": ["본문 첫 문장이에요.", "본문 둘째 문장이에요."]},
                {"index": 3, "role": "body", "title_lines": ["둘째 본문 타이틀", "두 줄째"], "body_lines": ["문장 하나."]},
                {"index": 4, "role": "cta", "handle": "@self_test", "sub": "저장하고 팔로우하세요"},
            ],
            "caption": "",
            "hashtags": [],
        }
        produced = compose(spec, td, td, fonts, None)
        assert len(produced) == 4, produced
        for p in produced:
            assert p.exists() and p.name.startswith("self-test-"), p
            with Image.open(p) as im:
                assert im.size == (W, H), (p.name, im.size)
    print("SELF-TEST OK")


def main():
    ap = argparse.ArgumentParser(description="인스타 카드뉴스 합성 — cards.json + bg-NN.png → <slug>-NN.png (1080×1350)")
    ap.add_argument("--spec", help="cards.json 경로")
    ap.add_argument("--out-dir", help="산출 디렉토리 (기본: spec과 같은 폴더)")
    ap.add_argument("--bg-dir", help="배경 bg-NN.png 디렉토리 (기본: out-dir)")
    ap.add_argument("--font", help="폰트 파일 경로 (기본: Pretendard 자동 탐색 → 나눔 폴백)")
    ap.add_argument("--logo", help="로고타입 PNG 경로 (흰 글리프·투명배경 — 폭 99px 고정 합성). 생략 시 로고 없음")
    ap.add_argument("--self-test", action="store_true", help="외부 의존 없는 자가 테스트")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return
    if not args.spec:
        ap.error("--spec 이 필요합니다 (또는 --self-test)")

    spec_path = Path(args.spec).expanduser()
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir).expanduser() if args.out_dir else spec_path.parent
    bg_dir = Path(args.bg_dir).expanduser() if args.bg_dir else out_dir
    logo = None
    if args.logo:
        logo_path = Path(args.logo).expanduser()
        if not logo_path.exists():
            sys.exit(f"--logo 경로가 없습니다: {logo_path}")
        logo = Image.open(logo_path).convert("RGBA")
    for p in compose(spec, out_dir, bg_dir, find_fonts(args.font), logo):
        print(p)


if __name__ == "__main__":
    main()
