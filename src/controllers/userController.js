// src/controllers/userController.js
const { validationResult } = require('express-validator');
const userService = require('../services/UserService');
const activityLogService = require('../services/ActivityLogService');

exports.getMe = async (req, res, next) => {
  try {
    const user = await userService.getMe(req.user);
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await userService.updateMe(req.user, req.body);
    res.json({ message: 'Profil mis à jour.', user });
  } catch (error) {
    next(error);
  }
};

exports.deleteMe = async (req, res, next) => {
  try {
    const result = await userService.deleteMe(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const users = await userService.getUsers(req.user);
    res.json({ users });
  } catch (error) {
    next(error);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await userService.getUserById(req.params.id, req.user);
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await userService.updateUser(req.params.id, req.body, req.user);
    res.json({ message: 'Utilisateur mis à jour.', user });
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const result = await userService.deleteUser(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await userService.createEmployee(req.body, req.user);
    res.status(201).json({ message: 'Employé créé avec succès et identifiants envoyés.', user });
  } catch (error) {
    next(error);
  }
};

exports.getCompanyEmployees = async (req, res, next) => {
  try {
    const employees = await userService.getCompanyEmployees(req.query.companyId, req.user);
    res.json({ employees });
  } catch (error) {
    next(error);
  }
};

exports.submitParkingRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const parking = await userService.submitParkingRequest(req.body, req.user);
    res.status(201).json({ message: 'Demande d\'intégration de parking soumise avec succès.', parking });
  } catch (error) {
    next(error);
  }
};

exports.getCompanyParkings = async (req, res, next) => {
  try {
    const parkings = await userService.getCompanyParkings(req.user);
    res.json({ parkings });
  } catch (error) {
    next(error);
  }
};

exports.getEmployeeLogs = async (req, res, next) => {
  try {
    const logs = await activityLogService.getEmployeeLogs(req.params.id, req.user, req.query);
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

exports.enrollFace = async (req, res, next) => {
  try {
    const { descriptor } = req.body;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, message: 'Descripteur facial invalide.' });
    }

    const User = require('../models/User');
    const employee = await User.findById(req.params.id);
    if (!employee || employee.role !== 'employee') {
      return res.status(404).json({ success: false, message: 'Employé non trouvé.' });
    }

    // Access check: Company can only update their own employee
    if (req.user.role === 'company' && employee.companyId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Accès interdit.' });
    }

    employee.faceDescriptor = descriptor;
    await employee.save();

    res.json({ success: true, message: 'Visage enregistré avec succès.' });
  } catch (error) {
    next(error);
  }
};

exports.deleteFace = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const employee = await User.findById(req.params.id);
    if (!employee || employee.role !== 'employee') {
      return res.status(404).json({ success: false, message: 'Employé non trouvé.' });
    }

    if (req.user.role === 'company' && employee.companyId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Accès interdit.' });
    }

    employee.faceDescriptor = null;
    await employee.save();

    res.json({ success: true, message: 'Visage supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
};
