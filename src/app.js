import express from 'express';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import openApiSpec from './docs/openapi.js';
import payinRouter from './routes/payin.js';
import payRouter from './routes/pay.js';
import groupsRouter from './routes/groups.js';
import adminAuthRouter from './routes/adminAuth.js';
import adminRouter from './routes/admin.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  });
});

app.use('/payin', payinRouter);
app.use('/pay', payRouter);
app.use('/groups', groupsRouter);
app.use('/admin/auth', adminAuthRouter);
app.use('/admin', adminRouter);

app.get('/', (req, res) => res.redirect('/docs'));

app.get('/docs.json', (req, res) => res.json(openApiSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'RRPAY API' }));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
});

export default app;
