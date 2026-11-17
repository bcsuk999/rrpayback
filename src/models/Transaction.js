import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    transactionNo: { type: String, unique: true, sparse: true, index: true },
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
    payout: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout' },
    payoutState: {
      type: String,
      enum: ['submitted', 'success', 'failed', 'cancelled', 'failed_refunded', 'unclear'],
      default: null,
    },
    // Ledger snapshot after this transaction was applied. Older records may be null.
    balanceAfter: { type: mongoose.Schema.Types.Decimal128, default: null },
    remark: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

transactionSchema.index({ groupId: 1, createdAt: -1 });
transactionSchema.index({ uid: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ payin: 1, type: 1, coType: 1 });
transactionSchema.index({ payout: 1, type: 1, coType: 1 });

export default mongoose.model('Transaction', transactionSchema);
