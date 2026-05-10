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

searchRouter.post('/', async (req: Request, res: Response) => {
  try {
    // BUG preserved intentionally: req.body.query can be undefined → TypeError
    const query = req.body.query.toLowerCase().trim();

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await Promise.resolve(
      catalog.filter(
        (item) => item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query)
      )
    );

    return res.json({ query, results, total: results.length });
  } catch (err) {
    const error = err as Error;
    logError({
      error_class: 'TypeError',
      file       : 'routes/search.ts',
      line       : 16,
      message    : `Cannot read properties of undefined (reading 'toLowerCase'): ${error.message}`,
      error,
    });
    return res.status(400).json({ error: 'Invalid request body — query field is required' });
  }
});
