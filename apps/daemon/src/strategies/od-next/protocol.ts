import { ProductionMarkerStream } from './production-marker.js';

export interface OdNextReply {
  visibleText: string;
  productionReady: boolean;
}

/** Display-only compatibility for historical machine blocks. No parsing or validation. */
export class LegacyBlockFilter {
  private pending = '';
  private closing: string | null = null;
  get buffered(): boolean {
    return this.pending.length > 0 || this.closing !== null;
  }

  push(chunk: string, finish = false): string {
    this.pending += chunk;
    let out = '';
    const tags = ['open-design-plan-contract', 'open-design-runtime-state'];
    while (this.pending) {
      if (this.closing) {
        const end = this.pending.toLowerCase().indexOf(this.closing);
        if (end < 0) {
          this.pending = finish ? '' : this.pending.slice(-this.closing.length);
          break;
        }
        this.pending = this.pending.slice(end + this.closing.length);
        this.closing = null;
        continue;
      }
      const lower = this.pending.toLowerCase();
      const matches = tags
        .map(tag => ({ tag, index: lower.indexOf('<' + tag) }))
        .filter(match => match.index >= 0)
        .sort((a, b) => a.index - b.index);
      const match = matches[0];
      if (match) {
        out += this.pending.slice(0, match.index) + '\n';
        this.pending = this.pending.slice(match.index);
        const end = this.pending.indexOf('>');
        if (end < 0) {
          if (finish || this.pending.length > 4096) {
            this.closing = '</' + match.tag + '>';
            this.pending = '';
          }
          break;
        }
        this.pending = this.pending.slice(end + 1);
        this.closing = '</' + match.tag + '>';
        continue;
      }
      let hold = 0;
      if (!finish) {
        for (const tag of tags) {
          const prefix = '<' + tag;
          for (let n = 1; n < prefix.length; n++) {
            if (lower.endsWith(prefix.slice(0, n))) hold = Math.max(hold, n);
          }
        }
      }
      out += this.pending.slice(0, this.pending.length - hold);
      this.pending = hold ? this.pending.slice(-hold) : '';
      break;
    }
    return out;
  }
}

/** Every OD Next run, including a historical task, uses the same marker path. */
export function createOdNextRunProtocol(_mapping: unknown, productionKey: string) {
  const marker = new ProductionMarkerStream(productionKey);
  const filter = new LegacyBlockFilter();
  let visibleText = '';
  let bufferedTrusted = true;
  return {
    push(delta: string, assistantText = true): string {
      bufferedTrusted &&= assistantText;
      const visible = marker.push(filter.push(delta), false, bufferedTrusted);
      if (!filter.buffered) bufferedTrusted = true;
      visibleText += visible;
      return visible;
    },
    finish(): { parsed: OdNextReply; visibleTail: string } {
      const visibleTail = marker.push(filter.push('', true), true, bufferedTrusted);
      visibleText += visibleTail;
      return { parsed: { visibleText, productionReady: marker.ready && Boolean(visibleText.trim()) }, visibleTail };
    },
  };
}
