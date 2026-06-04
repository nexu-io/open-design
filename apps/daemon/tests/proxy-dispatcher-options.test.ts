import * as platform from '@open-design/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';

const envHttpProxyAgentConstructor = vi.fn();
const envHttpProxyAgentDispatch = vi.fn();
const directAgentConstructor = vi.fn();
const socks5ProxyAgentConstructor = vi.fn();
const directAgentDispatch = vi.fn();
const socks5ProxyAgentDispatch = vi.fn();

vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici');
  class MockEnvHttpProxyAgent {
    constructor(options?: unknown) {
      envHttpProxyAgentConstructor(options);
    }

    dispatch(options: unknown, handler: unknown) {
      envHttpProxyAgentDispatch(options, handler);
      return true;
    }

    async close() {}

    async destroy() {}
  }

  class MockAgent {
    constructor(options?: unknown) {
      directAgentConstructor(options);
    }

    dispatch(options: unknown, handler: unknown) {
      directAgentDispatch(options, handler);
      return true;
    }

    async close() {}

    async destroy() {}
  }

  class MockSocks5ProxyAgent {
    constructor(proxyUrl: string, options?: unknown) {
      socks5ProxyAgentConstructor(proxyUrl, options);
    }

    dispatch(options: unknown, handler: unknown) {
      socks5ProxyAgentDispatch(options, handler);
      return true;
    }

    async close() {}

    async destroy() {}
  }

  return {
    ...actual,
    Agent: MockAgent,
    EnvHttpProxyAgent: MockEnvHttpProxyAgent,
    Socks5ProxyAgent: MockSocks5ProxyAgent,
  };
});

describe('proxyDispatcherRequestInit', () => {
  afterEach(() => {
    directAgentConstructor.mockReset();
    directAgentDispatch.mockReset();
    envHttpProxyAgentConstructor.mockReset();
    envHttpProxyAgentDispatch.mockReset();
    socks5ProxyAgentDispatch.mockReset();
    socks5ProxyAgentConstructor.mockReset();
    vi.resetModules();
  });

  it('forwards agent timeout options into EnvHttpProxyAgent construction', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit(
        {
          HTTP_PROXY: 'http://proxy.example.test:8080',
        },
        {
          headersTimeout: 10 * 60 * 1000,
          bodyTimeout: 10 * 60 * 1000,
        },
      );

      expect(requestInit.dispatcher).toBeTruthy();
      expect(envHttpProxyAgentConstructor).toHaveBeenCalledWith(expect.objectContaining({
        bodyTimeout: 10 * 60 * 1000,
        headersTimeout: 10 * 60 * 1000,
        httpProxy: 'http://proxy.example.test:8080',
        noProxy: 'localhost,127.0.0.1,[::1]',
      }));
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('uses Socks5ProxyAgent when only ALL_PROXY carries a SOCKS proxy', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit({
        ALL_PROXY: 'socks5://proxy.example.test:1080',
      });

      expect(requestInit.dispatcher).toBeTruthy();
      expect(socks5ProxyAgentConstructor).toHaveBeenCalledWith(
        'socks5://proxy.example.test:1080',
        {},
      );
      expect(envHttpProxyAgentConstructor).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('normalizes socks5h ALL_PROXY values for Socks5ProxyAgent', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit({
        ALL_PROXY: 'socks5h://proxy.example.test:1080',
      });

      expect(requestInit.dispatcher).toBeTruthy();
      expect(socks5ProxyAgentConstructor).toHaveBeenCalledWith(
        'socks5://proxy.example.test:1080',
        {},
      );
      expect(envHttpProxyAgentConstructor).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('forwards agent timeout options into Socks5ProxyAgent construction', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit(
        {
          ALL_PROXY: 'socks5://proxy.example.test:1080',
        },
        {
          headersTimeout: 10 * 60 * 1000,
          bodyTimeout: 10 * 60 * 1000,
        },
      );

      expect(requestInit.dispatcher).toBeTruthy();
      expect(socks5ProxyAgentConstructor).toHaveBeenCalledWith(
        'socks5://proxy.example.test:1080',
        {
          bodyTimeout: 10 * 60 * 1000,
          headersTimeout: 10 * 60 * 1000,
        },
      );
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it.each([
    {
      label: 'HTTP_PROXY only',
      systemProxyEnv: {
        ALL_PROXY: 'socks5://system-socks.example.test:1080',
        HTTP_PROXY: 'http://system-http.example.test:8080',
      },
      specificOrigin: 'http://api.example.test',
      socksOrigin: 'https://api.example.test',
      expectedProxyOptions: {
        httpProxy: 'http://system-http.example.test:8080',
      },
    },
    {
      label: 'HTTPS_PROXY only',
      systemProxyEnv: {
        ALL_PROXY: 'socks5://system-socks.example.test:1080',
        HTTPS_PROXY: 'http://system-https.example.test:8443',
      },
      specificOrigin: 'https://api.example.test',
      socksOrigin: 'http://api.example.test',
      expectedProxyOptions: {
        httpsProxy: 'http://system-https.example.test:8443',
      },
    },
  ])('uses SOCKS ALL_PROXY for the missing scheme when system proxy has $label', async ({
    systemProxyEnv,
    specificOrigin,
    socksOrigin,
    expectedProxyOptions,
  }) => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit(systemProxyEnv);

      expect(requestInit.dispatcher).toBeTruthy();
      expect(envHttpProxyAgentConstructor).toHaveBeenCalledWith(expect.objectContaining({
        ...expectedProxyOptions,
        noProxy: 'localhost,127.0.0.1,[::1]',
      }));
      expect(socks5ProxyAgentConstructor).toHaveBeenCalledWith(
        'socks5://system-socks.example.test:1080',
        {},
      );

      const dispatcher = requestInit.dispatcher as {
        dispatch(options: { origin: string; path: string }, handler: unknown): boolean;
      };

      dispatcher.dispatch(
        {
          origin: socksOrigin,
          path: '/v1/models',
        },
        {},
      );
      expect(socks5ProxyAgentDispatch).toHaveBeenCalled();
      expect(envHttpProxyAgentDispatch).not.toHaveBeenCalled();

      socks5ProxyAgentDispatch.mockClear();
      envHttpProxyAgentDispatch.mockClear();

      dispatcher.dispatch(
        {
          origin: specificOrigin,
          path: '/v1/models',
        },
        {},
      );
      expect(envHttpProxyAgentDispatch).toHaveBeenCalled();
      expect(socks5ProxyAgentDispatch).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('bypasses SOCKS proxy dispatch for loopback targets from NO_PROXY defaults', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit({
        ALL_PROXY: 'socks5://proxy.example.test:1080',
      });

      expect(requestInit.dispatcher).toBeTruthy();
      const dispatcher = requestInit.dispatcher as {
        dispatch(options: { origin: string; path: string }, handler: unknown): boolean;
      };
      expect(
        dispatcher.dispatch(
          {
            origin: 'http://localhost:11434',
            path: '/v1/chat/completions',
          },
          {},
        ),
      ).toBe(true);
      expect(directAgentDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'http://localhost:11434',
          path: '/v1/chat/completions',
        }),
        {},
      );
      expect(socks5ProxyAgentDispatch).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('bypasses SOCKS proxy dispatch for explicit NO_PROXY hosts', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit({
        ALL_PROXY: 'socks5://proxy.example.test:1080',
        NO_PROXY: '.corp.test',
      });

      expect(requestInit.dispatcher).toBeTruthy();
      const dispatcher = requestInit.dispatcher as {
        dispatch(options: { origin: string; path: string }, handler: unknown): boolean;
      };
      dispatcher.dispatch(
        {
          origin: 'https://api.corp.test',
          path: '/v1/models',
        },
        {},
      );
      expect(directAgentDispatch).toHaveBeenCalled();
      expect(socks5ProxyAgentDispatch).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('keeps SOCKS proxy dispatch for hosts outside NO_PROXY', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit({
        ALL_PROXY: 'socks5://proxy.example.test:1080',
        NO_PROXY: '.corp.test',
      });

      expect(requestInit.dispatcher).toBeTruthy();
      const dispatcher = requestInit.dispatcher as {
        dispatch(options: { origin: string; path: string }, handler: unknown): boolean;
      };
      dispatcher.dispatch(
        {
          origin: 'https://api.openai.com',
          path: '/v1/chat/completions',
        },
        {},
      );
      expect(socks5ProxyAgentDispatch).toHaveBeenCalled();
      expect(directAgentDispatch).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });

  it('bypasses HTTP proxy dispatch for simple hosts when NO_PROXY includes <local>', async () => {
    const proxySpy = vi.spyOn(platform, 'resolveSystemProxyEnv').mockReturnValue({});
    const { proxyDispatcherRequestInit } = await import('../src/connectionTest.js');

    try {
      const { close, requestInit } = proxyDispatcherRequestInit({
        HTTP_PROXY: 'http://proxy.example.test:8080',
        NO_PROXY: '<local>,localhost,127.0.0.1,[::1],.local',
      });

      expect(requestInit.dispatcher).toBeTruthy();
      const dispatcher = requestInit.dispatcher as {
        dispatch(options: { origin: string; path: string }, handler: unknown): boolean;
      };
      dispatcher.dispatch(
        {
          origin: 'http://ollama:11434',
          path: '/api/tags',
        },
        {},
      );
      expect(directAgentDispatch).toHaveBeenCalled();
      expect(envHttpProxyAgentDispatch).not.toHaveBeenCalled();
      await expect(close()).resolves.toBeUndefined();
    } finally {
      proxySpy.mockRestore();
    }
  });
});
