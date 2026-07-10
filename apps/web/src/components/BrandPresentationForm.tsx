/**
 * Role: 브랜드 presentation 편집 폼 — 상세 편집 모드의 manifest.presentation 입력 (스펙 §5)
 * Key Features: 전체 필드 프리필(subtitle·tagline·website·audience·keyMessage·avoid·toneLabel·typography·voiceTone·neutralPalette), 콤마 분리 리스트 파싱, icon·logo 보존
 * Dependencies: @marketing-ax/components (Button·Input), i18n
 * Notes: 저장 시맨틱은 통째 교체(PUT presentation — 병합 아님). 에셋 업로드가 소유하는
 *        icon/logo 필드만 initial에서 그대로 이월해 폼 저장이 에셋 연결을 지우지 않게 한다.
 */
import { useId, useState, type FormEvent } from 'react';
import type { BrandPresentation } from '@marketing-ax/contracts';
import { Button, Input } from '@marketing-ax/components';
import { useI18n } from '../i18n';
import styles from './BrandPresentationForm.module.css';

interface Props {
  initial?: BrandPresentation;
  saving: boolean;
  error: string | null;
  /** 폼 전체 상태로 구성한 presentation — 호출측이 PUT /api/brands/:id 로 통째 교체 */
  onSave: (presentation: BrandPresentation) => void;
  onCancel: () => void;
}

// 콤마 분리 입력 → 배열 (공백 항목 제거) — voiceTone·neutralPalette 공용
function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BrandPresentationForm({ initial, saving, error, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const uid = useId();
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [audience, setAudience] = useState(initial?.audience ?? '');
  const [keyMessage, setKeyMessage] = useState(initial?.keyMessage ?? '');
  const [avoid, setAvoid] = useState(initial?.avoid ?? '');
  const [toneLabel, setToneLabel] = useState(initial?.toneLabel ?? '');
  const [voiceTone, setVoiceTone] = useState((initial?.voiceTone ?? []).join(', '));
  const [typoFamily, setTypoFamily] = useState(initial?.typography?.family ?? '');
  const [typoRoles, setTypoRoles] = useState(initial?.typography?.roles ?? '');
  const [typoWeights, setTypoWeights] = useState(initial?.typography?.weights ?? '');
  const [neutralPalette, setNeutralPalette] = useState(
    (initial?.neutralPalette ?? []).join(', '),
  );

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const p: BrandPresentation = {};
    if (subtitle.trim()) p.subtitle = subtitle.trim();
    if (tagline.trim()) p.tagline = tagline.trim();
    if (website.trim()) p.website = website.trim();
    if (audience.trim()) p.audience = audience.trim();
    if (keyMessage.trim()) p.keyMessage = keyMessage.trim();
    if (avoid.trim()) p.avoid = avoid.trim();
    if (toneLabel.trim()) p.toneLabel = toneLabel.trim();
    const tones = parseCommaList(voiceTone);
    if (tones.length > 0) p.voiceTone = tones;
    // BrandTypography.family 필수 — family 없이 roles/weights만은 버린다
    if (typoFamily.trim()) {
      p.typography = {
        family: typoFamily.trim(),
        ...(typoRoles.trim() ? { roles: typoRoles.trim() } : {}),
        ...(typoWeights.trim() ? { weights: typoWeights.trim() } : {}),
      };
    }
    const neutrals = parseCommaList(neutralPalette);
    if (neutrals.length > 0) p.neutralPalette = neutrals;
    // 통째 교체가 에셋 연결을 지우지 않도록 icon/logo는 폼 밖에서 이월
    if (initial?.icon) p.icon = initial.icon;
    if (initial?.logo) p.logo = initial.logo;
    onSave(p);
  }

  const field = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    hint?: string,
    wide?: boolean,
  ) => (
    <div className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <label className={styles.label} htmlFor={`${uid}-${key}`}>
        {label}
      </label>
      <Input
        id={`${uid}-${key}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
      />
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit} data-testid="brand-presentation-form">
      <div className={styles.grid}>
        {field('subtitle', t('brands.fieldSubtitle'), subtitle, setSubtitle)}
        {field('tagline', t('brands.fieldTagline'), tagline, setTagline)}
        {field('website', t('brands.fieldWebsite'), website, setWebsite)}
        {field('audience', t('brands.fieldAudience'), audience, setAudience)}
        {field('keyMessage', t('brands.fieldKeyMessage'), keyMessage, setKeyMessage, undefined, true)}
        {field('avoid', t('brands.fieldAvoid'), avoid, setAvoid, undefined, true)}
        {field('toneLabel', t('brands.fieldToneLabel'), toneLabel, setToneLabel)}
        {field('voiceTone', t('brands.voiceTone'), voiceTone, setVoiceTone, t('brands.fieldCommaHint'))}
        {field('typoFamily', t('brands.fieldTypographyFamily'), typoFamily, setTypoFamily)}
        {field('typoRoles', t('brands.fieldTypographyRoles'), typoRoles, setTypoRoles)}
        {field('typoWeights', t('brands.fieldTypographyWeights'), typoWeights, setTypoWeights)}
        {field(
          'neutralPalette',
          t('brands.fieldNeutralPalette'),
          neutralPalette,
          setNeutralPalette,
          t('brands.fieldCommaHint'),
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onCancel} disabled={saving}>
          {t('brands.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {t('brands.save')}
        </Button>
      </div>
    </form>
  );
}
