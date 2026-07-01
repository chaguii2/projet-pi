// src/routes/reservation.js
const express = require('express');
const { body, param, query } = require('express-validator');
const reservationController = require('../controllers/reservationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes requièrent une authentification
router.use(protect);

// ─── Validation helpers ────────────────────────────────────────────────────────

const validateReservationId = [
  param('id').isMongoId().withMessage('ID de réservation invalide.')
];

const validateParkingId = [
  param('parkingId').isMongoId().withMessage('ID de parking invalide.')
];

const validateCreateReservation = [
  body('parkingId')
    .isMongoId().withMessage('ID de parking invalide.'),
  body('spotId')
    .optional()
    .isMongoId().withMessage('ID de place invalide.'),
  body('vehiclePlate')
    .notEmpty().withMessage('La plaque d\'immatriculation est requise.')
    .trim()
    .isLength({ min: 4, max: 15 }).withMessage('Plaque invalide (4-15 caractères).'),
  body('vehicleType')
    .optional()
    .isIn(['car', 'motorcycle', 'electric', 'handicap'])
    .withMessage('Type de véhicule invalide.'),
  body('startTime')
    .notEmpty().withMessage('La date/heure de début est requise.')
    .isISO8601().withMessage('Format de date invalide (ISO 8601 attendu).'),
  body('endTime')
    .notEmpty().withMessage('La date/heure de fin est requise.')
    .isISO8601().withMessage('Format de date invalide (ISO 8601 attendu).'),
  body('paymentMethod')
    .optional()
    .isIn(['card', 'wallet', 'cash']).withMessage('Méthode de paiement invalide.'),
  body('notes')
    .optional()
    .isLength({ max: 500 }).withMessage('Les notes ne peuvent pas dépasser 500 caractères.')
];

const validateReview = [
  body('rating')
    .isInt({ min: 1, max: 5 }).withMessage('La note doit être un entier entre 1 et 5.'),
  body('comment')
    .optional()
    .isLength({ max: 300 }).withMessage('Le commentaire ne peut pas dépasser 300 caractères.')
];

// ─── ROUTES SUPER ADMIN ────────────────────────────────────────────────────────
// GET /api/reservations — Toutes les réservations
router.get(
  '/',
  authorize('super_admin'),
  reservationController.getAllReservations
);

// ─── ROUTES CLIENT ─────────────────────────────────────────────────────────────

// POST /api/reservations — Créer une réservation
router.post(
  '/',
  authorize('client'),
  validateCreateReservation,
  reservationController.createReservation
);

// GET /api/reservations/my — Mes réservations
router.get(
  '/my',
  authorize('client'),
  reservationController.getMyReservations
);

// ─── ROUTES EMPLOYEE / COMPANY / ADMIN ────────────────────────────────────────

// GET /api/reservations/qr/:qrCode — Vérifier un QR code
router.get(
  '/qr/:qrCode',
  authorize('employee', 'company', 'super_admin'),
  reservationController.verifyByQrCode
);

// GET /api/reservations/parking/:parkingId — Réservations d'un parking
router.get(
  '/parking/:parkingId',
  validateParkingId,
  authorize('employee', 'company', 'super_admin'),
  reservationController.getParkingReservations
);

// GET /api/reservations/parking/:parkingId/stats — Statistiques d'un parking
router.get(
  '/parking/:parkingId/stats',
  validateParkingId,
  authorize('company', 'super_admin'),
  reservationController.getParkingStats
);

// ─── ROUTES PAR ID (ordre important : placer avant /:id pour éviter conflits) ──

// GET /api/reservations/:id — Détail d'une réservation
router.get(
  '/:id',
  validateReservationId,
  authorize('client', 'employee', 'company', 'super_admin'),
  reservationController.getReservationById
);

// PUT /api/reservations/:id/confirm — Confirmer une réservation
// Accessible : client (sa propre résa) + employee + company + admin
router.put(
  '/:id/confirm',
  validateReservationId,
  authorize('client', 'employee', 'company', 'super_admin'),
  reservationController.confirmReservation
);

// PUT /api/reservations/:id/cancel — Annuler une réservation
router.put(
  '/:id/cancel',
  validateReservationId,
  authorize('client', 'employee', 'company', 'super_admin'),
  [body('reason').optional().isLength({ max: 300 }).withMessage('Raison trop longue.')],
  reservationController.cancelReservation
);

// PUT /api/reservations/:id/checkin — Check-in du client (employee/company/admin)
router.put(
  '/:id/checkin',
  validateReservationId,
  authorize('employee', 'company', 'super_admin'),
  [body('qrCode').optional().isString().withMessage('QR code invalide.')],
  reservationController.checkIn
);

// PUT /api/reservations/:id/checkout — Check-out du client (employee/company/admin)
router.put(
  '/:id/checkout',
  validateReservationId,
  authorize('employee', 'company', 'super_admin'),
  reservationController.checkOut
);

// PUT /api/reservations/:id/no-show — Marquer "no show" (employee/company/admin)
router.put(
  '/:id/no-show',
  validateReservationId,
  authorize('employee', 'company', 'super_admin'),
  reservationController.markNoShow
);

// POST /api/reservations/:id/review — Laisser un avis (client, après completed)
router.post(
  '/:id/review',
  validateReservationId,
  authorize('client'),
  validateReview,
  reservationController.leaveReview
);

module.exports = router;
