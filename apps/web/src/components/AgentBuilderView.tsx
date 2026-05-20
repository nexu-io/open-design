import { useState } from 'react';
import { Icon } from './Icon';
import { navigate } from '../router';

/**
 * Natural-language skill builder. User types a name + description +
 * the meaty body (PATTERNS / triggers / etc.). Form POSTs to the
 * daemon's existing /api/skills/import endpoint which writes a
 * SKILL.md under runtimeData/user-skills/<slug>/.
 *
 * No LLM-in-the-loop here: the user types the SKILL.md body directly.
 * (We considered spawning Claude to draft it, but the user-as-author
 * path is faster and the daemon-spawn path adds latency + a per-skill
 * cost for a 50-line markdown file.) The drafted body can later be
 * refined inside a chat — the skill is already registered.
 */
export function AgentBuilderView() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggers, setTriggers] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !body.trim()) {
      setError('Name and body are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          body,
          triggers: triggers
            .split(/[,\n]/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!resp.ok) {
        setError(`Failed: ${resp.status}`);
        return;
      }
      const data = (await resp.json()) as { skill?: { id?: string } };
      const id = data?.skill?.id;
      if (id) setSaved({ id });
      else setError('Daemon returned no skill id.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div className="agent-builder">
        <div className="agent-builder__saved">
          <Icon name="check" size={18} />
          <div>
            <div className="agent-builder__saved-title">Skill created</div>
            <div className="agent-builder__saved-sub">
              <code>{saved.id}</code> is now in the @-mention picker.
            </div>
          </div>
          <div className="agent-builder__saved-actions">
            <button
              type="button"
              onClick={() => navigate({ kind: 'skill-detail', skillId: saved.id })}
            >
              View
            </button>
            <button
              type="button"
              onClick={() => {
                setSaved(null);
                setName('');
                setDescription('');
                setTriggers('');
                setBody('');
              }}
            >
              Build another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-builder">
      <header className="agent-builder__head">
        <h1 className="agent-builder__title">Build a skill</h1>
        <p className="agent-builder__sub">
          Skills load into the agent's system prompt on trigger. Think of them as
          reusable instructions — "always use Tailwind v4," "follow these brand
          rules," "extract data from this format." Writes to <code>user-skills/</code>.
        </p>
      </header>

      <div className="agent-builder__form">
        <label className="agent-builder__field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            placeholder="e.g. tailwind-v4-strict"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="agent-builder__field">
          <span>One-line description</span>
          <input
            type="text"
            value={description}
            placeholder="e.g. Enforce Tailwind v4 OKLCH tokens; never @apply"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="agent-builder__field">
          <span>Triggers (comma or newline-separated)</span>
          <input
            type="text"
            value={triggers}
            placeholder="e.g. tailwind v4, oklch, use strict tokens"
            onChange={(e) => setTriggers(e.target.value)}
          />
        </label>

        <label className="agent-builder__field">
          <span>Body (SKILL.md markdown)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            placeholder={'# Tailwind v4 Strict\n\n## Rules\n- Use OKLCH for every accent\n- Never @apply outside `@layer components`\n- Prefer `--accent-on` for text-over-accent surfaces\n\n## Anti-patterns\n- Hex outside :root\n- HSL without explicit hue/sat/lightness names'}
          />
        </label>

        {error ? <div className="agent-builder__error">{error}</div> : null}
        <div className="agent-builder__actions">
          <button
            type="button"
            className="agent-builder__submit"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Create skill'}
          </button>
          <button
            type="button"
            className="agent-builder__cancel"
            onClick={() => navigate({ kind: 'home', view: 'home' })}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
