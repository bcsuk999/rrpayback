import mongoose from 'mongoose';

const payinSchema = new mongoose.Schema(
  {
    payOrderNo: { type: String, required: true, unique: true, index: true },
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    merNo: { type: String, required: true, index: true },
    outTradeNo: { type: String, required: true },

    currencyCode: { type: String, required: true },
    payType: { type: String, required: true },
    randomNo: { type: String, required: true },
    totalAmount: { type: mongoose.Schema.Types.Decimal128, required: true },

    notifyUrl: { type: String, required: true },
    payViewUrl: { type: String },

    payCardNo: { type: String, required: true },
    payBankCode: { type: String, required: true },
    payName: { type: String, required: true },
    payEmail: { type: String, required: true },
    payPhone: { type: String, required: true },
    payIp: { type: String, required: true },

    payURL: { type: String, required: true },

    // Optional link to a registered Telegram group (for bot-driven deposits).
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
    groupId: { type: Number, index: true },
    uid: { type: String, index: true },
    // Reserved for channels that return a native payment string or QR payload.
    payParams: { type: String },
    // Extracted UPI/VPA and amount when available from provider response or deeplink.
    upiId: { type: String },
    deeplinkAmount: { type: String },
    telegramChatId: { type: Number },
    telegramMessageId: { type: Number },
    depositExpiresAt: { type: Date },
    depositMessageStatus: {
      type: String,
      enum: ['pending', 'expired', 'completed'],
    },

    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'expired'],
      default: 'pending',
      index: true,
    },
    payState: { type: String },
    paidAt: { type: Date },
    utrCode: { type: String },

    rawRequest: { type: mongoose.Schema.Types.Mixed },
    rawResponse: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// A merchant's outTradeNo must be unique.
payinSchema.index({ merNo: 1, outTradeNo: 1 }, { unique: true });
payinSchema.index({ merNo: 1, createdAt: -1 });
payinSchema.index({ outTradeNo: 1 });
payinSchema.index({ upiId: 1 });
payinSchema.index({ payURL: 1 });
payinSchema.index({ utrCode: 1 });
payinSchema.index({ payState: 1 });
payinSchema.index({ totalAmount: 1 });
payinSchema.index({ createdAt: -1, _id: -1 });
payinSchema.index({ updatedAt: -1 });
payinSchema.index({ status: 1, createdAt: -1, _id: -1 });
payinSchema.index({ groupId: 1, createdAt: -1, _id: -1 });

export default mongoose.model('Payin', payinSchema);
