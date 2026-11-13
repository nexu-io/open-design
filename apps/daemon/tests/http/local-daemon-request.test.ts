import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireLocalDaemonRequest, validateLocalDaemonRequest } from '../../src/http/local-daemon-request.js';

// #8382: published-port deployments (containers, sandboxes, tunnels) reach the
// daemon from a non-loopback peer while the browser still sends a loopback
// Host and Origin. An operator can opt such a deployment in through
// OD_ALLOWED_ORIGINS, the escape hatch the sibling origin guard already honors
// (#1902). The exemption covers the peer gate only: the loopback Host and
// Origin checks stay as they are, and everything else keeps being rejected.

const LAN_PEER = '10.0.0.5';
const LOOPBACK_ORIGIN = 'http://localhost:7456';
const ALLOWLIST = { OD_ALLOWED_ORIGINS: LOOPBACK_ORIGIN };

function fakeRequest(remoteAddress: string, headers: Record<string, string>): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    socket: { remoteAddress },
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
}

function publishedPortRequest(headers: Record<string, string> = { host: 'localhost:7456', origin: LOOPBACK_ORIGIN }): Request {
  return fakeRequest(LAN_PEER, headers);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateLocalDaemonRequest peer gate with OD_ALLOWED_ORIGINS (#8382)', () => {
  it('lets a non-loopback peer through when its Origin exactly matches an allowlisted entry', () => {
    expect(validateLocalDaemonRequest(publishedPortRequest(), ALLOWLIST)).toEqual({ ok: true, origin: LOOPBACK_ORIGIN });
  });

  it('still rejects a non-loopback peer when OD_ALLOWED_ORIGINS is unset or empty', () => {
    for (const env of [{}, { OD_ALLOWED_ORIGINS: '' }, { OD_ALLOWED_ORIGINS: '  ' }]) {
      expect(validateLocalDaemonRequest(publishedPortRequest(), env)).toMatchObject({
        ok: false,
        details: { peer: 'remoteAddress' },
      });
    }
  });

  it('rejects a non-loopback peer whose Origin is not on the allowlist', () => {
    const env = { OD_ALLOWED_ORIGINS: 'http://localhost:9999' };
    expect(validateLocalDaemonRequest(publishedPortRequest(), env)).toMatchObject({
      ok: false,
      details: { peer: 'remoteAddress' },
    });
  });

  it('rejects a non-loopback peer that sends no Origin', () => {
    const req = publishedPortRequest({ host: 'localhost:7456' });
    expect(validateLocalDaemonRequest(req, ALLOWLIST)).toMatchObject({ ok: false, details: { peer: 'remoteAddress' } });
  });

  it('rejects a non-loopback peer with a malformed Origin', () => {
    for (const origin of ['null', `${LOOPBACK_ORIGIN}/`, `${LOOPBACK_ORIGIN}/path`, `${LOOPBACK_ORIGIN}, http://evil.test`, ' http://localhost:7456']) {
      const req = publishedPortRequest({ host: 'localhost:7456', origin });
      expect(validateLocalDaemonRequest(req, ALLOWLIST)).toMatchObject({ ok: false, details: { peer: 'remoteAddress' } });
    }
  });

  it('fails closed instead of throwing when OD_ALLOWED_ORIGINS cannot be parsed', () => {
    const env = { OD_ALLOWED_ORIGINS: 'ftp://localhost:7456' };
    expect(validateLocalDaemonRequest(publishedPortRequest(), env)).toMatchObject({
      ok: false,
      details: { peer: 'remoteAddress' },
    });
  });

  it('keeps the loopback Host check: an allowlisted domain-proxy origin is still rejected', () => {
    const env = { OD_ALLOWED_ORIGINS: 'https://od.example.com' };
    const req = publishedPortRequest({ host: 'od.example.com', origin: 'https://od.example.com' });
    expect(validateLocalDaemonRequest(req, env)).toMatchObject({ ok: false, details: { header: 'host' } });
  });

  it('keeps the loopback Host check for an allowlisted origin with a non-loopback Host', () => {
    const req = publishedPortRequest({ host: `${LAN_PEER}:7456`, origin: LOOPBACK_ORIGIN });
    expect(validateLocalDaemonRequest(req, ALLOWLIST)).toMatchObject({ ok: false, details: { header: 'host' } });
  });

  it('leaves loopback peers unchanged with or without an allowlist', () => {
    const req = fakeRequest('127.0.0.1', { host: 'localhost:7456', origin: LOOPBACK_ORIGIN });
    expect(validateLocalDaemonRequest(req, {})).toEqual({ ok: true, origin: LOOPBACK_ORIGIN });
    expect(validateLocalDaemonRequest(req, ALLOWLIST)).toEqual({ ok: true, origin: LOOPBACK_ORIGIN });
  });
});

describe('requireLocalDaemonRequest reads OD_ALLOWED_ORIGINS from the daemon environment (#8382)', () => {
  function run(req: Request) {
    const headers: Record<string, string> = {};
    const res = {
      req,
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) { headers[name] = value; },
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    const next = vi.fn() as unknown as NextFunction;
    requireLocalDaemonRequest(req, res as unknown as Response, next);
    return { res, headers, next: next as unknown as ReturnType<typeof vi.fn> };
  }

  it('serves an allowlisted published-port request', () => {
    vi.stubEnv('OD_ALLOWED_ORIGINS', LOOPBACK_ORIGIN);
    const { res, headers, next } = run(publishedPortRequest());
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(headers['Access-Control-Allow-Origin']).toBe(LOOPBACK_ORIGIN);
  });

  it('answers 403 for the same request when the allowlist is not configured', () => {
    vi.stubEnv('OD_ALLOWED_ORIGINS', '');
    const { res, next } = run(publishedPortRequest());
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
