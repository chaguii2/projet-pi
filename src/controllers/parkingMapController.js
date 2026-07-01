// src/controllers/parkingMapController.js
const parkingMapService = require('../services/ParkingMapService');

const getParkingLocations = async (req, res, next) => {
  try {
    const result = await parkingMapService.getParkingLocations();
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getNearbyParkings = async (req, res, next) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres manquants',
        error: 'Les coordonnées lat et lng sont requises'
      });
    }
    
    const result = await parkingMapService.getNearbyParkings(lat, lng, radius);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getParkingLocationById = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const result = await parkingMapService.getParkingLocationById(parkingId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const isParkingOpen = async (req, res, next) => {
  try {
    const { parkingId } = req.params;
    const result = await parkingMapService.isParkingOpen(parkingId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getMapStatistics = async (req, res, next) => {
  try {
    const result = await parkingMapService.getMapStatistics();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getParkingsInBounds = async (req, res, next) => {
  try {
    const { north, south, east, west } = req.body;
    if (north === undefined || south === undefined || east === undefined || west === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Bounds invalides',
        error: 'Les paramètres north, south, east, west sont requis'
      });
    }
    
    const result = await parkingMapService.getParkingsInBounds({ north, south, east, west });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getParkingLocations,
  getNearbyParkings,
  getParkingLocationById,
  isParkingOpen,
  getMapStatistics,
  getParkingsInBounds
};
