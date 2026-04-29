import type { AgentModelOption } from '../types';

// Render the `<option>` children for a model `<select>`. When the list
// contains `provider/model` ids (opencode's listing has hundreds), we
// group them under `<optgroup>` so the dropdown is navigable. Flat lists
// (Claude, Codex, Gemini, Qwen) are emitted as plain options.
//
// `'default'` is always pinned first (no group), so the user can return
// to "let the CLI decide" with one click.
export function renderModelOptions(models: AgentModelOption[]) {
  const groups = new Map<string, AgentModelOption[]>();
  const flat: AgentModelOption[] = [];
  for (const m of models) {
    const slash = m.id.indexOf('/');
    if (m.id === 'default' || slash <= 0) {
      flat.push(m);
      continue;
    }
    const provider = m.id.slice(0, slash);
    const arr = groups.get(provider) ?? [];
    arr.push(m);
    groups.set(provider, arr);
  }
  if (groups.size === 0) {
    return (
      <>
        {flat.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      {flat.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
      {Array.from(groups.entries()).map(([provider, items]) => (
        <optgroup key={provider} label={provider}>
          {items.map((m) => (
            <option key={m.id} value={m.id}>
              {/* Strip the redundant `provider/` prefix from the label
                  inside its own optgroup; keep it in the value so the
                  CLI sees the fully-qualified id. */}
              {m.label.startsWith(`${provider}/`)
                ? m.label.slice(provider.length + 1)
                : m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

// True when the picked model id isn't one of the listed options — i.e.
// the user has typed a custom id and we should keep the custom input
// visible / the dropdown showing "Custom…".
export function isCustomModel(
  modelId: string | null | undefined,
  models: AgentModelOption[],
): boolean {
  if (!modelId) return false;
  return !models.some((m) => m.id === modelId);
}

export const CUSTOM_MODEL_SENTINEL = '__custom__';
