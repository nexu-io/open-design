import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';

interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface ShipReadinessResponse {
  generatedAt: string;
  branch: string | null;
  upstream: string | null;
  latestCommit: string | null;
  dirtyFiles: string[];
  node: {
    actual: string;
    wanted: string | null;
  };
  checks: ReadinessCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    ready: boolean;
  };
}

export function ShipReadinessView() {
  const [data, setData] = useState<ShipReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ship-readiness');
      setData(res.ok ? ((await res.json()) as ShipReadinessResponse) : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const checklist = useMemo(() => {
    if (!data) return '';
    const lines = [
      `Branch: ${data.branch ?? 'unknown'}`,
      `Latest: ${data.latestCommit ?? 'unknown'}`,
      `Upstream: ${data.upstream ?? 'none'}`,
      `Node: ${data.node.actual}${data.node.wanted ? ` (wanted ${data.node.wanted})` : ''}`,
      '',
      'Checks:',
      ...data.checks.map((c) => `- [${c.status === 'pass' ? 'x' : ' '}] ${c.label}: ${c.detail}`),
      '',
      data.dirtyFiles.length === 0
        ? 'Working tree: clean'
        : `Dirty files:\n${data.dirtyFiles.map((f) => `- ${f}`).join('\n')}`,
    ];
    return lines.join('\n');
  }, [data]);

  return (
    <div className="ship-readiness-view">
      <header className="ship-readiness-view__head">
        <div>
          <h1 className="ship-readiness-view__title">Ship readiness</h1>
          <p className="ship-readiness-view__lede">
            One screen for the checks reviewers ask for before a branch leaves the machine.
          </p>
        </div>
        <div className="ship-readiness-view__actions">
          <button type="button" className="ship-readiness-view__btn" onClick={() => void refresh()}>
            <Icon name="refresh" size={13} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="ship-readiness-view__btn"
            disabled={!data}
            onClick={() => {
              void navigator.clipboard?.writeText(checklist).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              });
            }}
          >
            <Icon name="copy" size={13} />
            <span>{copied ? 'Copied' : 'Copy checklist'}</span>
          </button>
        </div>
      </header>

      {loading && !data ? (
        <div className="ship-readiness-view__empty">
          <Icon name="spinner" size={18} />
        </div>
      ) : !data ? (
        <div className="ship-readiness-view__empty">Readiness endpoint unavailable.</div>
      ) : (
        <>
          <section className="ship-readiness-summary" aria-label="Readiness summary">
            <div className={`ship-readiness-summary__hero ${data.summary.ready ? 'is-ready' : 'is-blocked'}`}>
              <div className="ship-readiness-summary__kicker">
                {data.summary.ready ? 'Ready with caveats' : 'Blocked'}
              </div>
              <div className="ship-readiness-summary__score">
                {data.summary.pass}/{data.checks.length}
              </div>
              <div className="ship-readiness-summary__meta">
                {data.summary.fail} fail · {data.summary.warn} warn · generated{' '}
                {new Date(data.generatedAt).toLocaleTimeString()}
              </div>
            </div>
            <div className="ship-readiness-summary__facts">
              <div>
                <span>Branch</span>
                <strong>{data.branch ?? 'unknown'}</strong>
              </div>
              <div>
                <span>Latest</span>
                <strong>{data.latestCommit ?? 'unknown'}</strong>
              </div>
              <div>
                <span>Node</span>
                <strong>
                  {data.node.actual}
                  {data.node.wanted ? ` / ${data.node.wanted}` : ''}
                </strong>
              </div>
            </div>
          </section>

          <section className="ship-readiness-checks" aria-label="Checks">
            {data.checks.map((check) => (
              <article key={check.id} className={`ship-readiness-check ship-readiness-check--${check.status}`}>
                <div className="ship-readiness-check__status">
                  {check.status === 'pass' ? <Icon name="check" size={14} /> : <Icon name="info" size={14} />}
                </div>
                <div>
                  <h2>{check.label}</h2>
                  <p>{check.detail}</p>
                </div>
              </article>
            ))}
          </section>

          {data.dirtyFiles.length > 0 ? (
            <section className="ship-readiness-dirty" aria-label="Dirty files">
              <h2>Dirty files</h2>
              <pre>{data.dirtyFiles.join('\n')}</pre>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
