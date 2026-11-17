import dotenv from 'dotenv';
dotenv.config({ override: true, quiet: true });
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Gateway from '../src/models/Gateway.js';

await connectDB();

const gateways = [
  { name: 'rrpay', status: 'active', config: {} },
  { name: 'ngpay', status: 'active', config: {} },
];

for (const gw of gateways) {
  await Gateway.findOneAndUpdate(
    { name: gw.name },
    { $setOnInsert: gw },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

const all = await Gateway.find().select('name status createdAt updatedAt').lean();
console.log('Gateways seeded:', JSON.stringify(all, null, 2));

await mongoose.disconnect();
