import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

describe('gateMiddleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMocks(gateHeader?: string) {
    const req = { headers: {} } as Request;
    if (gateHeader !== undefined) {
      req.headers['x-gate-token'] = gateHeader;
    }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next };
  }

  it('returns 503 when NARRATOR_GATE_TOKEN is not set', async () => {
    delete process.env.NARRATOR_GATE_TOKEN;
    const { gateMiddleware } = await import('./gateMiddleware.js');
    const { req, res, next } = createMocks('sometoken');
    gateMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Narrator not configured' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when x-gate-token header is missing', async () => {
    process.env.NARRATOR_GATE_TOKEN = 'secret';
    const { gateMiddleware } = await import('./gateMiddleware.js');
    const { req, res, next } = createMocks();
    gateMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid gate token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when x-gate-token does not match', async () => {
    process.env.NARRATOR_GATE_TOKEN = 'secret';
    const { gateMiddleware } = await import('./gateMiddleware.js');
    const { req, res, next } = createMocks('wrong-token');
    gateMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when x-gate-token matches', async () => {
    process.env.NARRATOR_GATE_TOKEN = 'secret';
    const { gateMiddleware } = await import('./gateMiddleware.js');
    const { req, res, next } = createMocks('secret');
    gateMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
