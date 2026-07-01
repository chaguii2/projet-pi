const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  parkingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parking',
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  pricePaid: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'wallet', 'cash'],
    default: 'card'
  },
  transactionId: {
    type: String,
    default: function() {
      return 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
  }
}, {
  timestamps: true
});

// Virtual check to verify if subscription is expired based on date
subscriptionSchema.virtual('isExpired').get(function() {
  return new Date() > this.endDate;
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);
module.exports = Subscription;
