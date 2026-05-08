import { Router } from 'express';

export const productsRouter = Router();

const products = [
  { id: 1, name: 'Laptop Pro', price: 1299.99, stock: 42 },
  { id: 2, name: 'Wireless Mouse', price: 29.99, stock: 150 },
  { id: 3, name: 'Mechanical Keyboard', price: 89.99, stock: 75 },
  { id: 4, name: 'USB-C Hub', price: 49.99, stock: 200 },
  { id: 5, name: '4K Monitor', price: 399.99, stock: 30 },
];

// Works fine — baseline traffic
productsRouter.get('/', (_req, res) => {
  res.json({ products, total: products.length });
});
