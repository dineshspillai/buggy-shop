import { Router, Request, Response } from 'express';
import { logError } from '../telemetry';

export const userRouter = Router();

const users: Record<number, { id: number; name: string; email: string; address?: { street: string; city: string } }> = {
  1: { id: 1, name: 'Alice Smith', email: 'alice@example.com', address: { street: '123 Main St', city: 'Springfield' } },
  2: { id: 2, name: 'Bob Jones', email: 'bob@example.com' }, // no address — triggers NPE
};

// BUG: NPE — dereferences user.address.street without null check
userRouter.get('/:id/profile', (req: Request, res: Response) => {
  try {
    const user = users[Number(req.params.id)];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // BUG: crashes when user.address is undefined
    const street = user.address?.street;

    return res.json({ id: user.id, name: user.name, email: user.email, street });
  } catch (err) {
    const error = err as Error;
    logError({
      error_class: 'NullPointerException',
      file: 'user.ts',
      line: 22,
      message: `Cannot read properties of undefined (reading 'street'): user id=${req.params.id}`,
      error,
    });
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});