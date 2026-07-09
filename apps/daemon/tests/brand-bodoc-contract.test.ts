import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const brandRoot = path.resolve(here, '../../../brands/bodoc');

describe('bodoc brand content contract', () => {
  it('brand.md carries brand-critical facts (palette, deeplink, voice, services)', async () => {
    const body = await fs.readFile(path.join(brandRoot, 'brand.md'), 'utf8');
    expect(body).toContain('#16C5FF'); // 시그니처 (팔레트 정본)
    expect(body).toContain('#1E86FA'); // 캐릭터 바디 정본
    expect(body).toContain('bodoc://action/Login?method=kakao'); // 딥링크 카탈로그
    expect(body).toContain('전문가'); // 호칭 표준
    expect(body).toContain('숨은보험금'); // 핵심 용어
  });

  it('deliverables carry channel facts in the right file', async () => {
    const iam = await fs.readFile(path.join(brandRoot, 'deliverables/iam.md'), 'utf8');
    expect(iam).toContain('PREVIEW_PLACEHOLDERS'); // 발송 차단 신호
    expect(iam).toContain('하프시트'); // 3사이즈 포맷
    const cardnews = await fs.readFile(path.join(brandRoot, 'deliverables/cardnews.md'), 'utf8');
    expect(cardnews).toContain('brands/bodoc/assets/character-sheet.png'); // 경로 치환 완료
    expect(cardnews).not.toContain('design-systems/bodoc'); // 구경로 잔존 금지
    const blog = await fs.readFile(path.join(brandRoot, 'deliverables/blog.md'), 'utf8');
    expect(blog).toContain('blog.naver.com/aijinet');
  });

  it('old bodoc design system is gone', async () => {
    await expect(
      fs.access(path.resolve(here, '../../../design-systems/bodoc')),
    ).rejects.toThrow();
  });
});
