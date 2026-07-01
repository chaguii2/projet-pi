const mongoose = require('mongoose');

const parkingSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom du parking est requis'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'L\'adresse est requise'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'La ville est requise'],
    trim: true
  },
  zipCode: {
    type: String,
    required: [true, 'Le code postal est requis'],
    trim: true
  },
  totalSpots: {
    type: Number,
    required: [true, 'Le nombre total de places est requis'],
    min: [1, 'Le parking doit contenir au moins 1 place']
  },
  pricePerHour: {
    type: Number,
    required: [true, 'Le prix par heure est requis'],
    min: [0, 'Le prix doit être positif']
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String,
    default: null
  },
  // Additional fields integrated from colleague's project
  availableSpots: {
    type: Number,
    default: 0
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [10.1815, 36.8065] // [lng, lat] default to Tunis
    }
  },
  openingTime: {
    type: String,
    default: '08:00'
  },
  closingTime: {
    type: String,
    default: '22:00'
  },
  isOpen24h: {
    type: Boolean,
    default: false
  },
  pricePerDay: {
    type: Number,
    default: null
  },
  pricePerMonth: {
    type: Number,
    default: null
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  features: [{
    type: String
  }],
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  contactPhone: {
    type: String,
    default: ''
  },
  contactEmail: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index geospatiale pour la recherche à proximité
parkingSchema.index({ location: '2dsphere' });
parkingSchema.index({ name: 'text', address: 'text', city: 'text', description: 'text' });

const Parking = mongoose.model('Parking', parkingSchema);
module.exports = Parking;
