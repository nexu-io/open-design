export interface AgentTitleMarkerStripper {
  flush(): string;
  strip(delta: string): string;
}

export interface AgentTitleMarkerStripperOptions {
  emitTitle: (title: string) => void;
  enabled: boolean;
  maxScanLength?: number;
}

const TITLE_OPEN_TAG = '<od-title>';
const TITLE_CLOSE_TAG = '</od-title>';
const DEFAULT_TITLE_MARKER_SCAN_LIMIT = 512;

export function sanitizeAgentGeneratedTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#>\[\](){}]/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function createAgentTitleMarkerStripper(
  options: AgentTitleMarkerStripperOptions,
): AgentTitleMarkerStripper {
  const maxScanLength = options.maxScanLength ?? DEFAULT_TITLE_MARKER_SCAN_LIMIT;
  let buffer = '';
  let scanning = options.enabled;
  let emitted = false;

  const emitTitle = (value: string) => {
    if (emitted) return;
    const title = sanitizeAgentGeneratedTitle(value);
    if (!title) return;
    emitted = true;
    options.emitTitle(title);
  };

  const titleTagPrefixSuffixLength = (text: string) => {
    const max = Math.min(text.length, TITLE_OPEN_TAG.length - 1);
    for (let len = max; len > 0; len -= 1) {
      if (TITLE_OPEN_TAG.startsWith(text.slice(-len))) return len;
    }
    return 0;
  };

  const strip = (delta: string): string => {
    if (!scanning) return delta;
    buffer += delta;
    let visible = '';

    while (scanning && buffer) {
      const openIndex = buffer.indexOf(TITLE_OPEN_TAG);
      if (openIndex === -1) {
        const keep = titleTagPrefixSuffixLength(buffer);
        visible += buffer.slice(0, buffer.length - keep);
        buffer = keep > 0 ? buffer.slice(-keep) : '';
        break;
      }

      if (openIndex > 0) {
        visible += buffer.slice(0, openIndex);
        buffer = buffer.slice(openIndex);
        continue;
      }

      const titleStart = TITLE_OPEN_TAG.length;
      const closeIndex = buffer.indexOf(TITLE_CLOSE_TAG, titleStart);
      if (closeIndex === -1) {
        if (buffer.length > maxScanLength) {
          buffer = '';
          scanning = false;
        }
        break;
      }

      emitTitle(buffer.slice(titleStart, closeIndex));
      buffer = buffer.slice(closeIndex + TITLE_CLOSE_TAG.length);
      scanning = false;
      visible += buffer;
      buffer = '';
    }

    return visible;
  };

  return {
    strip,
    flush() {
      if (!scanning || !buffer) return '';
      const parsed = strip('');
      if (parsed) return parsed;
      if (!scanning || !buffer) return '';
      const openIndex = buffer.indexOf(TITLE_OPEN_TAG);
      const visible = openIndex === -1 ? buffer : buffer.slice(0, openIndex);
      buffer = '';
      scanning = false;
      return visible;
    },
  };
}
