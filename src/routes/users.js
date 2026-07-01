const express = require('express');
const { body, param, query } = require('express-validator');
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/me', userController.getMe);
router.put('/me', [
  body('name').optional().trim().notEmpty().withMessage('Le nom ne peut pas être vide.'),
  body('phone').optional().matches(/^[0-9]{8,15}$/).withMessage('Téléphone invalide (8 à 15 chiffres).')
], userController.updateMe);
router.delete('/me', userController.deleteMe);

router.post('/employees', authorize('company', 'super_admin'), [
  body('name').trim().notEmpty().withMessage('Le nom est requis.'),
  body('email').isEmail().withMessage('Email invalide.'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères.'),
  body('phone').matches(/^[0-9]{8,15}$/).withMessage('Téléphone invalide (8 à 15 chiffres).'),
  body('position').optional().isIn(['agent', 'supervisor', 'manager']).withMessage('Position invalide.'),
], userController.createEmployee);

router.get('/employees', authorize('company', 'super_admin'), userController.getCompanyEmployees);
router.get('/employees/:id/logs', authorize('company', 'super_admin'), userController.getEmployeeLogs);
router.post('/employees/:id/face', authorize('company', 'super_admin'), userController.enrollFace);
router.delete('/employees/:id/face', authorize('company', 'super_admin'), userController.deleteFace);
router.get('/company/parkings', authorize('company'), userController.getCompanyParkings);

router.post('/parking-request', authorize('company'), [
  body('name').trim().notEmpty().withMessage('Le nom du parking est requis.'),
  body('address').trim().notEmpty().withMessage('L\'adresse est requise.'),
  body('city').trim().notEmpty().withMessage('La ville est requise.'),
  body('zipCode').trim().notEmpty().withMessage('Le code postal est requis.'),
  body('totalSpots').isInt({ min: 1 }).withMessage('Le nombre total de places doit être d\'au moins 1.'),
  body('pricePerHour').isFloat({ min: 0 }).withMessage('Le prix par heure doit être un nombre positif.'),
], userController.submitParkingRequest);

router.get('/', authorize('super_admin', 'company'), userController.getUsers);
router.get('/:id', authorize('super_admin', 'company'), [
  param('id').isMongoId().withMessage('Identifiant invalide.')
], userController.getUserById);
router.put('/:id', authorize('super_admin', 'company'), [
  param('id').isMongoId().withMessage('Identifiant invalide.'),
  body('name').optional().trim().notEmpty().withMessage('Le nom ne peut pas être vide.'),
  body('phone').optional().matches(/^[0-9]{8,15}$/).withMessage('Téléphone invalide (8 à 15 chiffres).')
], userController.updateUser);
router.delete('/:id', authorize('super_admin', 'company'), [
  param('id').isMongoId().withMessage('Identifiant invalide.')
], userController.deleteUser);

module.exports = router;
