import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import payinRouter from './routes/payin.js';
import payRouter from './routes/pay.js';
import groupsRouter from './routes/groups.js';
import adminAuthRouter from './routes/adminAuth.js';
import adminRouter from './routes/admin.js';

const app = express();

// CORS — allow the admin frontend origin(s).
// Additional origins can be granted via the CORS_ORIGIN env var (comma-separated).
const allowedOrigins = [
  'https://rrpayadmin.netlify.app',
  ...String(process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const corsOptions = {
  origin: allowedOrigins, // array -> origin is reflected when it is allow-listed
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // cache successful preflights for 24h
};

app.use(cors(corsOptions));
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

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'RRPAY backend running' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
});

export default app;
