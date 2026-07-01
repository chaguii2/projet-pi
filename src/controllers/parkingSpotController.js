// src/controllers/parkingSpotController.js
const parkingSpotService = require('../services/ParkingSpotService');

const getSpotsByParking = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const filters = {
      zone: req.query.zone,
      type: req.query.type,
      status: req.query.status
    };
    
    const result = await parkingSpotService.getSpotsByParking(parkingId, filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getAvailableSpots = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const result = await parkingSpotService.getAvailableSpots(parkingId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getSpotStats = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const result = await parkingSpotService.getSpotStats(parkingId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const searchSpots = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const result = await parkingSpotService.searchSpots(parkingId, req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getSpotsInBounds = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const { north, south, east, west } = req.body;
    if (north === undefined || south === undefined || east === undefined || west === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres manquants',
        error: 'north, south, east, west sont requis'
      });
    }
    
    const result = await parkingSpotService.getSpotsInBounds(parkingId, { north, south, east, west });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getSpotById = async (req, res, next) => {
  try {
    const { spotId } = req.params;
    const result = await parkingSpotService.getSpotById(spotId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateSpotStatus = async (req, res, next) => {
  try {
    const { spotId } = req.params;
    const result = await parkingSpotService.updateSpotStatus(spotId, req.body, req.user);

    // Émettre une mise à jour en temps réel via WebSocket
    const io = req.app.get('io');
    if (io && result.data && result.data.parkingId) {
      const parkingId = result.data.parkingId.toString();
      io.to(`parking-${parkingId}`).emit('spots-update', {
        type: 'MANUAL_UPDATE',
        parkingId,
        changedSpots: [result.data],
        timestamp: new Date()
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const generateSpots = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const result = await parkingSpotService.generateSpots(parkingId, req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const startSimulation = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const { interval = 5000 } = req.body;
    const io = req.app.get('io');
    
    const result = parkingSpotService.startSimulation(parkingId, interval, io, req.user);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const stopSimulation = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const stopped = parkingSpotService.stopSimulation(parkingId, req.user);
    
    if (stopped) {
      res.status(200).json({
        success: true,
        message: 'Simulation arrêtée avec succès.',
        parkingId
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Aucune simulation active pour ce parking.',
        parkingId
      });
    }
  } catch (error) {
    next(error);
  }
};

const getSpotByNumber = async (req, res, next) => {
  try {
    const { parkingId, spotNumber } = req.params;
    const result = await parkingSpotService.getSpotByNumber(parkingId, spotNumber);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getParkingOrganization = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const result = await parkingSpotService.getSpotsByParking(parkingId);
    res.status(200).json({
      success: true,
      organization: result.organizedByLevel,
      stats: result.stats,
      message: 'Organisation du parking récupérée'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSpotsByParking,
  getAvailableSpots,
  getSpotStats,
  searchSpots,
  getSpotsInBounds,
  getSpotById,
  updateSpotStatus,
  generateSpots,
  startSimulation,
  stopSimulation,
  getSpotByNumber,
  getParkingOrganization
};
