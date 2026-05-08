import { Router, Request, Response } from 'express';
import { logError } from '../telemetry';

export const searchRouter = Router();

const catalog = [
  { id: 1, name: 'Laptop Pro', category: 'computers', price: 1299.99 },
  { id: 2, name: 'Wireless Mouse', category: 'accessories', price: 29.99 },
  { id: 3, name: 'Mechanical Keyboard', category: 'accessories', price: 89.99 },
  { id: 4, name: 'USB-C Hub', category: 'accessories', price: 49.99 },
  { id: 5, name: '4K Monitor', category: 'displays', price: 399.99 },
];

// BUG: unhandled rejection — async handler with no try/catch; throws when body is missing/empty
searchRouter.post('/', async (req: Request, res: Response) => {
  // BUG: no try/catch — if req.body is undefined or query is missing, .toLowerCase() throws
  const query = req.body.query.toLowerCase().trim();

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  // Simulate async catalog lookup
  const results = await Promise.resolve(
    catalog.filter(
      (item) => item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query)
    )
  );

  return res.json({ query, results, total: results.length });
});
