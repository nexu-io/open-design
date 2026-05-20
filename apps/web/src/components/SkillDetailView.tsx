import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { navigate } from '../router';

interface SkillDetail {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  mode: string;
  category?: string | null;
  source?: string;
  featured?: number | null;
  body?: string;
}
interface SkillFileEntry {
  path: string;
  kind: 'file' | 'directory';
  size: number | null;
}

interface Props {
  skillId: string;
}

/**
 * Single-skill detail page at /skills/:id. Fetches /api/skills/:id and
 * renders the SKILL.md body as a readable document. Critical for the
 * super-system skill — without this, PATTERNS.md + RESEARCH.md are
 * invisible to anyone who didn't build them.
 *
 * Body markdown is rendered with a minimal plain-text converter
 * (headers + code blocks + paragraphs). We deliberately don't import
 * a heavyweight markdown lib here — skills are author-trusted and the
 * styling is intentionally restrained.
 */
export function SkillDetailView({ skillId }: Props) {
  const [data, setData] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<SkillFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileBody, setFileBody] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/skills/${encodeURIComponent(skillId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData(d as SkillDetail);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void fetch(`/api/skills/${encodeURIComponent(skillId)}/files`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const list: SkillFileEntry[] = (d.files ?? [])
          .filter((f: SkillFileEntry) => f.kind === 'file' && f.path);
        setFiles(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [skillId]);

  useEffect(() => {
    if (!activeFile) {
      setFileBody(null);
      return;
    }
    let cancelled = false;
    const filePath = activeFile.split('/').map(encodeURIComponent).join('/');
    void fetch(`/api/skills/${encodeURIComponent(skillId)}/files/${filePath}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => {
        if (cancelled) return;
        setFileBody(t);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFile, skillId]);

  if (loading) {
    return (
      <div className="skill-detail">
        <div className="skill-detail__loader"><Icon name="spinner" size={18} /></div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="skill-detail">
        <div className="skill-detail__empty">Skill not found.</div>
      </div>
    );
  }

  return (
    <div className="skill-detail">
      <button
        type="button"
        className="skill-detail__back"
        onClick={() => navigate({ kind: 'home', view: 'home' })}
      >
        ← Home
      </button>
      <header className="skill-detail__head">
        <h1 className="skill-detail__title">{data.name}</h1>
        <div className="skill-detail__meta">
          <span className="skill-detail__meta-pill">{data.mode}</span>
          {data.category ? <span className="skill-detail__meta-pill">{data.category}</span> : null}
          {data.source ? <span className="skill-detail__meta-pill">{data.source}</span> : null}
          {typeof data.featured === 'number' && data.featured > 0 ? (
            <span className="skill-detail__meta-pill skill-detail__meta-pill--featured">
              featured
            </span>
          ) : null}
        </div>
        <p className="skill-detail__desc">{data.description}</p>
        {data.triggers.length > 0 ? (
          <div className="skill-detail__triggers">
            <span className="skill-detail__triggers-label">Triggers:</span>
            {data.triggers.map((t) => (
              <code key={t} className="skill-detail__trigger">{t}</code>
            ))}
          </div>
        ) : null}
      </header>

      {files.length > 0 ? (
        <div className="skill-detail__files">
          <div className="skill-detail__files-head">Files</div>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`skill-detail__file${activeFile === f.path ? ' is-active' : ''}`}
              onClick={() => setActiveFile((curr) => (curr === f.path ? null : f.path))}
            >
              <Icon name="file" size={11} />
              <span>{f.path}</span>
            </button>
          ))}
        </div>
      ) : null}

      {fileBody ? (
        <pre className="skill-detail__body">{fileBody}</pre>
      ) : data.body ? (
        <pre className="skill-detail__body">{data.body}</pre>
      ) : (
        <div className="skill-detail__empty">Skill body is empty (no SKILL.md prose).</div>
      )}
    </div>
  );
}
