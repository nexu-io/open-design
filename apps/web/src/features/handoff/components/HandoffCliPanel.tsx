// The CLI tab of the dropdown: the AMR website link, the target-framework
// picker, and the merged CLI catalogue (installed first, then anything the
// daemon's `/api/agents` probe didn't detect).
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useT } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { AgentIcon } from '../../../components/AgentIcon';
import { AMR_WEBSITE_URL, FRAMEWORKS } from '../constants';
import { cliDisplayName, frameworkLabel } from '../rules';
import type { CliTarget, FrameworkId, FrameworkTarget } from '../types';

interface Props {
  availableCliTargets: CliTarget[];
  unavailableCliTargets: CliTarget[];
  copiedCliId: string | null;
  copyBusy: string | null;
  selectedFramework: FrameworkTarget;
  onCopyCli: (cli: CliTarget) => void;
  onChooseFramework: (id: FrameworkId) => void;
  onAmrWebsiteClick: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}

export function HandoffCliPanel({
  availableCliTargets,
  unavailableCliTargets,
  copiedCliId,
  copyBusy,
  selectedFramework,
  onCopyCli,
  onChooseFramework,
  onAmrWebsiteClick,
}: Props) {
  const t = useT();

  return (
    <section className="handoff-menu-block" role="tabpanel">
      <a
        className="handoff-amr-link"
        href={AMR_WEBSITE_URL}
        target="_blank"
        rel="noreferrer"
        onClick={onAmrWebsiteClick}
      >
        <AgentIcon id="amr" size={18} />
        <span>{t('handoff.amrWebsite')}</span>
        <Icon name="external-link" size={12} />
      </a>
      <div className="handoff-framework-row" role="group" aria-label={t('handoff.framework')}>
        <span className="handoff-framework-label">{t('handoff.framework')}</span>
        {FRAMEWORKS.map((framework) => (
          <button
            key={framework.id}
            type="button"
            className={`handoff-framework-chip${framework.id === selectedFramework.id ? ' active' : ''}`}
            aria-pressed={framework.id === selectedFramework.id}
            onClick={() => onChooseFramework(framework.id)}
          >
            {frameworkLabel(framework.id, t)}
          </button>
        ))}
      </div>
      {availableCliTargets.length > 0 ? (
        <div className="handoff-target-group">
          <div className="handoff-target-group-title">{t('common.installed')}</div>
          <div className="handoff-target-rail handoff-cli-rail">
            {availableCliTargets.map((cli) => {
              const copied = copiedCliId === cli.id;
              return (
                <button
                  key={cli.id}
                  type="button"
                  className={[
                    'handoff-menu-item',
                    'handoff-target-card',
                    'handoff-cli-card',
                    copied ? 'copied' : '',
                  ].filter(Boolean).join(' ')}
                  data-testid={`handoff-cli-item-${cli.id}`}
                  onClick={() => onCopyCli(cli)}
                  disabled={copyBusy === cli.id}
                  title={t('handoff.copyPromptForTarget', { target: cliDisplayName(cli) })}
                >
                  <AgentIcon id={cli.id} size={24} />
                  <span className="handoff-target-copy">
                    <span className="handoff-target-label">{cliDisplayName(cli)}</span>
                    <span className="handoff-target-meta">
                      {copied ? t('handoff.copied') : t('handoff.copyPrompt')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="handoff-target-group">
        <div className="handoff-target-group-title">{t('handoff.notInstalled')}</div>
        <div className="handoff-target-rail handoff-cli-rail handoff-target-rail--unavailable">
          {unavailableCliTargets.map((cli) => {
            const copied = copiedCliId === cli.id;
            return (
              <button
                key={cli.id}
                type="button"
                className={[
                  'handoff-menu-item',
                  'handoff-target-card',
                  'handoff-cli-card',
                  'dim',
                  copied ? 'copied' : '',
                ].filter(Boolean).join(' ')}
                data-testid={`handoff-cli-item-${cli.id}`}
                onClick={() => onCopyCli(cli)}
                disabled={copyBusy === cli.id}
                title={t('handoff.copyPromptForTarget', { target: cliDisplayName(cli) })}
              >
                <AgentIcon id={cli.id} size={24} />
                <span className="handoff-target-label">{cliDisplayName(cli)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
