/** Execution-shell prose: shared od-card decoding plus Markdown code preservation. */
import { Fragment, type ReactElement } from 'react';
import { splitShellCards } from '../../runtime/chat/split-shell-cards';

import { OdCardView, type BrandBrowserAssistConfirm } from '../OdCard';
import { SayText } from './primitives/SayText';

export interface SayBlockProps {
  text: string;
  /** 这一段是**这一刻还在往里写的那一段**吗 —— 语义与 `SayText.live` 相同。 */
  live?: boolean;
  /** Compatibility scope forwarded from existing shell callers; retired rules no longer use it. */
  instanceScope?: string;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
}

export function SayBlock({
  text,
  live,
  instanceScope,
  onBrandBrowserAssistConfirm,
}: SayBlockProps): ReactElement | null {
  const segments = splitShellCards(text, Boolean(live));
  if (!segments.some((seg) => seg.kind === 'card')) {
    return <SayText text={segments.map((seg) => seg.kind === 'text' ? seg.text : '').join('')} live={live} />;
  }

  /* 逐字化开只发给**最后**那一段散文 —— 前面几段被卡片隔开,早就写完了 */
  let lastTextIndex = -1;
  segments.forEach((seg, i) => {
    if (seg.kind === 'text' && seg.text.trim()) lastTextIndex = i;
  });

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'card') {
          return (
            <OdCardView
              key={`card-${i}`}
              card={seg.card}
              instanceScope={instanceScope ? `${instanceScope}:${i}` : undefined}
              onBrandBrowserAssistConfirm={onBrandBrowserAssistConfirm}
            />
          );
        }
        if (!seg.text.trim()) return null;
        return (
          <Fragment key={`text-${i}`}>
            <SayText text={seg.text} live={live && i === lastTextIndex} />
          </Fragment>
        );
      })}
    </>
  );
}
