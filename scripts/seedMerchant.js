import dotenv from 'dotenv';
dotenv.config({ override: true, quiet: true });
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Merchant from '../src/models/Merchant.js';

const merNo = process.env.MERCHANT_NO ?? 'RRPAY0000000001';
const secretKey = process.env.MERCHANT_SECRET ?? 'dev_secret_change_me';
const name = process.env.MERCHANT_NAME ?? 'RRPAY Test Merchant';

await connectDB();

const merchant = await Merchant.findOneAndUpdate(
  { merNo },
  { merNo, name, secretKey, status: 'active' },
  { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
);

console.log(`Merchant ready: merNo=${merchant.merNo}`);

await mongoose.disconnect();
