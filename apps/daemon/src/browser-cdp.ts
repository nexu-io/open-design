import { WebSocket } from 'undici';

import {
  assertBrowserNetworkUrl,
  type BrowserNetworkPolicy,
} from './browser-network-policy.js';

const COMMAND_TIMEOUT_MS = 30_000;
const EVENT_BACKLOG_LIMIT = 4_000;
const PAGE_CONTENT_METHODS = new Set([
  'Page.captureScreenshot',
  'Page.getLayoutMetrics',
  'Runtime.evaluate',
]);

export const WEB_CLONE_CDP_METHODS = new Set([
  'Emulation.setDeviceMetricsOverride',
  'Input.dispatchMouseEvent',
  'Network.enable',
  'Network.getCookies',
  'Network.getResponseBody',
  'Page.captureScreenshot',
  'Page.enable',
  'Page.getLayoutMetrics',
  'Page.navigate',
  'Runtime.enable',
  'Runtime.evaluate',
]);

export interface BrowserCdpEvent {
  method: string;
  params: Record<string, unknown>;
  sequence: number;
}

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (result: Record<string, unknown>) => void;
  timer: NodeJS.Timeout;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class BrowserCdpPage {
  readonly id: string;

  #closed = false;
  #events: BrowserCdpEvent[] = [];
  #nextCommandId = 1;
  #nextEventSequence = 1;
  #networkPolicy: BrowserNetworkPolicy;
  #networkChecks = new Map<string, Promise<void>>();
  #pending = new Map<number, PendingCommand>();
  #ready: Promise<void>;
  #socket: WebSocket;
  #waiters = new Set<() => void>();
  #currentUrl = 'about:blank';

  private constructor(id: string, websocketUrl: string, networkPolicy: BrowserNetworkPolicy) {
    this.id = id;
    this.#networkPolicy = networkPolicy;
    this.#socket = new WebSocket(websocketUrl);
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#socket.addEventListener('open', () => resolve(), { once: true });
      this.#socket.addEventListener('error', () => reject(new Error('browser CDP connection failed')), { once: true });
    });
    this.#socket.addEventListener('message', (event) => this.#handleMessage(String(event.data)));
    this.#socket.addEventListener('close', () => this.#handleClose());
  }

  static async connect(
    id: string,
    websocketUrl: string,
    networkPolicy: BrowserNetworkPolicy = {},
  ): Promise<BrowserCdpPage> {
    const page = new BrowserCdpPage(id, websocketUrl, networkPolicy);
    try {
      await page.#ready;
      // Fetch interception is daemon-owned and never exposed through the client
      // allowlist. Page scripts therefore cannot disable the private-network
      // boundary even when Runtime.evaluate is used for DOM reconnaissance.
      await page.#sendRaw('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      return page;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  async command(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (!WEB_CLONE_CDP_METHODS.has(method)) {
      throw new Error(`CDP method is not allowed for Website Clone: ${method}`);
    }
    let navigationUrl: string | null = null;
    if (method === 'Page.navigate') {
      const url = typeof params.url === 'string' ? params.url : '';
      await this.#assertNetworkUrl(url);
      navigationUrl = url;
    }
    if (PAGE_CONTENT_METHODS.has(method)) {
      await this.#assertReadablePage();
    }
    if (method === 'Network.getCookies') {
      const urls = Array.isArray(params.urls) ? params.urls : [];
      await Promise.all(urls.map((url) => this.#assertNetworkUrl(typeof url === 'string' ? url : '')));
    }
    const result = await this.#sendRaw(method, params);
    if (navigationUrl && typeof result.errorText !== 'string') this.#currentUrl = navigationUrl;
    return result;
  }

  async eventsAfter(after: number, timeoutMs: number): Promise<BrowserCdpEvent[]> {
    const available = () => this.#events.filter((event) => event.sequence > after);
    const initial = available();
    if (initial.length > 0 || this.#closed || timeoutMs <= 0) return initial;

    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.#waiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      timer.unref?.();
      this.#waiters.add(finish);
    });
    return available();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket.close();
    this.#handleClose();
  }

  async #sendRaw(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.#ready;
    if (this.#closed || this.#socket.readyState !== WebSocket.OPEN) {
      throw new Error('browser CDP connection is closed');
    }
    const id = this.#nextCommandId++;
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} timed out after ${COMMAND_TIMEOUT_MS}ms`));
      }, COMMAND_TIMEOUT_MS);
      timer.unref?.();
      this.#pending.set(id, { reject, resolve, timer });
    });
    this.#socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  #handleMessage(raw: string): void {
    let message: {
      error?: { message?: string };
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: Record<string, unknown>;
    };
    try {
      message = JSON.parse(raw) as typeof message;
    } catch {
      return;
    }

    if (typeof message.id === 'number') {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else pending.resolve(message.result ?? {});
      return;
    }

    if (!message.method) return;
    const params = message.params ?? {};
    if (message.method === 'Fetch.requestPaused') {
      void this.#handleRequestPaused(params).catch(() => undefined);
      return;
    }
    if (message.method === 'Page.frameNavigated') {
      const frame = params.frame as { parentId?: unknown; url?: unknown } | undefined;
      if (frame && !frame.parentId && typeof frame.url === 'string') this.#currentUrl = frame.url;
    }
    this.#events.push({ method: message.method, params, sequence: this.#nextEventSequence++ });
    if (this.#events.length > EVENT_BACKLOG_LIMIT) this.#events.splice(0, this.#events.length - EVENT_BACKLOG_LIMIT);
    this.#wakeWaiters();
  }

  async #handleRequestPaused(params: Record<string, unknown>): Promise<void> {
    const requestId = typeof params.requestId === 'string' ? params.requestId : '';
    const request = params.request as { url?: unknown } | undefined;
    const url = typeof request?.url === 'string' ? request.url : '';
    if (!requestId) return;
    try {
      await this.#assertNetworkUrl(url);
      await this.#sendRaw('Fetch.continueRequest', { requestId });
    } catch (error) {
      await this.#sendRaw('Fetch.failRequest', { errorReason: 'BlockedByClient', requestId }).catch(() => undefined);
      this.#events.push({
        method: 'OpenDesign.browserRequestBlocked',
        params: { error: errorMessage(error), url },
        sequence: this.#nextEventSequence++,
      });
      this.#wakeWaiters();
    }
  }

  async #assertNetworkUrl(url: string): Promise<void> {
    let key = url;
    try {
      const parsed = new URL(url);
      key = `${parsed.protocol}//${parsed.host}`;
    } catch {
      // The validator below owns the user-facing invalid-URL error.
    }
    const existing = this.#networkChecks.get(key);
    if (existing) return existing;
    const check = assertBrowserNetworkUrl(url, this.#networkPolicy);
    this.#networkChecks.set(key, check);
    try {
      await check;
    } finally {
      this.#networkChecks.delete(key);
    }
  }

  async #assertReadablePage(): Promise<void> {
    let protocol = '';
    try {
      protocol = new URL(this.#currentUrl).protocol;
    } catch {
      // The network validator below returns the canonical invalid-URL error.
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error(`page content is unavailable for privileged URL scheme: ${protocol || 'invalid'}`);
    }
    await this.#assertNetworkUrl(this.#currentUrl);
  }

  #handleClose(): void {
    if (this.#closed && this.#pending.size === 0) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('browser CDP connection closed'));
    }
    this.#pending.clear();
    this.#wakeWaiters();
  }

  #wakeWaiters(): void {
    for (const wake of [...this.#waiters]) wake();
  }
}
