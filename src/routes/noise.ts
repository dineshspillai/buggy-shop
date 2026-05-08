import { Router, Request, Response } from 'express';
import { logError } from '../telemetry';

export const noiseRouter = Router();

// Harmless noise — logs a warning-level error that looks alarming but has no impact
noiseRouter.get('/widget-check', (_req: Request, res: Response) => {
  // Simulate a ResizeObserver-style false-positive error (common in browser-forwarded telemetry)
  logError({
    error_class: 'ResizeObserverLoopError',
    file: 'noise.ts',
    line: 12,
    message: 'ResizeObserver loop completed with undelivered notifications — harmless, browser noise',
  });

  return res.json({ status: 'ok', note: 'widget rendered (with noise)' });
});

noiseRouter.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'healthy', uptime: process.uptime() });
});
