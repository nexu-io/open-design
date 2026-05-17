export interface Chunk {
  id: string;
  data: string;
}

const RING_SIZE = 50;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 8000];

export class SseClient {
  private ring: Chunk[] = [];
  private lastEventId: string | null = null;
  private es: EventSource | null = null;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly url: string) {}

  connect(): void {
    const src =
      this.lastEventId !== null
        ? `${this.url}?lastEventId=${encodeURIComponent(this.lastEventId)}`
        : this.url;

    this.es = new EventSource(src);

    this.es.onmessage = (e: MessageEvent) => {
      this.retries = 0;
      const id = e.lastEventId ?? '';
      if (id) this.lastEventId = id;
      const chunk: Chunk = { id, data: e.data as string };
      this.ring.push(chunk);
      if (this.ring.length > RING_SIZE) this.ring.shift();
    };

    this.es.onerror = () => {
      this.es?.close();
      this.es = null;
      if (this.retries >= BACKOFF_MS.length) return;
      const delay = BACKOFF_MS[this.retries++]!;
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  close(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.es?.close();
    this.es = null;
  }

  chunks(): readonly Chunk[] {
    return this.ring;
  }

  lastId(): string | null {
    return this.lastEventId;
  }
}
