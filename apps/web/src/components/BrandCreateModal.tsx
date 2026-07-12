/**
 * Role: 브랜드 생성 모달 — 핵심 4필드(제목·id·subtitle·tagline) 입력 → POST /api/brands
 * Key Features: 라틴 title 자동 슬러그 제안(수동 편집 시 잠금 해제 안 됨), 409 중복 id 에러 표시, 성공 시 onCreated(신규 id)
 * Dependencies: @marketing-ax/components (Dialog·Button·Input), providers/registry.createBrand, i18n
 * Notes: 전체 presentation 편집은 상세(BrandDetailView) 편집 모드 담당 — 여기는 생성 최소 필드만 (스펙 §5).
 */
import { useId, useState, type FormEvent } from 'react';
import type { BrandCreateInput, BrandPresentation } from '@marketing-ax/contracts';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@marketing-ax/components';
import { useI18n } from '../i18n';
import { createBrand } from '../providers/registry';
import styles from './BrandCreateModal.module.css';

interface Props {
  onClose: () => void;
  /** 생성 성공 — 신규 브랜드 id (daemon이 슬러그를 최종 확정하므로 응답 id 사용) */
  onCreated: (brandId: string) => void;
}

// 브랜드 로컬 슬러그 제안 — DS slugify 재사용 금지 (스펙 §3: 'design-system'
// 폴백이 비라틴 분기를 죽임). 비라틴 title은 빈 문자열 → 제안 없음으로 처리.
function suggestBrandId(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // 라틴 diacritics 제거 (é→e)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function BrandCreateModal({ onClose, onCreated }: Props) {
  const { t } = useI18n();
  const uid = useId();
  const [title, setTitle] = useState('');
  const [id, setId] = useState('');
  // id 필드를 한 번이라도 직접 편집하면 자동 제안을 영구히 끈다 — 사용자가
  // 고른 id를 title 변경이 덮어쓰지 않도록.
  const [idTouched, setIdTouched] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = (next: string) => {
    setTitle(next);
    if (!idTouched) setId(suggestBrandId(next));
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;
    setSubmitting(true);
    setError(null);
    const presentation: BrandPresentation = {};
    if (subtitle.trim()) presentation.subtitle = subtitle.trim();
    if (tagline.trim()) presentation.tagline = tagline.trim();
    const trimmedId = id.trim();
    const input: BrandCreateInput = {
      title: trimmedTitle,
      ...(trimmedId ? { id: trimmedId } : {}),
      ...(Object.keys(presentation).length > 0 ? { presentation } : {}),
    };
    const result = await createBrand(input);
    if ('error' in result) {
      setSubmitting(false);
      const duplicate = result.error.status === 409 || result.error.code === 'duplicate-id';
      setError(duplicate ? t('brands.newDuplicateId') : t('brands.newFailed'));
      return;
    }
    onCreated(result.brand.id);
  }

  return (
    <Dialog
      as="form"
      onSubmit={handleSubmit}
      onClose={submitting ? undefined : onClose}
      closeOnEscape
      ariaLabelledBy={`${uid}-title-heading`}
      className={styles.modal}
      data-testid="brand-create-modal"
    >
      <DialogHeader>
        <DialogTitle id={`${uid}-title-heading`}>{t('brands.newTitle')}</DialogTitle>
      </DialogHeader>
      <DialogBody className={styles.body}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${uid}-title`}>
            {t('brands.newFieldTitle')}
          </label>
          <Input
            id={`${uid}-title`}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            autoFocus
            required
            disabled={submitting}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${uid}-id`}>
            {t('brands.newFieldId')}
          </label>
          <Input
            id={`${uid}-id`}
            value={id}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value);
            }}
            disabled={submitting}
          />
          <p className={styles.hint}>{t('brands.newFieldIdHint')}</p>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${uid}-subtitle`}>
            {t('brands.fieldSubtitle')}
          </label>
          <Input
            id={`${uid}-subtitle`}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${uid}-tagline`}>
            {t('brands.fieldTagline')}
          </label>
          <Input
            id={`${uid}-tagline`}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            disabled={submitting}
          />
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} disabled={submitting}>
          {t('brands.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || !title.trim()}>
          {t('brands.newSubmit')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
