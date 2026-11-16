import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import payinRouter from './routes/payin.js';
import payRouter from './routes/pay.js';
import groupsRouter from './routes/groups.js';
import adminAuthRouter from './routes/adminAuth.js';
import adminRouter from './routes/admin.js';

const app = express();

// Comprehensive CORS: allow the production frontend origin, handle OPTIONS preflight.
const allowedOrigins = ['https://rrpayadmin.netlify.app', 'https://rrpayadmin.vercel.app', 'http://localhost:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    credentials: false,
  })
);

// Belt-and-suspenders: answer any OPTIONS preflight before the router.
// (Express 5 no longer supports bare '*' route wildcards, so use middleware.)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': allowedOrigins.includes(req.headers.origin) ? req.headers.origin : '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept,Origin',
      'Access-Control-Max-Age': 86400,
    });
    return res.sendStatus(204);
  }
  return next();
});

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

// Also expose the same API under /api/* for frontend compatibility
// (e.g. the React app calls POST /api/admin/auth/login).
app.use('/api/payin', payinRouter);
app.use('/api/pay', payRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin', adminRouter);

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
