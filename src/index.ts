import './telemetry';
import { httpMetricsMiddleware } from './telemetry';
import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { productsRouter } from './routes/products';
import { userRouter } from './routes/user';
import { paymentsRouter } from './routes/payments';
import { statementsRouter } from './routes/statements';
import { searchRouter } from './routes/search';
import { noiseRouter } from './routes/noise';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(httpMetricsMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/products', productsRouter);
app.use('/user', userRouter);
app.use('/payments', paymentsRouter);
app.use('/statements', statementsRouter);
app.use('/search', searchRouter);
app.use('/noise', noiseRouter);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`buggy-shop running on http://localhost:${PORT}`);
});
