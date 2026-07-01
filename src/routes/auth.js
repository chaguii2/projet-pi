const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Le nom est requis.'),
  body('email').isEmail().withMessage('Email invalide.'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères.'),
  body('phone').matches(/^[0-9]{8,15}$/).withMessage('Téléphone invalide (8 à 15 chiffres).'),
], authController.registerUser);

router.post('/login', [
  body('email').isEmail().withMessage('Email invalide.'),
  body('password').notEmpty().withMessage('Le mot de passe est requis.'),
], authController.loginUser);

router.post('/forgot-password', [
  body('email').isEmail().withMessage('Email invalide.')
], authController.forgotPassword);

router.post('/reset-password', [
  body('token').notEmpty().withMessage('Le token est requis.'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères.')
], authController.resetPassword);

// Face recognition login (no auth required - public route)
router.post('/face-login', [
  body('descriptor').isArray({ min: 128, max: 128 }).withMessage('Descripteur facial invalide (128 valeurs requises).')
], authController.faceLogin);

module.exports = router;
