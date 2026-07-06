#!/usr/bin/env python3
# Role: 인스타 카드뉴스 합성 CLI — cards.json + bg-NN.png → <slug>-NN.png (1080×1350)
# Key Features: 역할별(cover/body/cta) 텍스트 오버레이, 로고 합성(폭 99px 고정), --self-test 지오메트리 회귀 모드
# Dependencies: Pillow만 (시스템 python3 3.9+). 폰트는 Pretendard variable 우선 자동 탐색, 나눔 폴백.
# Notes: body 카드는 박스·스크림 밴드·전면 균일 다크닝 금지 — 하단 페더 그라디언트만(v2 레퍼런스 실측).
#        결정성 계약: 같은 cards.json + 같은 배경 → 같은 출력 (텍스트 수정 시 배경 재생성 불필요).

import argparse
import json
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow가 필요합니다. 설치: python3 -m pip install --user pillow")

W, H = 1080, 1350            # 최종 규격 4:5 (craft 룰 1)
LEFT = 84                    # 좌측 텍스트 여백 (craft 룰 6: 가장자리 ≥72px)
BOTTOM = 96                  # 하단 텍스트 여백 (cover)
LOGO_W = 99                  # 로고 폭 고정 — 2026-07-06 사용자 확정
LOGO_Y = 72                  # 로고 상단 y
CTA_DIM_ALPHA = 115          # cta 전면 균일 딤 ~45% 고정 — 그라디언트 금지 (2026-07-06 재확인)
COVER_GRAD_START, COVER_GRAD_PEAK = 0.45, 200  # cover 하단 그라디언트 (기존 유지)
BODY_GRAD_START, BODY_GRAD_PEAK = 0.40, 230    # body 하단 그라디언트 (레퍼런스 실측 근사)
BODY_TITLE_SIZE = 58         # body 타이틀 (레퍼런스 잉크 44~49px 실측)
BODY_TEXT_SIZE = 43          # body 본문 (레퍼런스 잉크 34px 실측)
BODY_PITCH = 62              # body 타이틀·본문 공통 줄 피치 (실측 균일)
BODY_TITLE_INK_TOP = 648     # 타이틀 첫 줄 잉크 상단 (실측 646~650)
BODY_TEXT_INK_TOP = 794      # 본문 첫 줄 잉크 상단 (실측 793~794 — 타이틀 줄수 무관 고정)
BODY_MAX_INK = W - 2 * LEFT  # 912 — 본문 잉크 폭 한계 (좌우 대칭 84px, 우측 한계 x=996)
BODY_MIN_FILL = 0.8          # body 최장 줄 하한 비율 — 미달 = 좁은 컬럼 경고 (레퍼런스 실측 98%)

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


def apply_bottom_gradient(img, start_ratio=COVER_GRAD_START, peak_alpha=COVER_GRAD_PEAK):
    """하단 가독 페더 그라디언트 — 경계선 금지 (스크림 밴드 사용자 반려 이력).
    cover(0.45H/α200)·body(0.40H/α230)가 파라미터만 달리해 공용."""
    start = int(H * start_ratio)
    mask = Image.new("L", (1, H), 0)
    for y in range(start, H):
        mask.putpixel((0, y), int(peak_alpha * (y - start) / (H - start)))
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


def body_width_report(card, fonts):
    """body 카드 줄폭 검사 — (errors, warnings). 자동 재줄바꿈 없음(결정성 계약).
    초과는 프레임 밖 잘림이라 에러, 좁은 컬럼(절반 폭 줄바꿈)은 계약 위반 신호라 경고."""
    draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    title_font = fonts.get(BODY_TITLE_SIZE, 800)
    body_font = fonts.get(BODY_TEXT_SIZE, 500)
    errors, warnings = [], []
    for label, lines, font in (("title", card["title_lines"][:2], title_font),
                               ("body", card["body_lines"], body_font)):
        for line in lines:
            ink = draw.textlength(line, font=font)
            if ink > BODY_MAX_INK:
                errors.append(
                    f"index {card['index']} {label} 줄 잉크 {ink:.0f}px > 한계 {BODY_MAX_INK}px: {line!r}")
    longest = max((draw.textlength(l, font=body_font) for l in card["body_lines"]), default=0)
    if card["body_lines"] and longest < BODY_MAX_INK * BODY_MIN_FILL:
        warnings.append(
            f"index {card['index']} 본문 최장 줄 {longest:.0f}px < 가용폭 80%"
            f"({BODY_MAX_INK * BODY_MIN_FILL:.0f}px) — 좁은 컬럼: 한 줄 19~21자로 재줄바꿈 권장")
    return errors, warnings


def compose_body(img, card, fonts):
    # 박스·스크림 밴드 절대 금지 — v2: 하단 페더 그라디언트만 (전면 균일 다크닝 폐기,
    # 레퍼런스 실측 2026-07-06). 가독 1차 책임은 여전히 배경 프롬프트(하반부 단순화).
    apply_bottom_gradient(img, BODY_GRAD_START, BODY_GRAD_PEAK)
    draw = ImageDraw.Draw(img)
    title_font = fonts.get(BODY_TITLE_SIZE, 800)
    # 잉크 상단 고정 앵커 — draw.text의 y는 라인박스 상단이라 대표 글리프("한")의
    # 잉크 오프셋만큼 보정 (폰트 폴백이 바뀌어도 앵커 유지)
    y = BODY_TITLE_INK_TOP - title_font.getbbox("한")[1]
    for line in card["title_lines"][:2]:
        draw.text((LEFT, y), line, font=title_font, fill=(255, 255, 255))
        y += BODY_PITCH
    body_font = fonts.get(BODY_TEXT_SIZE, 500)
    y = BODY_TEXT_INK_TOP - body_font.getbbox("한")[1]
    for line in card["body_lines"]:
        draw.text((LEFT, y), line, font=body_font, fill=(240, 240, 240))
        y += BODY_PITCH


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
    # 본문 레이아웃 분기 예약 — 현재 basic만 구현 (free = 자유형 후속 트랙)
    layout = spec.get("body_layout", "basic")
    if layout != "basic":
        sys.exit(f"body_layout '{layout}'은 미구현 — 현재 basic만 지원 (free는 후속 트랙)")
    slug, cards = spec["slug"], spec["cards"]
    produced = []
    for card in cards:
        idx, role = card["index"], card["role"]
        if role not in COMPOSERS:
            sys.exit(f"알 수 없는 role: {role} (index {idx}) — cover|body|cta 만 허용")
        if role == "body":
            errors, warnings = body_width_report(card, fonts)
            if errors:
                sys.exit("본문 줄폭 한계 초과 — " + " / ".join(errors))
            for wmsg in warnings:
                print(f"경고: {wmsg}", file=sys.stderr)
        # CTA는 표지 배경 재사용 — 생성 호출 N-1회 계약 (craft 룰 9)
        bg_path = bg_dir / ("bg-01.png" if role == "cta" else f"bg-{idx:02d}.png")
        if not bg_path.exists():
            sys.exit(f"배경이 없습니다: {bg_path} (index {idx}, role {role})")
        img = crop_resize(Image.open(bg_path).convert("RGB"))
        COMPOSERS[role](img, card, fonts)
        draw_logo(img, logo)
        out = out_dir / f"{slug}-{idx:02d}.png"
        img.save(out)
        produced.append(out)
    return produced


def _text_bands(im, y_from=560, y_to=H, x_from=60, x_to=1020):
    """near-white(≥235) 행 밴드 검출 — 레퍼런스 실측과 동일 로직 (지오메트리 회귀 계약)."""
    px = im.convert("L").load()
    bands, cur = [], None
    for y in range(y_from, y_to):
        on = sum(1 for x in range(x_from, x_to, 3) if px[x, y] >= 235) >= 4
        if on and cur is None:
            cur = [y, y]
        elif on:
            cur[1] = y
        elif cur is not None and y - cur[1] > 6:
            bands.append(tuple(cur))
            cur = None
    if cur is not None:
        bands.append(tuple(cur))
    return bands


def self_test():
    """외부 의존 없는 회귀 확인 — 단색 배경 → 4카드 합성 → 치수·v2 지오메트리·badge 부재 assert."""
    fonts = find_fonts(None)
    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        for i, color in enumerate([(28, 52, 84), (36, 76, 60), (70, 44, 88)], start=1):
            Image.new("RGB", (1600, 2000), color).save(td / f"bg-{i:02d}.png")
        spec = {
            "slug": "self-test",
            "cards": [
                {"index": 1, "role": "cover", "sub": "자가 테스트 서브타이틀", "hook_lines": ["첫 줄 훅 문구", "둘째 줄 훅"]},
                {"index": 2, "role": "body", "title_lines": ["본문 카드 타이틀", "둘째 줄 타이틀"],
                 "body_lines": [f"본문 {n}번째 줄 문장을 스무 자 안팎 폭으로 채워요." for n in range(1, 8)]},
                {"index": 3, "role": "body", "title_lines": ["둘째 본문 타이틀"],
                 "body_lines": ["한 줄짜리 본문도 폭 규칙에 맞춰 길게 채웁니다."]},
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
                # badge 부재 — 우상단 영역 near-white 밴드 없음 (v2: badge 전면 제거)
                assert _text_bands(im, y_from=40, y_to=170, x_from=W - 220, x_to=W - 40) == [], p.name

        # v2 지오메트리 회귀 — 레퍼런스 실측 (타이틀 잉크 상단 648 / 본문 794 / 피치 62)
        with Image.open(td / "self-test-02.png") as im:
            bands = _text_bands(im)
            assert len(bands) == 9, bands  # 타이틀 2 + 본문 7
            assert abs(bands[0][0] - BODY_TITLE_INK_TOP) <= 6, bands[0]
            assert abs(bands[1][0] - bands[0][0] - BODY_PITCH) <= 4, bands[:2]
            assert abs(bands[2][0] - BODY_TEXT_INK_TOP) <= 6, bands[2]
            for a, b in zip(bands[2:], bands[3:]):
                assert abs(b[0] - a[0] - BODY_PITCH) <= 4, (a, b)
            assert bands[-1][1] <= H - 72, bands[-1]  # 안전여백 (craft 룰 6)
            # 하단 그라디언트 실효 — 텍스트 없는 좌하단이 좌상단보다 어두움 (균일 다크닝 폐기 확인)
            g = im.convert("L").load()
            assert g[10, H - 10] < g[10, 10], (g[10, H - 10], g[10, 10])

        # 줄폭 가드 — 초과 = 에러, 좁은 컬럼 = 경고 (핫픽스 2026-07-07: 줄폭 계약)
        wide_card = {"index": 9, "role": "body", "title_lines": ["타이틀"],
                     "body_lines": ["가" * 30]}
        errs, _ = body_width_report(wide_card, fonts)
        assert errs, "912px 초과 줄이 에러로 잡히지 않음"
        narrow_card = {"index": 9, "role": "body", "title_lines": ["타이틀"],
                       "body_lines": ["짧은 줄"]}
        errs2, warns = body_width_report(narrow_card, fonts)
        assert not errs2 and warns, (errs2, warns)
        # compose 경로에서도 초과가 에러로 끊기는지
        overflow = dict(spec)
        overflow["cards"] = [dict(spec["cards"][1], body_lines=["가" * 30])]
        try:
            compose(overflow, td, td, fonts, None)
            raise AssertionError("잉크 폭 초과가 에러 없이 통과")
        except SystemExit as e:
            assert "한계" in str(e.code), e.code

        # body_layout 분기 예약 — basic 외 값은 명시 에러
        bad = dict(spec)
        bad["body_layout"] = "free"
        try:
            compose(bad, td, td, fonts, None)
            raise AssertionError("body_layout=free가 에러 없이 통과")
        except SystemExit as e:
            assert "미구현" in str(e.code), e.code
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
