const express = require('express');
const { param, body } = require('express-validator');
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(protect);
router.use(authorize('super_admin')); // toutes ces routes sont super_admin only

router.get('/companies', adminController.getCompanies);

router.put('/companies/:id/approve', [
  param('id').isMongoId().withMessage('Identifiant invalide.')
], adminController.approveCompany);

router.put('/companies/:id/reject', [
  param('id').isMongoId().withMessage('Identifiant invalide.'),
  body('reason').optional().isString()
], adminController.rejectCompany);

router.put('/companies/:id/suspend', [
  param('id').isMongoId().withMessage('Identifiant invalide.')
], adminController.suspendCompany);

// Routes Gestion des demandes de parkings
router.get('/parkings', adminController.getParkings);

router.put('/parkings/:id/approve', [
  param('id').isMongoId().withMessage('Identifiant invalide.')
], adminController.approveParking);

router.put('/parkings/:id/reject', [
  param('id').isMongoId().withMessage('Identifiant invalide.'),
  body('reason').optional().isString()
], adminController.rejectParking);

module.exports = router;
