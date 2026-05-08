import { Router, Request, Response } from 'express';
import { logError } from '../telemetry';

export const paymentsRouter = Router();

// BUG: timeout — downstream takes 800ms but we only allow 500ms
function callPaymentGateway(amount: number): Promise<{ transactionId: string; status: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ transactionId: `txn_${Date.now()}`, status: 'approved' });
    }, 800); // downstream latency: 800ms
  });
}

paymentsRouter.post('/charge', async (req: Request, res: Response) => {
  const { amount, userId } = req.body;

  const timeoutMs = 500;
  let timedOut = false;

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    logError({
      error_class: 'TimeoutError',
      file: 'payments.ts',
      line: 28,
      message: `Payment gateway timed out after ${timeoutMs}ms: userId=${userId} amount=${amount}`,
    });
    return res.status(504).json({ error: 'Payment gateway timeout', detail: `Exceeded ${timeoutMs}ms` });
  }, timeoutMs);

  try {
    const result = await callPaymentGateway(amount);
    if (!timedOut) {
      clearTimeout(timeoutHandle);
      return res.json({ success: true, transactionId: result.transactionId });
    }
  } catch (err) {
    if (!timedOut) {
      clearTimeout(timeoutHandle);
      const error = err as Error;
      logError({
        error_class: 'PaymentError',
        file: 'payments.ts',
        line: 40,
        message: `Payment failed: ${error.message}`,
        error,
      });
      return res.status(500).json({ error: 'Payment failed', detail: error.message });
    }
  }
});
