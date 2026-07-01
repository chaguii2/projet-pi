const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de l\'abonnement est requis'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  parkingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parking',
    required: [true, 'Le parking associé est requis']
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'entreprise associée est requise']
  },
  price: {
    type: Number,
    required: [true, 'Le prix est requis'],
    min: [0, 'Le prix ne peut pas être négatif']
  },
  durationDays: {
    type: Number,
    required: [true, 'La durée en jours est requise'],
    min: [1, 'La durée doit être d\'au moins 1 jour']
  },
  features: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
module.exports = SubscriptionPlan;
