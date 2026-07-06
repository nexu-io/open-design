// Dumb panel for the "How it works" tab: the automatic-capture flow diagram, a
// one-paragraph primer, and the pluggable-hooks toggles. Presentational only —
// state + the toggle transport live in the orchestrator's config hook.
import { Icon } from '../../../components/Icon';
import { MemoryHooksPanel } from '../../../components/MemoryHooksPanel';
import type { MemoryConfigFlagKey } from '../rules';

export function MemoryHowPanel({
  enabled,
  hookFlags,
  onToggleHook,
}: {
  enabled: boolean;
  hookFlags: Record<MemoryConfigFlagKey, boolean>;
  onToggleHook: (key: MemoryConfigFlagKey, next: boolean) => void;
}) {
  return (
    <div className="memory-how-panel">
      <div className="memory-auto-flow">
        <span>Onboarding</span>
        <Icon name="chevron-right" size={13} />
        <span>Brand context</span>
        <Icon name="chevron-right" size={13} />
        <span>Chat signals</span>
        <Icon name="chevron-right" size={13} />
        <strong>Saved memory</strong>
      </div>
      <p className="memory-how-copy">
        Memory is gathered automatically from profile setup, project and
        brand extraction, connected apps, and useful facts learned during
        chats. The saved list below is the review surface; everything else
        stays quiet unless you open Add or Advanced.
      </p>
      <MemoryHooksPanel
        enabled={enabled}
        flags={hookFlags}
        onToggle={onToggleHook}
      />
    </div>
  );
}
