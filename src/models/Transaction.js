import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, index: true },
    groupId: { type: Number, required: true, index: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true, index: true },
    coType: {
      type: String,
      enum: ['payin', 'payout', 'bonus', 'adjustment', 'other'],
      default: 'other',
      index: true,
    },
    payin: { type: mongoose.Schema.Types.ObjectId, ref: 'Payin' },
  },
  { timestamps: true }
);

transactionSchema.index({ groupId: 1, createdAt: -1 });
transactionSchema.index({ payin: 1, type: 1, coType: 1 });

export default mongoose.model('Transaction', transactionSchema);
