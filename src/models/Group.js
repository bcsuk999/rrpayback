import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    groupId: { type: Number, required: true, unique: true, index: true },
    groupName: { type: String, trim: true, default: '' },
    exchangeRate: { type: Number, default: null },
    status: {
      type: String,
      enum: ['active', 'suspended', 'banned'],
      default: 'active',
      index: true,
    },
    remark: { type: String, trim: true, default: '' },
    balance: { type: mongoose.Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0') },
  },
  { timestamps: true }
);

groupSchema.index({ groupName: 1, createdAt: -1, _id: -1 });
groupSchema.index({ createdAt: -1, _id: -1 });
groupSchema.index({ status: 1, createdAt: -1, _id: -1 });

export default mongoose.model('Group', groupSchema);
