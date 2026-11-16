import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user', index: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  },
  { timestamps: true }
);

export default mongoose.model('Admin', adminSchema);
