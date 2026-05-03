import {
  ONESHOT_ADAPTER_CONTRACTS,
  ONESHOT_OUTPUT_CONTROLS,
  ONESHOT_SHARED_CORE,
  ONESHOT_STUDIOS,
} from '../oneshotDesignOS';
import { Icon } from './Icon';

export function OneShotDesignOS() {
  const nativeCount = ONESHOT_STUDIOS.filter((studio) => studio.status === 'native').length;
  const bridgeCount = ONESHOT_STUDIOS.filter((studio) => studio.status === 'bridge').length;
  const adapterCount = ONESHOT_ADAPTER_CONTRACTS.length;

  return (
    <section className="oneshot-os" aria-label="OneShot Design OS architecture">
      <div className="oneshot-os-head">
        <div>
          <h2>Design OS command structure</h2>
          <p>
            OneShot is the professional Design OS for anything and everything:
            a shared project core with attachable expert studios, external
            engines, quality gates, and Codex-ready handoffs.
          </p>
        </div>
        <div className="oneshot-os-metrics" aria-label="Design OS metrics">
          <span><strong>{ONESHOT_STUDIOS.length}</strong> studios</span>
          <span><strong>{nativeCount}</strong> native</span>
          <span><strong>{bridgeCount}</strong> bridge</span>
          <span><strong>{adapterCount}</strong> adapters</span>
        </div>
      </div>

      <div className="oneshot-studio-grid">
        {ONESHOT_STUDIOS.map((studio) => (
          <article className={`oneshot-studio-card ${studio.status}`} key={studio.id}>
            <div className="oneshot-studio-top">
              <span>{studio.status}</span>
              {studio.adapterTarget ? <small>{studio.adapterTarget}</small> : null}
            </div>
            <h3>{studio.title}</h3>
            <strong>{studio.role}</strong>
            <p>{studio.description}</p>
            <div className="oneshot-studio-lists">
              <StudioList label="Workflows" items={studio.workflows} />
              <StudioList label="Outputs" items={studio.outputs} />
              <StudioList label="Gates" items={studio.qualityGates} />
            </div>
          </article>
        ))}
      </div>

      <div className="oneshot-core-grid">
        <div className="oneshot-core-panel">
          <div className="oneshot-core-title">
            <Icon name="grid" size={14} />
            <h3>Shared core</h3>
          </div>
          <div className="oneshot-core-list">
            {ONESHOT_SHARED_CORE.map((capability) => (
              <article key={capability.title}>
                <strong>{capability.title}</strong>
                <span>{capability.description}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="oneshot-core-panel">
          <div className="oneshot-core-title">
            <Icon name="sliders" size={14} />
            <h3>Professional output controls</h3>
          </div>
          <div className="oneshot-control-list">
            {ONESHOT_OUTPUT_CONTROLS.map((control) => (
              <span key={control}>
                <Icon name="check" size={12} />
                {control}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="oneshot-adapter-panel">
        <div className="oneshot-core-title">
          <Icon name="link" size={14} />
          <h3>Adapter contracts</h3>
        </div>
        <div className="oneshot-adapter-grid">
          {ONESHOT_ADAPTER_CONTRACTS.map((adapter) => (
            <article key={adapter.id}>
              <div className="oneshot-adapter-top">
                <strong>{adapter.title}</strong>
                <span>{adapter.status}</span>
              </div>
              <div className="oneshot-adapter-methods">
                {adapter.methods.map((method) => (
                  <code key={method}>{method}</code>
                ))}
              </div>
              <p>{adapter.guardrail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StudioList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <span>{label}</span>
      <ul>
        {items.slice(0, 5).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
