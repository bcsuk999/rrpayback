import mongoose from 'mongoose';

const merchantSchema = new mongoose.Schema(
  {
    merNo: { type: String, required: true, unique: true, trim: true, maxlength: 32 },
    name: { type: String, required: true, trim: true },
    secretKey: { type: String, required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  },
  { timestamps: true }
);

export default mongoose.model('Merchant', merchantSchema);
