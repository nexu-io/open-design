import { describe, expect, it } from 'vitest';
import { createIpAllowlistMiddleware } from '../src/ip-allowlist.js';

function mockReq(remoteAddress: string) {
  return { socket: { remoteAddress } } as any;
}

function mockRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

describe('ip-allowlist', () => {
  it('allows all when no hosts configured', async () => {
    const middleware = createIpAllowlistMiddleware([]);
    const req = mockReq('192.168.1.100');
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('always allows loopback 127.0.0.1', async () => {
    const middleware = createIpAllowlistMiddleware(['10.0.0.1']);
    const req = mockReq('127.0.0.1');
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('always allows loopback ::1', async () => {
    const middleware = createIpAllowlistMiddleware(['10.0.0.1']);
    const req = mockReq('::1');
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('allows matching plain IP', async () => {
    const middleware = createIpAllowlistMiddleware(['192.168.1.5']);
    const req = mockReq('192.168.1.5');
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('blocks non-matching IP', async () => {
    const middleware = createIpAllowlistMiddleware(['192.168.1.5']);
    const req = mockReq('192.168.1.100');
    const res = mockRes();
    await middleware(req, res, () => {});
    expect(res.statusCode).toBe(403);
  });

  it('allows IP within CIDR range', async () => {
    const middleware = createIpAllowlistMiddleware(['192.168.1.0/24']);
    const req = mockReq('192.168.1.100');
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('blocks IP outside CIDR range', async () => {
    const middleware = createIpAllowlistMiddleware(['192.168.1.0/24']);
    const req = mockReq('192.168.2.1');
    const res = mockRes();
    await middleware(req, res, () => {});
    expect(res.statusCode).toBe(403);
  });

  it('handles IPv4-mapped IPv6 addresses', async () => {
    const middleware = createIpAllowlistMiddleware(['192.168.1.5']);
    const req = mockReq('::ffff:192.168.1.5');
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('throws on IPv6 entries at initialization', () => {
    expect(() => createIpAllowlistMiddleware(['fd00::1'])).toThrow('IPv6 allowlist entries are not supported');
  });

  it('allows loopback via IPv4-mapped IPv6', async () => {
    const middleware = createIpAllowlistMiddleware(['10.0.0.1']);
    const req = mockReq('::ffff:127.0.0.1');
    const res = mockRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
  });
});
