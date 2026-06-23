// Role: Braze IAM 메시지 모니터/관리 패널 (TasksView 내 섹션)
// Key Features: 메시지 목록, 상태 배지(메시지/변형 분리), 상세 패널(GET :id 신선 fetch), 삭제, FileViewer 연동
// Dependencies: @open-design/contracts, @open-design/components, braze-helpers
// Notes: 인터뷰·계획 확인은 question-form + Questions 탭 전용 — 이 컴포넌트는 읽기/삭제만

import { useCallback, useEffect, useState } from 'react';
import type {
  BrazeMessage,
  BrazeMessageStatus,
  BrazePlan,
  BrazePlanCta,
  BrazePlanVariant,
  BrazeVariant,
  BrazeVariantStatus,
} from '@open-design/contracts';
import { Button, VisuallyHidden } from '@open-design/components';

import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { Icon } from './Icon';
import { navigate } from '../router';
import {
  statusToBadge,
  variantStatusToBadge,
  isAwaitingAnswer,
  isVariantOpenable,
  formatBrazeDate,
  type BrazeBadgeVariant,
} from './braze-helpers';

import styles from './BrazeSection.module.css';

type ProjectSummary = { id: string; name: string };

interface BrazeSectionProps {
  /** 전달받은 프로젝트 목록 (TasksView 내부 state 에서 내려옴) */
  projects?: ProjectSummary[];
  /** 초기 선택 프로젝트 ID (optional) */
  initialProjectId?: string;
}

// 배지 CSS 클래스 이름 매핑 — BrazeBadgeVariant 와 1:1 대응
// CSS Module 클래스가 undefined 일 수 없도록 as string 캐스팅
const BADGE_CLASS: Record<BrazeBadgeVariant, string> = {
  interviewing: styles.badgeInterviewing as string,
  draft: styles.badgeDraft as string,
  confirmed: styles.badgeConfirmed as string,
  producing: styles.badgeProducing as string,
  produced: styles.badgeProduced as string,
  editing: styles.badgeEditing as string,
  done: styles.badgeDone as string,
  pending: styles.badgePending as string,
};

// 메시지 상태 → i18n 키 (keyof Dict 로 타입 안전)
const MSG_STATUS_I18N: Record<BrazeMessageStatus, keyof Dict> = {
  interviewing: 'braze.status.interviewing',
  plan_draft: 'braze.status.plan_draft',
  plan_confirmed: 'braze.status.plan_confirmed',
  producing: 'braze.status.producing',
  produced: 'braze.status.produced',
  editing: 'braze.status.editing',
  done: 'braze.status.done',
};

// 변형 상태 → i18n 키 — pending 포함, BrazeMessageStatus 와 완전 분리
const VARIANT_STATUS_I18N: Record<BrazeVariantStatus, keyof Dict> = {
  pending: 'braze.status.pending',
  produced: 'braze.status.produced',
  editing: 'braze.status.editing',
  done: 'braze.status.done',
};

function MessageStatusBadge({ status }: { status: BrazeMessageStatus }) {
  const t = useT();
  const badge = statusToBadge(status);
  return (
    <span className={`${styles.badge} ${BADGE_CLASS[badge]}`}>
      {t(MSG_STATUS_I18N[status])}
    </span>
  );
}

// 변형 전용 배지 — BrazeVariantStatus 를 직접 받아 as 캐스팅 없이 처리
function VariantStatusBadge({ status }: { status: BrazeVariantStatus }) {
  const t = useT();
  const badge = variantStatusToBadge(status);
  return (
    <span className={`${styles.badge} ${BADGE_CLASS[badge]}`}>
      {t(VARIANT_STATUS_I18N[status])}
    </span>
  );
}

// 기획안(BrazePlan)을 사람이 읽을 수 있는 카드로 렌더링
function PlanCard({ plan }: { plan: BrazePlan }) {
  const t = useT();

  return (
    <div className={styles.plan}>
      <div className={styles.planSection}>
        <span className={styles.planSectionLabel}>{t('braze.planSummaryTitle')}</span>
        <p className={styles.planSectionBody}>{plan.summary}</p>
      </div>

      {plan.emphasis.length > 0 && (
        <div className={styles.planSection}>
          <span className={styles.planSectionLabel}>{t('braze.planEmphasisTitle')}</span>
          <ul className={styles.planList}>
            {plan.emphasis.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(plan.targeting.segment || plan.targeting.triggerEvent) && (
        <div className={styles.planSection}>
          <span className={styles.planSectionLabel}>{t('braze.planTargetingTitle')}</span>
          <p className={styles.planSectionBody}>
            {[plan.targeting.segment, plan.targeting.triggerEvent]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      )}

      {plan.cta.length > 0 && (
        <div className={styles.planSection}>
          <span className={styles.planSectionLabel}>{t('braze.planCtaTitle')}</span>
          <ul className={styles.planList}>
            {plan.cta.map((c: BrazePlanCta, i: number) => (
              <li key={i}>
                {c.label}
                {c.deeplink ? ` → ${c.deeplink}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.variants.length > 0 && (
        <div className={styles.planSection}>
          <span className={styles.planSectionLabel}>{t('braze.planVariantsTitle')}</span>
          <ul className={styles.planList}>
            {plan.variants.map((v: BrazePlanVariant, i: number) => (
              <li key={i}>
                <strong>{v.label}</strong> — {v.angle}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 변형(variant) 목록 — artifactPath 있으면 FileViewer 로 열기 버튼 노출
function VariantList({
  variants,
  conversationId,
  projectId,
}: {
  variants: BrazeVariant[];
  conversationId: string;
  projectId: string;
}) {
  const t = useT();
  if (variants.length === 0) return null;

  return (
    <div className={styles.variants}>
      <span className={styles.variantsTitle}>{t('braze.variantsTitle')}</span>
      <ul className={styles.variantList}>
        {variants.map((v: BrazeVariant) => {
          const openable = isVariantOpenable(v);
          return (
            <li key={v.id} className={styles.variant}>
              <span className={styles.variantLabel}>{v.label}</span>
              <span className={styles.variantStatus}>
                {/* BrazeVariantStatus 타입 그대로 전달 — as 캐스팅 없음 */}
                <VariantStatusBadge status={v.status} />
              </span>
              {openable ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    // 기존 FileViewer 경로로 열기 — artifact 파일을 프로젝트 뷰에서 직접 열람
                    navigate({
                      kind: 'project',
                      projectId,
                      conversationId,
                      fileName: v.artifactPath!,
                    });
                  }}
                  aria-label={t('braze.variantOpenAria')}
                  title={t('braze.variantOpenAria')}
                >
                  <Icon name="external-link" size={13} />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 상세 패널 — GET /api/braze/messages/:id 로 신선한 데이터 fetch
// 목록 항목을 fallback 으로 사용하고, fetch 완료 시 덮어씀
function MessageDetail({
  fallback,
  onClose,
}: {
  fallback: BrazeMessage;
  onClose: () => void;
}) {
  const t = useT();
  const [message, setMessage] = useState<BrazeMessage>(fallback);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/braze/messages/${fallback.id}`);
        if (!res.ok) return; // 실패 시 fallback 유지
        const json = (await res.json()) as { message: BrazeMessage };
        if (!cancelled && json.message) setMessage(json.message);
      } catch {
        // 네트워크 오류 시 목록 항목(fallback) 그대로 표시
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fallback.id]);

  return (
    <div className={styles.detail} role="region" aria-label={message.title}>
      <div className={styles.detailHead}>
        <h3 className={styles.detailTitle}>{message.title}</h3>
        <Button variant="ghost" onClick={onClose} aria-label={t('braze.closeDetail')}>
          {/* 'close' 아이콘 사용 — Icon 타입에 'x' 없음 */}
          <Icon name="close" size={15} />
          <VisuallyHidden>{t('braze.closeDetail')}</VisuallyHidden>
        </Button>
      </div>

      {/* questionsTab 대기 힌트: interviewing 또는 plan_draft 상태일 때만 표시 */}
      {isAwaitingAnswer(message.status) && (
        <p className={styles.awaitingHint}>
          {/* 'comment' 아이콘 사용 — 'message-circle' 없음 */}
          <Icon name="comment" size={13} />
          {t('braze.awaitingAnswerHint')}
        </p>
      )}

      {detailLoading ? (
        <div className={styles.detailLoading}>{t('braze.loading')}</div>
      ) : null}

      {message.plan ? <PlanCard plan={message.plan} /> : null}

      <VariantList
        variants={message.variants}
        conversationId={message.conversationId}
        projectId={message.projectId}
      />
    </div>
  );
}

export function BrazeSection({ projects = [], initialProjectId }: BrazeSectionProps) {
  const t = useT();

  const [projectId, setProjectId] = useState<string>(initialProjectId ?? '');
  const [messages, setMessages] = useState<BrazeMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 목록 항목을 fallback 으로 사용 (상세 fetch 전 즉각 렌더)
  const fallbackMessage = messages.find((m) => m.id === selectedId) ?? null;

  const refresh = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/braze/messages?projectId=${encodeURIComponent(pid)}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${res.status}`);
      }
      const json = (await res.json()) as { messages: BrazeMessage[] };
      setMessages(json.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) void refresh(projectId);
    else setMessages([]);
    // 프로젝트 바뀌면 상세 패널 닫기
    setSelectedId(null);
  }, [projectId, refresh]);

  const remove = async (id: string) => {
    if (!window.confirm(t('braze.deleteConfirm'))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/braze/messages/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `delete failed: ${res.status}`);
      }
      if (selectedId === id) setSelectedId(null);
      void refresh(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={styles.root} aria-labelledby="braze-section-title">
      {/* 헤더 — 메시지 수를 braze.messageCount 로 표시 (Fix 3: 사용되지 않던 키 활용) */}
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{t('braze.eyebrow')}</span>
        <div className={styles.heroRow}>
          <h2 id="braze-section-title" className={styles.title}>{t('braze.title')}</h2>
          {messages.length > 0 && (
            <span className={styles.messageCount}>
              {t('braze.messageCount', { n: messages.length })}
            </span>
          )}
        </div>
        <p className={styles.lede}>{t('braze.lede')}</p>
      </header>

      {/* 프로젝트 선택 드롭다운 */}
      <div className={styles.projectPicker}>
        <label htmlFor="braze-project-select" className={styles.projectPickerLabel}>
          {t('braze.pickProjectLabel')}
        </label>
        <select
          id="braze-project-select"
          className={styles.projectPickerSelect}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">{t('braze.pickProject')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* 에러 */}
      {error ? (
        <div className={styles.notice} role="alert">
          {t('braze.error')}: {error}
        </div>
      ) : null}

      {/* 로딩 */}
      {loading ? (
        <div className={styles.loading}>{t('braze.loading')}</div>
      ) : projectId && messages.length === 0 && !error ? (
        // 빈 상태
        <div className={styles.empty}>
          <strong className={styles.emptyTitle}>{t('braze.emptyTitle')}</strong>
          <p>{t('braze.emptyBody')}</p>
        </div>
      ) : messages.length > 0 ? (
        // 메시지 목록
        <ul className={styles.list}>
          {messages.map((msg: BrazeMessage) => {
            const isBusy = busyId === msg.id;
            const isSelected = selectedId === msg.id;
            return (
              <li key={msg.id} className={styles.row}>
                {/* 행 주요 정보 */}
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{msg.title}</span>
                  <div className={styles.rowMeta}>
                    <MessageStatusBadge status={msg.status} />
                    <span aria-hidden="true">·</span>
                    <span>{msg.iamFormat}</span>
                    {msg.variants.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t('braze.variantCount', { n: msg.variants.length })}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{t('braze.updatedAt', { when: formatBrazeDate(msg.updatedAt) })}</span>
                  </div>
                </div>
                {/* 행 액션 */}
                <div className={styles.rowActions}>
                  {/* 상세 패널 토글 — chevron-down 을 CSS rotate 로 up 표현 */}
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedId(isSelected ? null : msg.id)}
                    aria-expanded={isSelected}
                    aria-label={isSelected ? t('braze.closeDetail') : t('braze.openDetail')}
                    style={isSelected ? { transform: 'rotate(180deg)' } : undefined}
                  >
                    <Icon name="chevron-down" size={13} />
                    <VisuallyHidden>
                      {isSelected ? t('braze.closeDetail') : t('braze.openDetail')}
                    </VisuallyHidden>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { void remove(msg.id); }}
                    disabled={isBusy}
                    aria-label={t('braze.deleteAria')}
                    title={t('braze.deleteTitle')}
                  >
                    {isBusy
                      ? <span>{t('braze.deleting')}</span>
                      : <Icon name="trash" size={13} />}
                    <VisuallyHidden>{t('braze.deleteAria')}</VisuallyHidden>
                  </Button>
                </div>
                {/* 상세 패널: flex-basis 100% 로 전체 폭 차지 (Fix 2) */}
                {isSelected && fallbackMessage ? (
                  <MessageDetail
                    fallback={fallbackMessage}
                    onClose={() => setSelectedId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
