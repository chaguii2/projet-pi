// src/models/ParkingSpot.js
const mongoose = require('mongoose');

const parkingSpotSchema = new mongoose.Schema({
  // Référence au parking propriétaire
  parkingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parking',
    required: true,
    index: true
  },
  
  // Identifiants de la place
  spotNumber: {
    type: String,
    required: true,
    trim: true
  },
  
  // Position dans le parking (pour simulateur)
  row: {
    type: Number,
    default: 1,
    min: 1,
    max: 20
  },
  column: {
    type: Number,
    default: 1,
    min: 1,
    max: 20
  },
  level: {
    type: Number,
    default: 0,
    min: -2,
    max: 5
  },
  zone: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    default: 'A'
  },
  
  // Caractéristiques de la place
  type: {
    type: String,
    enum: ['STANDARD', 'HANDICAP', 'ELECTRIC', 'COMPACT', 'MOTORCYCLE', 'FAMILY', 'VIP'],
    default: 'STANDARD'
  },
  priceMultiplier: {
    type: Number,
    default: 1.0,
    min: 0.5,
    max: 2.0
  },
  
  // Statut de la place
  isAvailable: {
    type: Boolean,
    default: true,
    index: true
  },
  isReserved: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'MAINTENANCE', 'BLOCKED'],
    default: 'ACTIVE'
  },
  
  // Réservation en cours
  currentReservation: {
    bookingId: {
      type: String, // Modification: String pour accepter les IDs de simulation/réservation custom
      default: null
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    userName: {
      type: String,
      default: null
    },
    userEmail: {
      type: String,
      default: null
    },
    userPhone: {
      type: String,
      default: null
    },
    vehiclePlate: {
      type: String,
      default: null
    },
    reservedUntil: {
      type: Date,
      default: null
    },
    startTime: {
      type: Date,
      default: null
    },
    endTime: {
      type: Date,
      default: null
    }
  },
  
  // Historique des réservations
  reservationsHistory: [{
    bookingId: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    userEmail: String,
    vehiclePlate: String,
    startTime: Date,
    endTime: Date,
    status: String,
    reservedAt: { type: Date, default: Date.now }
  }],
  
  // Métriques
  totalReservations: {
    type: Number,
    default: 0
  },
  totalHoursReserved: {
    type: Number,
    default: 0
  },
  lastReservedAt: {
    type: Date,
    default: null
  },
  lastFreedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index
parkingSpotSchema.index({ parkingId: 1, spotNumber: 1 }, { unique: true });
parkingSpotSchema.index({ parkingId: 1, row: 1, column: 1 });
parkingSpotSchema.index({ parkingId: 1, zone: 1 });
parkingSpotSchema.index({ parkingId: 1, type: 1 });
parkingSpotSchema.index({ parkingId: 1, isAvailable: 1, isReserved: 1 });
parkingSpotSchema.index({ 'currentReservation.reservedUntil': 1 });
parkingSpotSchema.index({ 'currentReservation.userId': 1 });
parkingSpotSchema.index({ parkingId: 1, status: 1 });

module.exports = mongoose.model('ParkingSpot', parkingSpotSchema);
