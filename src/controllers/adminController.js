// src/controllers/adminController.js
const { validationResult } = require('express-validator');
const adminService = require('../services/AdminService');

// Obtenir la liste de toutes les entreprises
exports.getCompanies = async (req, res, next) => {
  try {
    const companies = await adminService.getCompanies(req.user);
    res.json({ companies });
  } catch (error) {
    next(error);
  }
};

// Approuver une entreprise
exports.approveCompany = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const company = await adminService.approveCompany(req.params.id, req.user);
    res.json({ message: 'Entreprise approuvée avec succès.', company });
  } catch (error) {
    next(error);
  }
};

// Rejeter une entreprise
exports.rejectCompany = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reason } = req.body;
    const company = await adminService.rejectCompany(req.params.id, reason, req.user);
    res.json({ message: 'Entreprise rejetée.', company });
  } catch (error) {
    next(error);
  }
};

// Suspendre une entreprise
exports.suspendCompany = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const company = await adminService.suspendCompany(req.params.id, req.user);
    res.json({ message: 'Entreprise suspendue.', company });
  } catch (error) {
    next(error);
  }
};

// Obtenir la liste de toutes les demandes de parkings
exports.getParkings = async (req, res, next) => {
  try {
    const parkings = await adminService.getParkings(req.user);
    res.json({ parkings });
  } catch (error) {
    next(error);
  }
};

// Approuver une demande de parking
exports.approveParking = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const parking = await adminService.approveParking(req.params.id, req.user);
    res.json({ message: 'Demande de parking approuvée avec succès.', parking });
  } catch (error) {
    next(error);
  }
};

// Rejeter une demande de parking
exports.rejectParking = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reason } = req.body;
    const parking = await adminService.rejectParking(req.params.id, reason, req.user);
    res.json({ message: 'Demande de parking rejetée.', parking });
  } catch (error) {
    next(error);
  }
};
