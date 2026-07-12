/**
 * Role: 브랜드 상세 리치 페이지 — 히어로 + 브랜드 컨텍스트 + 디자인 시스템 + 지식 문서(마스터-디테일) + 편집 모드
 * Key Features: manifest.presentation·palette 시각화, 문서 리스트→프리뷰 재호출, presentation 폼 편집,
 *   문서 본문 편집(brand.md·deliverables/*.md), 채널 추가/삭제, 아이콘/로고 업로드, 위험 구역 삭제, fetch 실패 폴백
 * Dependencies: providers/registry (fetchBrand + 쓰기 fetcher 6종), BrandPresentationForm, renderMarkdownToSafeHtml, i18n
 * Notes: 저장은 낙관 갱신 없이 fetchBrand 재호출(스펙 §5). 마크다운 내 상대 이미지 미렌더(기존 MVP 한계 유지).
 */
import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input, Textarea } from '@marketing-ax/components';
import type { BrandDeliverableInput, BrandDetail, BrandPresentation } from '@marketing-ax/contracts';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import { useI18n } from '../i18n';
import {
  addBrandDeliverable,
  deleteBrand,
  fetchBrand,
  removeBrandDeliverable,
  saveBrandDoc,
  updateBrand,
  uploadBrandAsset,
} from '../providers/registry';
import { brandAccentFallback } from './brand-accent';
import { BrandPresentationForm } from './BrandPresentationForm';
import styles from './BrandDetailView.module.css';

interface Props {
  brandId: string;
  onBack: () => void;
}

// 업로드 허용 mime — daemon asset 라우트 허용 목록과 동일 (png·jpeg·webp·svg)
const ASSET_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

export function BrandDetailView({ brandId, onBack }: Props) {
  const { t } = useI18n();
  const uid = useId();
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [doc, setDoc] = useState<string>('core'); // 'core' | deliverable key
  // 저장 성공 후 재fetch 트리거 — 낙관 갱신 없음 (스펙 §5)
  const [refresh, setRefresh] = useState(0);
  // presentation 편집
  const [editing, setEditing] = useState(false);
  const [presentationSaving, setPresentationSaving] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  // 문서 본문 편집
  const [docEditing, setDocEditing] = useState(false);
  const [docDraft, setDocDraft] = useState('');
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  // 채널 추가/삭제
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [channelKey, setChannelKey] = useState('');
  const [channelLabel, setChannelLabel] = useState('');
  const [channelDs, setChannelDs] = useState('');
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  // 에셋 업로드·삭제
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refetch = () => setRefresh((n) => n + 1);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetchBrand(brandId, doc === 'core' ? undefined : doc)
      .then((d) => alive && setDetail(d))
      .catch(() => {
        if (!alive) return;
        setDetail(null);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [brandId, doc, refresh]);

  if (failed) {
    return (
      <div className="tab-panel" data-testid="brand-detail">
        <Button variant="ghost" onClick={onBack}>
          {t('brands.back')}
        </Button>
        <div role="alert">{t('brands.loadFailed')}</div>
      </div>
    );
  }
  if (!detail) return <div className="tab-panel" data-testid="brand-detail" />;

  const p = detail.presentation;
  const primary = detail.primaryColor ?? detail.palette?.[0]?.value ?? brandAccentFallback(detail.id);
  const swatches = [
    ...(detail.palette?.map((e) => e.value) ?? []),
    ...(p?.neutralPalette ?? []),
  ];
  const channels = detail.deliverables.map((k) => detail.deliverableLabels?.[k] ?? k).join(' · ');
  const contextRows: Array<[string, string | undefined]> = [
    [t('brands.fieldTagline'), p?.tagline],
    [t('brands.fieldWebsite'), p?.website],
    [t('brands.fieldAudience'), p?.audience],
    [t('brands.fieldKeyMessage'), p?.keyMessage],
    [t('brands.fieldAvoid'), p?.avoid],
    [t('brands.fieldChannels'), channels || undefined],
  ];
  const body = doc === 'core' ? detail.body : detail.deliverable?.body ?? '';
  const docItems: Array<{ key: string; label: string }> = [
    { key: 'core', label: t('brands.coreDocLabel') },
    ...detail.deliverables.map((k) => ({ key: k, label: detail.deliverableLabels?.[k] ?? k })),
  ];
  const projectCount = detail.projectCount ?? 0;

  // presentation 폼 저장 — 통째 교체 PUT 후 재fetch
  async function handlePresentationSave(presentation: BrandPresentation) {
    if (!detail) return;
    setPresentationSaving(true);
    setPresentationError(null);
    const res = await updateBrand(detail.id, { presentation });
    setPresentationSaving(false);
    if ('error' in res) {
      setPresentationError(t('brands.saveFailed'));
      return;
    }
    setEditing(false);
    refetch();
  }

  // 활성 문서 본문 저장 — key = 'core' | deliverable 키
  async function handleDocSave() {
    if (!detail || docSaving) return;
    setDocSaving(true);
    setDocError(null);
    const res = await saveBrandDoc(detail.id, doc, docDraft);
    setDocSaving(false);
    if ('error' in res) {
      setDocError(t('brands.docSaveFailed'));
      return;
    }
    setDocEditing(false);
    refetch();
  }

  async function handleChannelAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const key = channelKey.trim();
    if (!detail || !key || channelBusy) return;
    setChannelBusy(true);
    setChannelError(null);
    const input: BrandDeliverableInput = {
      key,
      ...(channelLabel.trim() ? { label: channelLabel.trim() } : {}),
      ...(channelDs.trim() ? { designSystem: channelDs.trim() } : {}),
    };
    const res = await addBrandDeliverable(detail.id, input);
    setChannelBusy(false);
    if ('error' in res) {
      setChannelError(t('brands.channelAddFailed'));
      return;
    }
    setChannelFormOpen(false);
    setChannelKey('');
    setChannelLabel('');
    setChannelDs('');
    refetch();
  }

  async function handleChannelRemove(key: string) {
    if (!detail) return;
    if (!window.confirm(t('brands.channelRemoveConfirm', { key }))) return;
    setChannelError(null);
    const res = await removeBrandDeliverable(detail.id, key);
    if ('error' in res) {
      setChannelError(t('brands.channelRemoveFailed'));
      return;
    }
    if (doc === key) {
      // 활성 문서가 제거됨 → core로 복귀 (doc 변경이 재fetch를 겸함)
      setDocEditing(false);
      setDoc('core');
    } else {
      refetch();
    }
  }

  async function handleAssetUpload(role: 'icon' | 'logo', e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택도 change로 잡히도록 리셋
    if (!detail || !file) return;
    setUploadError(null);
    const res = await uploadBrandAsset(detail.id, file, role);
    if ('error' in res) {
      setUploadError(res.error.status === 413 ? t('brands.uploadTooLarge') : t('brands.uploadFailed'));
      return;
    }
    refetch();
  }

  async function handleDelete() {
    if (!detail || deleting) return;
    if (!window.confirm(t('brands.deleteConfirm', { title: detail.title }))) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteBrand(detail.id);
    if ('error' in res) {
      setDeleting(false);
      // 방금 바인딩된 프로젝트가 생긴 레이스 — 409의 projectCount로 사유를 구체화
      setDeleteError(
        res.error.status === 409 && typeof res.error.projectCount === 'number'
          ? t('brands.deleteBlocked', { n: res.error.projectCount })
          : t('brands.deleteFailed'),
      );
      return;
    }
    onBack();
  }

  return (
    <div className={styles.page} data-testid="brand-detail">
      <div className={styles.inner}>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.breadcrumbLink} onClick={onBack}>
          {t('brands.pageTitle')}
        </button>
        <span>/</span>
        <span>{detail.title}</span>
      </div>

      <div className={styles.hero}>
        {detail.iconUrl ? (
          <img className={styles.tile} src={detail.iconUrl} alt="" aria-hidden />
        ) : (
          <div className={styles.tile} style={{ background: primary }}>
            {detail.title.slice(0, 1)}
          </div>
        )}
        <div>
          <h1 className={styles.heroTitle}>{detail.title}</h1>
          {p?.subtitle && <p className={styles.heroSubtitle}>{p.subtitle}</p>}
        </div>
        <div className={styles.heroActions}>
          {!editing && (
            <Button variant="ghost" onClick={() => { setPresentationError(null); setEditing(true); }}>
              {t('brands.edit')}
            </Button>
          )}
          <label className={styles.uploadBtn}>
            {t('brands.uploadIcon')}
            <input
              type="file"
              accept={ASSET_ACCEPT}
              className={styles.fileInput}
              onChange={(e) => void handleAssetUpload('icon', e)}
            />
          </label>
          <label className={styles.uploadBtn}>
            {t('brands.uploadLogo')}
            <input
              type="file"
              accept={ASSET_ACCEPT}
              className={styles.fileInput}
              onChange={(e) => void handleAssetUpload('logo', e)}
            />
          </label>
        </div>
      </div>
      {uploadError && (
        <p className={styles.errorText} role="alert">
          {uploadError}
        </p>
      )}

      {editing ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionDot} />
            {t('brands.sectionContext')}
          </div>
          <BrandPresentationForm
            initial={p}
            saving={presentationSaving}
            error={presentationError}
            onSave={(next) => void handlePresentationSave(next)}
            onCancel={() => setEditing(false)}
          />
        </section>
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionDot} />
            {t('brands.sectionContext')}
          </div>
          <div className={styles.contextTable}>
            {contextRows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className={styles.contextRow}>
                  <span className={styles.contextKey}>{k}</span>
                  <span className={styles.contextValue}>{v}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDot} />
          {t('brands.sectionDesignSystem')}
        </div>
        <div className={styles.dsGrid}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t('brands.palette')}</div>
            <div className={styles.swatches}>
              {swatches.map((hex) => (
                <div key={hex} className={styles.swatch}>
                  <span className={styles.swatchChip} style={{ background: hex }} />
                  <span className={styles.swatchHex}>{hex}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t('brands.typography')}</div>
            {p?.typography && (
              <>
                <div className={styles.typeFamily}>{p.typography.family}</div>
                <div className={styles.typeMeta}>
                  {[p.typography.roles, p.typography.weights].filter(Boolean).join(' / ')}
                </div>
              </>
            )}
            <div className={styles.dsMeta}>
              {t('brands.paletteChannelMeta', { c: swatches.length, n: detail.deliverables.length })}
            </div>
          </div>
        </div>
        {p?.voiceTone && p.voiceTone.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t('brands.voiceTone')}</div>
            <div className={styles.toneChips}>
              {p.voiceTone.map((tone) => (
                <span key={tone} className={styles.toneChip}>
                  {tone}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDot} />
          {t('brands.sectionDocs')}
          {!docEditing && (
            <span className={styles.sectionHeadActions}>
              <Button
                variant="ghost"

                onClick={() => {
                  setDocError(null);
                  setDocDraft(body);
                  setDocEditing(true);
                }}
              >
                {t('brands.docEdit')}
              </Button>
            </span>
          )}
        </div>
        <p className={styles.heroSubtitle}>{t('brands.docsHint')}</p>
        <div className={styles.docs}>
          <div className={styles.docListCol}>
            <div className={styles.docList} role="tablist">
              {docItems.map((item) =>
                item.key === 'core' ? (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={doc === item.key}
                    className={`${styles.docItem} ${doc === item.key ? styles.docItemActive : ''}`}
                    onClick={() => {
                      setDocEditing(false);
                      setDoc(item.key);
                    }}
                  >
                    {item.label}
                  </button>
                ) : (
                  <div key={item.key} className={styles.docItemRow}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={doc === item.key}
                      className={`${styles.docItem} ${doc === item.key ? styles.docItemActive : ''}`}
                      onClick={() => {
                        setDocEditing(false);
                        setDoc(item.key);
                      }}
                    >
                      {item.label}
                    </button>
                    <button
                      type="button"
                      aria-label={t('brands.channelRemove')}
                      title={t('brands.channelRemove')}
                      className={styles.docItemRemove}
                      onClick={() => void handleChannelRemove(item.key)}
                    >
                      ×
                    </button>
                  </div>
                ),
              )}
            </div>
            {channelFormOpen ? (
              <form className={styles.channelForm} onSubmit={(e) => void handleChannelAdd(e)}>
                <div className={styles.channelField}>
                  <label className={styles.channelLabel} htmlFor={`${uid}-channel-key`}>
                    {t('brands.channelAddKey')}
                  </label>
                  <Input
                    id={`${uid}-channel-key`}
                    value={channelKey}
                    onChange={(e) => setChannelKey(e.target.value)}
                    disabled={channelBusy}
                  />
                  <p className={styles.channelHint}>{t('brands.channelAddKeyHint')}</p>
                </div>
                <div className={styles.channelField}>
                  <label className={styles.channelLabel} htmlFor={`${uid}-channel-label`}>
                    {t('brands.channelAddLabel')}
                  </label>
                  <Input
                    id={`${uid}-channel-label`}
                    value={channelLabel}
                    onChange={(e) => setChannelLabel(e.target.value)}
                    disabled={channelBusy}
                  />
                </div>
                <div className={styles.channelField}>
                  <label className={styles.channelLabel} htmlFor={`${uid}-channel-ds`}>
                    {t('brands.channelAddDesignSystem')}
                  </label>
                  <Input
                    id={`${uid}-channel-ds`}
                    value={channelDs}
                    onChange={(e) => setChannelDs(e.target.value)}
                    disabled={channelBusy}
                  />
                </div>
                {channelError && (
                  <p className={styles.errorText} role="alert">
                    {channelError}
                  </p>
                )}
                <div className={styles.channelActions}>
                  <Button onClick={() => setChannelFormOpen(false)} disabled={channelBusy}>
                    {t('brands.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"

                    disabled={channelBusy || !channelKey.trim()}
                  >
                    {t('brands.channelAddSubmit')}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <Button
                  variant="ghost"

                  onClick={() => {
                    setChannelError(null);
                    setChannelFormOpen(true);
                  }}
                >
                  {t('brands.channelAdd')}
                </Button>
                {channelError && (
                  <p className={styles.errorText} role="alert">
                    {channelError}
                  </p>
                )}
              </>
            )}
          </div>
          {docEditing ? (
            <div className={styles.docEditor}>
              <Textarea
                value={docDraft}
                onChange={(e) => setDocDraft(e.target.value)}
                rows={16}
                className={styles.docTextarea}
                disabled={docSaving}
              />
              {docError && (
                <p className={styles.errorText} role="alert">
                  {docError}
                </p>
              )}
              <div className={styles.docEditorActions}>
                <Button onClick={() => setDocEditing(false)} disabled={docSaving}>
                  {t('brands.cancel')}
                </Button>
                <Button variant="primary" onClick={() => void handleDocSave()} disabled={docSaving}>
                  {t('brands.save')}
                </Button>
              </div>
            </div>
          ) : (
            <article
              className={styles.docPreview}
              // 데몬이 소유한 신뢰 마크다운 → sanitize 렌더러 경유
              dangerouslySetInnerHTML={{ __html: renderMarkdownToSafeHtml(body) }}
            />
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDotDanger} />
          {t('brands.deleteZone')}
        </div>
        <div className={styles.dangerCard}>
          <Button
            className={styles.dangerBtn}
            disabled={projectCount > 0 || deleting}
            onClick={() => void handleDelete()}
          >
            {t('brands.delete')}
          </Button>
          {projectCount > 0 && (
            <p className={styles.dangerHint}>{t('brands.deleteBlocked', { n: projectCount })}</p>
          )}
          {deleteError && (
            <p className={styles.errorText} role="alert">
              {deleteError}
            </p>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
