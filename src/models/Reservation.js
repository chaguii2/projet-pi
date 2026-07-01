// src/models/Reservation.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Statuts d'une réservation :
 *   pending   → Créée, en attente de confirmation (expire automatiquement après autoConfirmExpiry)
 *   confirmed → Confirmée (par le client ou un employé)
 *   active    → Client arrivé et check-in effectué
 *   completed → Sortie effectuée, réservation terminée
 *   cancelled → Annulée (par le client, l'entreprise ou l'admin)
 *   no_show   → Client n'est jamais arrivé
 *   expired   → Réservation en "pending" qui a dépassé l'heure d'expiration
 */

const reservationSchema = new mongoose.Schema({
  // ─── Références ──────────────────────────────────────────────────────────────
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  parkingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parking',
    required: true,
    index: true
  },
  spotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpot',
    required: true,
    index: true
  },

  // ─── Données en cache (évite des jointures répétées) ─────────────────────────
  spotNumber: {
    type: String,
    required: true
  },
  clientName: {
    type: String,
    required: true
  },
  clientEmail: {
    type: String,
    required: true
  },
  clientPhone: {
    type: String,
    default: null
  },

  // ─── Véhicule ────────────────────────────────────────────────────────────────
  vehiclePlate: {
    type: String,
    required: [true, 'La plaque d\'immatriculation est requise'],
    uppercase: true,
    trim: true
  },
  vehicleType: {
    type: String,
    enum: ['car', 'motorcycle', 'electric', 'handicap'],
    default: 'car'
  },

  // ─── Créneau ─────────────────────────────────────────────────────────────────
  startTime: {
    type: Date,
    required: [true, 'La date/heure de début est requise']
  },
  endTime: {
    type: Date,
    required: [true, 'La date/heure de fin est requise']
  },
  durationHours: {
    type: Number,
    min: 0.5,
    default: 1
  },

  // ─── Tarification ────────────────────────────────────────────────────────────
  pricePerHour: {
    type: Number,
    required: true,
    min: 0
  },
  priceMultiplier: {
    type: Number,
    default: 1.0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },

  // ─── Paiement ────────────────────────────────────────────────────────────────
  paymentMethod: {
    type: String,
    enum: ['card', 'wallet', 'cash'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    default: null
  },

  // ─── Statut & Cycle de vie ───────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'no_show', 'expired'],
    default: 'pending',
    index: true
  },

  // Date limite d'expiration automatique (réservation pending non confirmée)
  autoConfirmExpiry: {
    type: Date,
    default: null,
    index: true
  },

  // ─── Horodatages des transitions ─────────────────────────────────────────────
  confirmedAt: {
    type: Date,
    default: null
  },
  checkedInAt: {
    type: Date,
    default: null
  },
  checkedOutAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },

  // ─── Informations complémentaires ────────────────────────────────────────────
  cancelReason: {
    type: String,
    default: null
  },
  cancelledBy: {
    type: String,
    enum: { values: ['client', 'company', 'admin', 'system', null] },
    default: null
  },
  notes: {
    type: String,
    default: null,
    maxlength: 500
  },

  // ─── QR Code / Identifiant d'entrée ──────────────────────────────────────────
  qrCode: {
    type: String,
    unique: true,
    default: () => `QR-${uuidv4().toUpperCase().replace(/-/g, '').slice(0, 12)}`
  },

  // ─── Évaluation post-séjour ───────────────────────────────────────────────────
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  reviewComment: {
    type: String,
    default: null,
    maxlength: 300
  }

}, {
  timestamps: true
});

// ─── Index composites ──────────────────────────────────────────────────────────
reservationSchema.index({ clientId: 1, status: 1 });
reservationSchema.index({ parkingId: 1, status: 1, startTime: 1 });
reservationSchema.index({ spotId: 1, status: 1 });
reservationSchema.index({ qrCode: 1 });
reservationSchema.index({ autoConfirmExpiry: 1, status: 1 });

// ─── Virtuel : durée réelle (après check-out) ─────────────────────────────────
reservationSchema.virtual('actualDurationHours').get(function () {
  if (this.checkedInAt && this.checkedOutAt) {
    return parseFloat(
      ((this.checkedOutAt - this.checkedInAt) / (1000 * 60 * 60)).toFixed(2)
    );
  }
  return null;
});

reservationSchema.set('toJSON', { virtuals: true });
reservationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Reservation', reservationSchema);
