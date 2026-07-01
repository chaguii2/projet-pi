const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  parkingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parking',
    required: true
  },
  actionType: {
    type: String,
    enum: ['LOGIN', 'CHECK_IN', 'CHECK_OUT', 'SPOT_STATUS_CHANGE', 'SHIFT_START', 'SHIFT_END'],
    required: true
  },
  details: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for fast lookups by user and timestamp
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ parkingId: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
