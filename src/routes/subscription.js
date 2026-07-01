const express = require('express');
const { body, param } = require('express-validator');
const subscriptionController = require('../controllers/subscriptionController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Routes publiques / authentifiées de base (récupération des plans pour un parking)
router.get('/plans/parking/:parkingId', [
  param('parkingId').isMongoId().withMessage('ID de parking invalide.')
], subscriptionController.getPlansForParking);

// Toutes les autres routes requièrent d'être connecté
router.use(protect);

// --- ROUTES CLIENT ---
router.post('/buy', [
  body('planId').isMongoId().withMessage('ID de forfait invalide.'),
  body('paymentMethod').optional().isIn(['card', 'wallet', 'cash']).withMessage('Méthode de paiement invalide.')
], authorize('client'), subscriptionController.buySubscription);

router.get('/client/my', authorize('client'), subscriptionController.getClientSubscriptions);

// --- ROUTES ENTREPRISE (COMPANY) ---
router.post('/plans', [
  body('name').trim().notEmpty().withMessage('Le nom du forfait est requis.'),
  body('parkingId').isMongoId().withMessage('ID de parking invalide.'),
  body('price').isFloat({ min: 0 }).withMessage('Le prix doit être positif.'),
  body('durationDays').isInt({ min: 1 }).withMessage('La durée doit être d\'au moins 1 jour.'),
  body('features').optional().isArray().withMessage('Les caractéristiques doivent être un tableau de chaînes.')
], authorize('company'), subscriptionController.createPlan);

router.put('/plans/:planId', [
  param('planId').isMongoId().withMessage('ID de forfait invalide.'),
  body('name').optional().trim().notEmpty().withMessage('Le nom du forfait ne peut pas être vide.'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Le prix doit être positif.'),
  body('durationDays').optional().isInt({ min: 1 }).withMessage('La durée doit être d\'au moins 1 jour.'),
  body('features').optional().isArray().withMessage('Les caractéristiques doivent être un tableau.'),
  body('isActive').optional().isBoolean().withMessage('Le statut d\'activation doit être un booléen.')
], authorize('company'), subscriptionController.updatePlan);

router.get('/company/subscribers', authorize('company'), subscriptionController.getCompanySubscriptions);

// --- ROUTES SUPER ADMIN ---
router.get('/admin/all', authorize('super_admin'), subscriptionController.getAllSubscriptions);

module.exports = router;
