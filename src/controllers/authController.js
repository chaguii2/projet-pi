// src/controllers/authController.js
const { validationResult } = require('express-validator');
const authService = require('../services/AuthService');

// ─── Register ────────────────────────────────────────────────────────────────
exports.registerUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const result = await authService.registerUser(req.body);
    res.status(201).json({
      message: 'Utilisateur créé avec succès.',
      ...result
    });
  } catch (err) {
    next(err);
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
exports.loginUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    res.json({
      message: 'Connexion réussie.',
      ...result
    });
  } catch (err) {
    next(err);
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// ─── Face Login ───────────────────────────────────────────────────────────────
exports.faceLogin = async (req, res, next) => {
  try {
    const { descriptor } = req.body;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, message: 'Descripteur facial invalide.' });
    }

    const User = require('../models/User');
    const jwt = require('jsonwebtoken');

    // Load all employees that have a faceDescriptor enrolled
    const employees = await User.find({
      role: 'employee',
      isActive: true,
      faceDescriptor: { $ne: null, $exists: true, $not: { $size: 0 } }
    }).select('+faceDescriptor');

    if (!employees.length) {
      return res.status(404).json({ success: false, message: 'Aucun employé avec visage enregistré trouvé.' });
    }

    // Compute Euclidean distance between incoming descriptor and stored ones
    const euclideanDistance = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
      return Math.sqrt(sum);
    };

    const THRESHOLD = 0.5; // face-api.js recommended threshold
    let bestMatch = null;
    let bestDistance = Infinity;

    for (const emp of employees) {
      if (!emp.faceDescriptor || emp.faceDescriptor.length !== 128) continue;
      const dist = euclideanDistance(descriptor, emp.faceDescriptor);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = emp;
      }
    }

    if (!bestMatch || bestDistance > THRESHOLD) {
      return res.status(401).json({
        success: false,
        message: 'Visage non reconnu. Veuillez utiliser votre mot de passe.',
        distance: bestDistance
      });
    }

    // Generate JWT token for matched employee
    const token = jwt.sign(
      { id: bestMatch._id, role: bestMatch.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: `Bienvenue, ${bestMatch.name} ! Connexion par reconnaissance faciale réussie.`,
      token,
      user: {
        _id: bestMatch._id,
        name: bestMatch.name,
        email: bestMatch.email,
        role: bestMatch.role,
        parkingId: bestMatch.parkingId
      }
    });
  } catch (err) {
    next(err);
  }
};