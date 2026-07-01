// src/models/Claim.js
const mongoose = require('mongoose');

/**
 * SLA par priorité :
 *   urgent → 4 heures
 *   high   → 24 heures
 *   medium → 72 heures
 *   low    → 7 jours (168 heures)
 *
 * Statuts d'une réclamation :
 *   open        → Soumise, en attente de traitement
 *   in_progress → Prise en charge par un gestionnaire
 *   resolved    → Résolue
 *   rejected    → Rejetée (non fondée)
 *   closed      → Fermée par le client après résolution
 */

const SLA_HOURS = {
  urgent: 4,
  high: 24,
  medium: 72,
  low: 168
};

// ─── Sous-schéma Message ──────────────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  authorRole: {
    type: String,
    enum: ['client', 'employee', 'company', 'super_admin'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [1000, 'Le message ne peut pas dépasser 1000 caractères']
  }
}, { timestamps: true });

// ─── Schéma principal Claim ───────────────────────────────────────────────────
const claimSchema = new mongoose.Schema({

  // ─── Numéro de réclamation auto-généré ──────────────────────────────────────
  claimNumber: {
    type: String,
    unique: true
  },

  // ─── Auteur de la réclamation ────────────────────────────────────────────────
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  submitterName: {
    type: String,
    required: true
  },
  submitterEmail: {
    type: String,
    required: true
  },
  submitterRole: {
    type: String,
    enum: ['client', 'employee', 'company'],
    required: true
  },

  // ─── Affectation ─────────────────────────────────────────────────────────────
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // ─── Catégorie & Sujet ───────────────────────────────────────────────────────
  category: {
    type: String,
    enum: ['payment', 'reservation', 'parking_condition', 'security', 'staff', 'technical', 'other'],
    required: [true, 'La catégorie est requise']
  },
  subject: {
    type: String,
    required: [true, 'Le sujet est requis'],
    trim: true,
    minlength: [5, 'Le sujet doit contenir au moins 5 caractères'],
    maxlength: [150, 'Le sujet ne peut pas dépasser 150 caractères']
  },
  description: {
    type: String,
    required: [true, 'La description est requise'],
    trim: true,
    minlength: [10, 'La description doit contenir au moins 10 caractères'],
    maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères']
  },

  // ─── Priorité & SLA ──────────────────────────────────────────────────────────
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  slaDeadline: {
    type: Date,
    default: null
  },
  slaBreached: {
    type: Boolean,
    default: false
  },

  // ─── Statut ──────────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'rejected', 'closed'],
    default: 'open',
    index: true
  },

  // ─── Pièces jointes (photos) ─────────────────────────────────────────────────
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String
  }],

  // ─── Fil de messagerie interne ───────────────────────────────────────────────
  messages: [messageSchema],

  // ─── Résolution ──────────────────────────────────────────────────────────────
  resolution: {
    type: String,
    default: null,
    maxlength: [2000, 'La résolution ne peut pas dépasser 2000 caractères']
  },
  resolvedAt: {
    type: Date,
    default: null
  },

  // ─── Évaluation de la résolution (par le client) ─────────────────────────────
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  ratingComment: {
    type: String,
    default: null,
    maxlength: 300
  }

}, { timestamps: true });

// ─── Index ────────────────────────────────────────────────────────────────────
claimSchema.index({ submittedBy: 1, status: 1 });
claimSchema.index({ assignedTo: 1, status: 1 });
claimSchema.index({ priority: 1, status: 1 });
claimSchema.index({ createdAt: -1 });

// ─── Pré-save : génération du numéro + calcul SLA ────────────────────────────
claimSchema.pre('save', async function (next) {
  // Générer claimNumber unique au premier enregistrement
  if (!this.claimNumber) {
    try {
      const count = await mongoose.model('Claim').countDocuments();
      this.claimNumber = `CLM-${String(count + 1).padStart(4, '0')}`;
    } catch (err) {
      return next(err);
    }
  }

  // Calculer la deadline SLA si la priorité vient d'être définie
  if (!this.slaDeadline && this.priority) {
    const hours = SLA_HOURS[this.priority] || 72;
    this.slaDeadline = new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  next();
});

// ─── Virtuel : SLA dépassé ────────────────────────────────────────────────────
claimSchema.virtual('isOverdue').get(function () {
  if (!this.slaDeadline) return false;
  if (['resolved', 'rejected', 'closed'].includes(this.status)) return false;
  return new Date() > this.slaDeadline;
});

// ─── Virtuel : temps restant SLA (en heures) ─────────────────────────────────
claimSchema.virtual('slaHoursRemaining').get(function () {
  if (!this.slaDeadline) return null;
  const diff = this.slaDeadline - new Date();
  return parseFloat((diff / (1000 * 60 * 60)).toFixed(1));
});

claimSchema.set('toJSON', { virtuals: true });
claimSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Claim', claimSchema);
