// Role: Braze IAM 메시지 모니터/관리 패널 (TasksView 내 섹션)
// Key Features: 메시지 목록, 상태 배지, 상세 패널(기획안+변형), 삭제, 파일뷰어 연동
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
} from '@open-design/contracts';
import { Button, VisuallyHidden } from '@open-design/components';

import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { Icon } from './Icon';
import { navigate } from '../router';
import {
  statusToBadge,
  isAwaitingAnswer,
  isVariantOpenable,
  formatBrazeDate,
} from './braze-helpers';

import styles from './BrazeSection.module.css';

type ProjectSummary = { id: string; name: string };

interface BrazeSectionProps {
  /** 전달받은 프로젝트 목록 (TasksView 내부 state 에서 내려옴) */
  projects?: ProjectSummary[];
  /** 초기 선택 프로젝트 ID (optional) */
  initialProjectId?: string;
}

// 배지 CSS 클래스 이름 매핑 — statusToBadge 리턴값과 1:1 대응
// Record 의 value 를 string 으로 강제해 TS2322 방지
const BADGE_CLASS: Record<ReturnType<typeof statusToBadge>, string> = {
  interviewing: styles.badgeInterviewing as string,
  draft: styles.badgeDraft as string,
  confirmed: styles.badgeConfirmed as string,
  producing: styles.badgeProducing as string,
  produced: styles.badgeProduced as string,
  editing: styles.badgeEditing as string,
  done: styles.badgeDone as string,
};

// 각 BrazeMessageStatus 에 대응하는 i18n 키 매핑
// Dict 의 타입 안정성 보장을 위해 명시적 Record 사용
const STATUS_I18N_KEY: Record<BrazeMessageStatus, keyof Dict> = {
  interviewing: 'braze.status.interviewing',
  plan_draft: 'braze.status.plan_draft',
  plan_confirmed: 'braze.status.plan_confirmed',
  producing: 'braze.status.producing',
  produced: 'braze.status.produced',
  editing: 'braze.status.editing',
  done: 'braze.status.done',
};

function StatusBadge({ status }: { status: BrazeMessageStatus }) {
  const t = useT();
  const badge = statusToBadge(status);
  const label = t(STATUS_I18N_KEY[status]);
  return (
    <span className={`${styles.badge} ${BADGE_CLASS[badge]}`}>
      {label}
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
                {/* variant status (produced/editing/done) 를 메시지 상태로 맵핑 */}
                <StatusBadge status={v.status as BrazeMessageStatus} />
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

// 상세 패널 (선택된 메시지의 기획안 + 변형 목록)
function MessageDetail({
  message,
  onClose,
}: {
  message: BrazeMessage;
  onClose: () => void;
}) {
  const t = useT();

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

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null;

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
      {/* 헤더 */}
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{t('braze.eyebrow')}</span>
        <h2 id="braze-section-title" className={styles.title}>{t('braze.title')}</h2>
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
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{msg.title}</span>
                  <div className={styles.rowMeta}>
                    <StatusBadge status={msg.status} />
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
                <div className={styles.rowActions}>
                  {/* 상세 패널 토글 — chevron-down 만 있으므로 회전 CSS 로 up 표현 */}
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
                {/* 상세 패널 인라인 확장 */}
                {isSelected && selectedMessage ? (
                  <MessageDetail
                    message={selectedMessage}
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
