import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema(
  {
    /** Our internal payout reference (unique). */
    payoutOrderNo: { type: String, unique: true, sparse: true, index: true },
    /** Order number sent to RRPAY (outTradeNo). */
    outTradeNo: { type: String, required: true, index: true },
    /** RRPAY's platform order number, returned when resultCode=0000. */
    remitOrderNo: { type: String, index: true, default: null },
    uid: { type: String, required: true, index: true },
    groupId: { type: Number, required: true, index: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    currencyCode: { type: String, required: true },
    bankCode: { type: String, required: true }, // IMPS | UPI
    identityType: { type: String, required: true }, // IMPS | UPI
    bankAcctNo: { type: String, required: true },
    bankAcctName: { type: String, default: null },
    bankFirstName: { type: String, default: null },
    bankLastName: { type: String, default: null },
    accPhone: { type: String, required: true },
    accEmail: { type: String, required: true },
    identityNo: { type: String, required: true }, // IFSC (bank card) or UPI account (UPI)
    notifyUrl: { type: String, default: null },
    /** Payout lifecycle state. */
    state: {
      type: String,
      enum: ['submitted', 'success', 'failed', 'rejected', 'unclear', 'cancelled', 'failed_refunded'],
      default: 'submitted',
      index: true,
    },
    remitState: { type: String, default: null },
    orderMessage: { type: String, default: null },
    utrCode: { type: String, default: null },
    remitDate: { type: Date, default: null },
    /** Raw RRPAY request/response for audit & debugging. */
    rawRequest: { type: mongoose.Schema.Types.Mixed, default: null },
    rawResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    remark: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

payoutSchema.index({ groupId: 1, createdAt: -1 });
payoutSchema.index({ uid: 1, createdAt: -1 });
payoutSchema.index({ state: 1, createdAt: -1 });

export default mongoose.model('Payout', payoutSchema);
