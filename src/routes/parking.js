// src/routes/parking.js
const express = require('express');
const router = express.Router();
const { param } = require('express-validator');

const parkingMapController = require('../controllers/parkingMapController');
const parkingSpotController = require('../controllers/parkingSpotController');
const { protect, authorize } = require('../middleware/auth');

// ==================== VALIDATION HELPERS ====================
const validateParkingId = [
  param('parkingId').isMongoId().withMessage('ID de parking invalide.')
];

const validateSpotId = [
  param('spotId').isMongoId().withMessage('ID de place invalide.')
];

// ==================== ROUTES CARTE (PUBLIQUES) ====================

// Récupérer tous les parkings pour la carte
router.get('/map/parkings', parkingMapController.getParkingLocations);

// Récupérer les parkings à proximité
// GET /api/parking/map/parkings/nearby?lat=36.8065&lng=10.1815&radius=5000
router.get('/map/parkings/nearby', parkingMapController.getNearbyParkings);

// Récupérer un parking par ID
router.get('/map/parkings/:parkingId', validateParkingId, parkingMapController.getParkingLocationById);

// Vérifier si un parking est ouvert
router.get('/map/parkings/:parkingId/is-open', validateParkingId, parkingMapController.isParkingOpen);

// Statistiques globales de la carte
router.get('/map/statistics', parkingMapController.getMapStatistics);

// Parkings dans une bounding box
// POST /api/parking/map/parkings/bounds  Body: { north, south, east, west }
router.post('/map/parkings/bounds', parkingMapController.getParkingsInBounds);

// ==================== ROUTES PLACES (MIXTES) ====================

// Toutes les places d'un parking (public)
router.get('/:parkingId/spots', validateParkingId, parkingSpotController.getSpotsByParking);

// Places disponibles d'un parking (public)
router.get('/:parkingId/spots/available', validateParkingId, parkingSpotController.getAvailableSpots);

// Statistiques des places d'un parking (public)
router.get('/:parkingId/spots/stats', validateParkingId, parkingSpotController.getSpotStats);

// Rechercher des places avec filtres (public)
router.get('/:parkingId/spots/search', validateParkingId, parkingSpotController.searchSpots);

// Organisation visuelle du parking (public)
router.get('/:parkingId/spots/organization', validateParkingId, parkingSpotController.getParkingOrganization);

// Place par numéro (public)
router.get('/:parkingId/spots/number/:spotNumber', validateParkingId, parkingSpotController.getSpotByNumber);

// Places dans une bounding box (public)
router.post('/:parkingId/spots/bounds', validateParkingId, parkingSpotController.getSpotsInBounds);

// ==================== ROUTES PLACE SPÉCIFIQUE ====================

// Récupérer une place par son ID (public)
router.get('/spots/:spotId', validateSpotId, parkingSpotController.getSpotById);

// Mettre à jour le statut d'une place (employee, company, super_admin)
router.put(
  '/spots/:spotId/status',
  validateSpotId,
  protect,
  authorize('employee', 'company', 'super_admin'),
  parkingSpotController.updateSpotStatus
);

// ==================== ROUTES SIMULATION & GÉNÉRATION (SUPER_ADMIN) ====================

// Générer des places pour un parking
router.post(
  '/:parkingId/generate',
  validateParkingId,
  protect,
  authorize('super_admin'),
  parkingSpotController.generateSpots
);

// Démarrer la simulation temps réel
router.post(
  '/:parkingId/simulate/start',
  validateParkingId,
  protect,
  authorize('super_admin'),
  parkingSpotController.startSimulation
);

// Arrêter la simulation
router.post(
  '/:parkingId/simulate/stop',
  validateParkingId,
  protect,
  authorize('super_admin'),
  parkingSpotController.stopSimulation
);

module.exports = router;
