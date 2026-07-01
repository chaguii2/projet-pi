const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const UserRoles = require('./UserRoles');

// Schéma User unique avec rôles et champs spécifiques selon le type
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    minlength: [2, 'Le nom doit contenir au moins 2 caractères']
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email invalide']
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères'],
    select: false
  },
  phone: {
    type: String,
    required: [true, 'Le téléphone est requis'],
    match: [/^[0-9]{8,15}$/, 'Téléphone invalide (8 à 15 chiffres)']
  },
  role: {
    type: String,
    enum: Object.values(UserRoles),
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  profilePicture: {
    type: String,
    default: null
  },

  // Client-specific fields
  loyaltyPoints: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  totalReservations: {
    type: Number,
    default: 0
  },
  favoriteParkings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parking'
  }],
  cin: {
    type: String,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9]{6,15}$/, 'CIN invalide']
  },
  vehicleSerialNumber: {
    type: String,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9]{5,20}$/, 'Numéro de série de véhicule invalide']
  },
  vehiclePlate: {
    type: String,
    uppercase: true,
    match: [/^[A-Z0-9]{5,10}$/, 'Plaque d\'immatriculation invalide']
  },
  vehicleType: {
    type: String,
    enum: ['car', 'motorcycle', 'electric', 'handicap'],
    default: 'car'
  },
  preferredPaymentMethod: {
    type: String,
    enum: ['card', 'wallet', 'cash'],
    default: 'card'
  },
  emailNotifications: {
    type: Boolean,
    default: true
  },
  smsNotifications: {
    type: Boolean,
    default: false
  },

  // Company-specific fields
  address: {
    type: String,
    required: function() {
      return this.role === UserRoles.COMPANY;
    }
  },
  siret: {
    type: String,
    unique: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  approvedAt: {
    type: Date
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  totalParkings: {
    type: Number,
    default: 0
  },
  subscriptionPlan: {
    type: String,
    enum: ['basic', 'premium', 'enterprise'],
    default: 'basic'
  },

  // Employee-specific fields
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.role === UserRoles.EMPLOYEE;
    }
  },
  parkingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parking',
    default: null
  },
  position: {
    type: String,
    enum: ['agent', 'supervisor', 'manager'],
    default: 'agent'
  },
  hireDate: {
    type: Date,
    default: Date.now
  },
  employeeNumber: {
    type: String,
    unique: true,
    sparse: true,
    required: function() {
      return this.role === UserRoles.EMPLOYEE;
    }
  },
  permissions: [{
    type: String,
    enum: ['scan_qr', 'view_revenue', 'export_reports', 'manage_spots', 'view_clients']
  }],
  shiftStart: {
    type: String,
    default: '08:00'
  },
  shiftEnd: {
    type: String,
    default: '17:00'
  },
  isOnDuty: {
    type: Boolean,
    default: false
  },
  faceDescriptor: {
    type: [Number],
    default: null,
    select: false  // not returned by default for security
  },
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  }
}, {
  timestamps: true
});

// Hash du mot de passe et génération du numéro d'employé avant sauvegarde
userSchema.pre('validate', async function(next) {
  if (this.role === UserRoles.EMPLOYEE && !this.employeeNumber) {
    try {
      const count = await mongoose.model('User').countDocuments({ role: UserRoles.EMPLOYEE });
      this.employeeNumber = `EMP-${String(count + 1).padStart(4, '0')}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Créer le modèle (pas de collection directe, on utilisera les discriminators)
const User = mongoose.model('User', userSchema);

module.exports = User;