import 'dotenv/config';

const required = ['MONGODB_URI'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const port = Number(process.env.PORT ?? 4000);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  mongoUri: process.env.MONGODB_URI,
  payUrlBase: (process.env.PAY_URL_BASE ?? `http://localhost:${port}/pay`).replace(/\/+$/, ''),
  merchantNo: process.env.MERCHANT_NO,
  merchantSecret: process.env.MERCHANT_SECRET,
};
