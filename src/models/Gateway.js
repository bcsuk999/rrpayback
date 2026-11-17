import mongoose from 'mongoose';

const gatewaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ['rrpay', 'ngpay'],
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('Gateway', gatewaySchema);
