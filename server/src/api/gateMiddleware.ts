import type { Request, Response, NextFunction } from 'express';

const GATE_TOKEN = process.env.NARRATOR_GATE_TOKEN;

export function gateMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!GATE_TOKEN) {
    res.status(503).json({ error: 'Narrator not configured' });
    return;
  }

  const clientToken = req.headers['x-gate-token'];
  if (clientToken !== GATE_TOKEN) {
    res.status(403).json({ error: 'Invalid gate token' });
    return;
  }

  next();
}
