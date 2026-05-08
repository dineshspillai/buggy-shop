import { Router, Request, Response } from 'express';
import { logError } from '../telemetry';

export const statementsRouter = Router();

const transactions: Record<string, { date: string; description: string; amount: number }[]> = {
  '2024-12': [
    { date: '2024-12-01', description: 'Laptop Pro', amount: -1299.99 },
    { date: '2024-12-15', description: 'Wireless Mouse', amount: -29.99 },
  ],
  '2025-01': [
    { date: '2025-01-03', description: 'USB-C Hub', amount: -49.99 },
    { date: '2025-01-20', description: 'Payment received', amount: 500.00 },
  ],
};

// BUG: date off-by-one — new Date('2025-01') is invalid; new Date('2025-01-01') needed
// but we call getMonth() on a potentially Invalid Date at year boundaries
statementsRouter.get('/:period', (req: Request, res: Response) => {
  try {
    const period = req.params.period; // expected: "YYYY-MM"

    // BUG: this produces Invalid Date for some locales/runtimes — should be `period + '-01'`
    const statementDate = new Date(period);
    const month = statementDate.getMonth(); // NaN when date is invalid
    const year = statementDate.getFullYear(); // NaN when date is invalid

    if (isNaN(month)) {
      logError({
        error_class: 'DateParseError',
        file: 'statements.ts',
        line: 30,
        message: `Invalid statement period '${period}' — getMonth() returned NaN`,
      });
      return res.status(400).json({ error: 'Invalid period format', detail: `Could not parse '${period}' as a date` });
    }

    const items = transactions[period] ?? [];
    const total = items.reduce((sum, t) => sum + t.amount, 0);

    return res.json({
      period,
      year,
      month: month + 1, // off-by-one: getMonth() is 0-indexed but we don't adjust correctly at boundaries
      transactions: items,
      total: Math.round(total * 100) / 100,
    });
  } catch (err) {
    const error = err as Error;
    logError({
      error_class: 'StatementError',
      file: 'statements.ts',
      line: 48,
      message: `Failed to fetch statement: ${error.message}`,
      error,
    });
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});
