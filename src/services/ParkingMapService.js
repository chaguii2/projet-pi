// src/services/ParkingMapService.js
const Parking = require('../models/Parking');
const { NotFoundError, BadRequestError } = require('../utils/errors');

class ParkingMapService {
  
  // Récupérer tous les parkings pour la carte
  async getParkingLocations() {
    try {
      const parkings = await Parking.find(
        { 
          isDeleted: { $ne: true }, 
          isBlocked: { $ne: true },
          status: 'approved',
          'location.coordinates': { $exists: true, $ne: null }
        },
        {
          name: 1,
          address: 1,
          city: 1,
          location: 1,
          availableSpots: 1,
          totalSpots: 1,
          pricePerHour: 1,
          status: 1,
          rating: 1,
          openingTime: 1,
          closingTime: 1,
          isOpen24h: 1
        }
      );
      
      const locations = parkings.map(parking => ({
        id: parking._id,
        name: parking.name,
        address: parking.address,
        city: parking.city,
        lat: parking.location.coordinates[1],
        lng: parking.location.coordinates[0],
        availableSpots: parking.availableSpots,
        totalSpots: parking.totalSpots,
        pricePerHour: parking.pricePerHour,
        status: parking.status,
        rating: parking.rating,
        openingTime: parking.openingTime,
        closingTime: parking.closingTime,
        isOpen24h: parking.isOpen24h
      }));
      
      return {
        success: true,
        data: locations,
        count: locations.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Récupérer les parkings à proximité (géolocalisation)
  async getNearbyParkings(lat, lng, radius = 5000) {
    try {
      if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
        throw new BadRequestError('Coordonnées lat et lng invalides.');
      }
      
      const parkings = await Parking.find({
        isDeleted: { $ne: true },
        isBlocked: { $ne: true },
        status: 'approved',
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      }).limit(50);
      
      const parkingsWithDistance = parkings.map(parking => {
        const distance = this.calculateDistance(
          parseFloat(lat), parseFloat(lng),
          parking.location.coordinates[1],
          parking.location.coordinates[0]
        );
        
        return {
          id: parking._id,
          name: parking.name,
          address: parking.address,
          city: parking.city,
          lat: parking.location.coordinates[1],
          lng: parking.location.coordinates[0],
          availableSpots: parking.availableSpots,
          totalSpots: parking.totalSpots,
          pricePerHour: parking.pricePerHour,
          status: parking.status,
          rating: parking.rating,
          distance: Math.round(distance),
          distanceText: distance < 1000 ? `${Math.round(distance)}m` : `${(distance/1000).toFixed(1)}km`
        };
      });
      
      parkingsWithDistance.sort((a, b) => a.distance - b.distance);
      
      return {
        success: true,
        data: parkingsWithDistance,
        count: parkingsWithDistance.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Récupérer un parking par ID
  async getParkingLocationById(id) {
    try {
      const parking = await Parking.findOne(
        { 
          _id: id, 
          isDeleted: { $ne: true },
          status: 'approved',
          'location.coordinates': { $exists: true, $ne: null }
        },
        {
          name: 1,
          address: 1,
          city: 1,
          location: 1,
          availableSpots: 1,
          totalSpots: 1,
          pricePerHour: 1,
          status: 1,
          rating: 1,
          openingTime: 1,
          closingTime: 1,
          isOpen24h: 1,
          contactPhone: 1,
          features: 1
        }
      );
      
      if (!parking) {
        throw new NotFoundError('Parking non trouvé ou non approuvé.');
      }
      
      const location = {
        id: parking._id,
        name: parking.name,
        address: parking.address,
        city: parking.city,
        lat: parking.location.coordinates[1],
        lng: parking.location.coordinates[0],
        availableSpots: parking.availableSpots,
        totalSpots: parking.totalSpots,
        pricePerHour: parking.pricePerHour,
        status: parking.status,
        rating: parking.rating,
        openingTime: parking.openingTime,
        closingTime: parking.closingTime,
        isOpen24h: parking.isOpen24h,
        contactPhone: parking.contactPhone,
        features: parking.features
      };
      
      return {
        success: true,
        data: location
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obtenir les parkings dans un rayon (bounding box)
  async getParkingsInBounds(bounds) {
    try {
      const { north, south, east, west } = bounds;
      
      if (!north || !south || !east || !west) {
        throw new BadRequestError('Limites géographiques invalides.');
      }
      
      const parkings = await Parking.find({
        isDeleted: { $ne: true },
        isBlocked: { $ne: true },
        status: 'approved',
        'location.coordinates': {
          $geoWithin: {
            $box: [
              [parseFloat(west), parseFloat(south)],
              [parseFloat(east), parseFloat(north)]
            ]
          }
        }
      }).limit(100);
      
      const locations = parkings.map(parking => ({
        id: parking._id,
        name: parking.name,
        address: parking.address,
        city: parking.city,
        lat: parking.location.coordinates[1],
        lng: parking.location.coordinates[0],
        availableSpots: parking.availableSpots,
        totalSpots: parking.totalSpots,
        pricePerHour: parking.pricePerHour,
        status: parking.status,
        rating: parking.rating
      }));
      
      return {
        success: true,
        data: locations,
        count: locations.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Vérifier si un parking est ouvert
  async isParkingOpen(id) {
    try {
      const parking = await Parking.findOne({
        _id: id,
        status: 'approved'
      });
      
      if (!parking) {
        throw new NotFoundError('Parking non trouvé ou non approuvé.');
      }
      
      let isOpen = false;
      
      if (parking.isOpen24h) {
        isOpen = true;
      } else if (parking.openingTime && parking.closingTime) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const [openHour, openMinute] = parking.openingTime.split(':').map(Number);
        const [closeHour, closeMinute] = parking.closingTime.split(':').map(Number);
        
        const openTime = openHour * 60 + openMinute;
        const closeTime = closeHour * 60 + closeMinute;
        
        isOpen = currentTime >= openTime && currentTime <= closeTime;
      }
      
      return {
        success: true,
        data: {
          id: parking._id,
          name: parking.name,
          isOpen,
          openingTime: parking.openingTime,
          closingTime: parking.closingTime,
          isOpen24h: parking.isOpen24h
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculer la distance entre deux points (formule Haversine)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2 - lat1) * Math.PI/180;
    const Δλ = (lon2 - lon1) * Math.PI/180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }

  // Statistiques de la carte
  async getMapStatistics() {
    try {
      const total = await Parking.countDocuments({ 
        isDeleted: { $ne: true },
        status: 'approved'
      });
      
      const active = await Parking.countDocuments({ 
        isDeleted: { $ne: true }, 
        isBlocked: { $ne: true }, 
        status: 'approved'
      });
      
      const withCoordinates = await Parking.countDocuments({ 
        isDeleted: { $ne: true },
        status: 'approved',
        'location.coordinates': { $exists: true, $ne: null } 
      });
      
      const cities = await Parking.distinct('city', { 
        isDeleted: { $ne: true },
        status: 'approved'
      });
      
      return {
        success: true,
        data: {
          totalParkings: total,
          activeParkings: active,
          parkingsWithLocation: withCoordinates,
          citiesCount: cities.length,
          cities
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new ParkingMapService();
