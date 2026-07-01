// src/services/ParkingSpotService.js
const ParkingSpot = require('../models/ParkingSpot');
const Parking = require('../models/Parking');
const UserRoles = require('../models/UserRoles');
const activityLogService = require('./ActivityLogService');
const { ForbiddenError, NotFoundError, UnauthorizedError, BadRequestError } = require('../utils/errors');

class ParkingSpotService {
  _requireAuth(currentUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Non authentifié.');
    }
  }

  _requireRoles(currentUser, ...allowedRoles) {
    this._requireAuth(currentUser);
    if (!allowedRoles.includes(currentUser.role)) {
      throw new ForbiddenError('Accès interdit.');
    }
  }

  // Helper pour vérifier le droit de gérer un spot spécifique
  async _verifySpotManagementAccess(parkingId, currentUser) {
    this._requireAuth(currentUser);
    
    if (currentUser.role === UserRoles.SUPER_ADMIN) {
      return true;
    }
    
    if (currentUser.role === UserRoles.COMPANY) {
      const parking = await Parking.findById(parkingId);
      if (!parking || parking.companyId.toString() !== currentUser.id) {
        throw new ForbiddenError('Accès interdit. Vous n\'êtes pas le propriétaire de ce parking.');
      }
      return true;
    }
    
    if (currentUser.role === UserRoles.EMPLOYEE) {
      if (!currentUser.parkingId || currentUser.parkingId.toString() !== parkingId.toString()) {
        throw new ForbiddenError('Accès interdit. Vous n\'êtes pas assigné à ce parking.');
      }
      return true;
    }
    
    throw new ForbiddenError('Accès interdit.');
  }

  // Récupérer toutes les places d'un parking
  async getSpotsByParking(parkingId, filters = {}) {
    // Include ALL spots (ACTIVE, MAINTENANCE, BLOCKED) so the employee can see every spot's real status
    let query = { parkingId };
    
    if (filters.zone) query.zone = filters.zone;
    if (filters.type) query.type = filters.type;
    if (filters.status === 'available') query.isAvailable = true;
    if (filters.status === 'occupied') query.isAvailable = false;
    if (filters.status === 'reserved') query.isReserved = true;
    
    const spots = await ParkingSpot.find(query).sort({ level: 1, zone: 1, row: 1, column: 1 });
    
    const organizedSpots = this.organizeSpotsByLevel(spots);
    const stats = this.calculateStats(spots);
    
    return {
      success: true,
      data: spots,
      organizedByLevel: organizedSpots,
      count: spots.length,
      stats
    };
  }

  organizeSpotsByLevel(spots) {
    const levels = {};
    
    spots.forEach(spot => {
      if (!levels[spot.level]) {
        levels[spot.level] = {
          level: spot.level,
          zones: {},
          totalSpots: 0,
          availableSpots: 0,
          occupiedSpots: 0,
          reservedSpots: 0
        };
      }
      
      if (!levels[spot.level].zones[spot.zone]) {
        levels[spot.level].zones[spot.zone] = {
          zone: spot.zone,
          rows: {},
          totalSpots: 0,
          availableSpots: 0,
          occupiedSpots: 0,
          reservedSpots: 0
        };
      }
      
      if (!levels[spot.level].zones[spot.zone].rows[spot.row]) {
        levels[spot.level].zones[spot.zone].rows[spot.row] = {
          row: spot.row,
          spots: []
        };
      }
      
      levels[spot.level].zones[spot.zone].rows[spot.row].spots.push(spot);
      levels[spot.level].totalSpots++;
      levels[spot.level].zones[spot.zone].totalSpots++;
      
      if (spot.isAvailable && !spot.isReserved) {
        levels[spot.level].availableSpots++;
        levels[spot.level].zones[spot.zone].availableSpots++;
      } else if (!spot.isAvailable && !spot.isReserved) {
        levels[spot.level].occupiedSpots++;
        levels[spot.level].zones[spot.zone].occupiedSpots++;
      } else if (spot.isReserved) {
        levels[spot.level].reservedSpots++;
        levels[spot.level].zones[spot.zone].reservedSpots++;
      }
    });
    
    return levels;
  }

  calculateStats(spots) {
    const stats = {
      total: spots.length,
      available: spots.filter(s => s.isAvailable && !s.isReserved).length,
      occupied: spots.filter(s => !s.isAvailable && !s.isReserved).length,
      reserved: spots.filter(s => s.isReserved).length,
      maintenance: spots.filter(s => s.status === 'MAINTENANCE').length,
      blocked: spots.filter(s => s.status === 'BLOCKED').length,
      byType: {},
      byZone: {},
      occupancyRate: 0
    };
    
    spots.forEach(spot => {
      if (!stats.byType[spot.type]) {
        stats.byType[spot.type] = { total: 0, available: 0, occupied: 0 };
      }
      stats.byType[spot.type].total++;
      if (spot.isAvailable && !spot.isReserved) {
        stats.byType[spot.type].available++;
      } else if (!spot.isAvailable && !spot.isReserved) {
        stats.byType[spot.type].occupied++;
      }
      
      if (!stats.byZone[spot.zone]) {
        stats.byZone[spot.zone] = { total: 0, available: 0, occupied: 0 };
      }
      stats.byZone[spot.zone].total++;
      if (spot.isAvailable && !spot.isReserved) {
        stats.byZone[spot.zone].available++;
      } else if (!spot.isAvailable && !spot.isReserved) {
        stats.byZone[spot.zone].occupied++;
      }
    });
    
    stats.occupancyRate = stats.total > 0 ? ((stats.occupied + stats.reserved) / stats.total * 100).toFixed(1) : 0;
    
    return stats;
  }

  // Récupérer uniquement les places disponibles
  async getAvailableSpots(parkingId) {
    const spots = await ParkingSpot.find({
      parkingId,
      isAvailable: true,
      isReserved: false,
      status: 'ACTIVE'
    }).select('spotNumber type zone row column level priceMultiplier');
    
    return {
      success: true,
      data: spots,
      count: spots.length
    };
  }

  // Obtenir les statistiques globales d'un parking
  async getSpotStats(parkingId) {
    const [
      total,
      available,
      reserved,
      maintenance,
      blocked
    ] = await Promise.all([
      ParkingSpot.countDocuments({ parkingId }),
      ParkingSpot.countDocuments({ parkingId, isAvailable: true, isReserved: false }),
      ParkingSpot.countDocuments({ parkingId, isReserved: true }),
      ParkingSpot.countDocuments({ parkingId, status: 'MAINTENANCE' }),
      ParkingSpot.countDocuments({ parkingId, status: 'BLOCKED' })
    ]);
    
    const occupied = total - available - reserved - maintenance - blocked;
    const occupancyRate = total > 0 ? ((occupied + reserved) / total * 100).toFixed(1) : 0;
    
    const byType = await this.getStatsByType(parkingId);
    
    // Occupation horaire simulée
    const hourlyOccupation = [];
    for (let i = 0; i < 24; i++) {
      let occ;
      if (i >= 8 && i <= 19) {
        occ = 70 + Math.random() * 20;
      } else if (i >= 20 && i <= 22) {
        occ = 40 + Math.random() * 30;
      } else {
        occ = 10 + Math.random() * 20;
      }
      hourlyOccupation.push({
        hour: i,
        occupation: Math.round(occ),
        label: `${i}:00`
      });
    }
    
    return {
      success: true,
      data: {
        total,
        available,
        occupied,
        reserved,
        maintenance,
        blocked,
        occupancyRate,
        byType,
        hourlyOccupation,
        trends: {
          lastHour: '+2%',
          lastDay: '-5%',
          peakHour: '14:00 (85%)',
          mostActiveZone: 'Zone A',
          leastActiveZone: 'Zone D'
        }
      }
    };
  }

  async getStatsByType(parkingId) {
    const types = ['STANDARD', 'HANDICAP', 'ELECTRIC', 'COMPACT', 'MOTORCYCLE', 'FAMILY', 'VIP'];
    const stats = {};
    
    for (const type of types) {
      const total = await ParkingSpot.countDocuments({ parkingId, type });
      const available = await ParkingSpot.countDocuments({ 
        parkingId, type, isAvailable: true, isReserved: false 
      });
      const reserved = await ParkingSpot.countDocuments({ 
        parkingId, type, isReserved: true 
      });
      
      stats[type] = { total, available, reserved, occupied: total - available - reserved };
    }
    
    return stats;
  }

  // Rechercher des places avec filtres
  async searchSpots(parkingId, filters) {
    const query = { parkingId };
    
    if (filters.zone) query.zone = filters.zone;
    if (filters.type) query.type = filters.type;
    if (filters.isAvailable !== undefined) query.isAvailable = filters.isAvailable === 'true';
    if (filters.isReserved !== undefined) query.isReserved = filters.isReserved === 'true';
    if (filters.spotNumber) query.spotNumber = new RegExp(filters.spotNumber, 'i');
    if (filters.level !== undefined) query.level = parseInt(filters.level);
    if (filters.status) query.status = filters.status;
    
    const spots = await ParkingSpot.find(query).sort({ level: 1, zone: 1, row: 1, column: 1 });
    
    return {
      success: true,
      data: spots,
      count: spots.length
    };
  }

  // Récupérer une place par son ID
  async getSpotById(spotId) {
    const spot = await ParkingSpot.findById(spotId).populate('parkingId', 'name address city phone email');
    if (!spot) {
      throw new NotFoundError('Place non trouvée.');
    }
    return {
      success: true,
      data: spot
    };
  }

  // Récupérer une place par son numéro
  async getSpotByNumber(parkingId, spotNumber) {
    const spot = await ParkingSpot.findOne({ parkingId, spotNumber }).populate('parkingId', 'name address city');
    if (!spot) {
      throw new NotFoundError(`Aucune place avec le numéro ${spotNumber}.`);
    }
    return {
      success: true,
      data: spot
    };
  }

  // Mettre à jour le statut d'une place (RBAC)
  async updateSpotStatus(spotId, updateData, currentUser) {
    const spot = await ParkingSpot.findById(spotId);
    if (!spot) {
      throw new NotFoundError('Place non trouvée.');
    }

    // Vérifier l'autorisation (Assigned Employee, Owner Company ou Super Admin)
    await this._verifySpotManagementAccess(spot.parkingId, currentUser);
    
    if (updateData.isAvailable !== undefined) spot.isAvailable = updateData.isAvailable;
    if (updateData.isReserved !== undefined) spot.isReserved = updateData.isReserved;
    if (updateData.status !== undefined) spot.status = updateData.status;
    
    if (!spot.isAvailable && !spot.isReserved && updateData.isAvailable !== undefined) {
      spot.totalReservations++;
      spot.lastReservedAt = new Date();
    } else if (spot.isAvailable && !spot.isReserved && updateData.isAvailable !== undefined) {
      spot.lastFreedAt = new Date();
    }
    
    if (updateData.reservation) {
      spot.currentReservation = {
        bookingId: updateData.reservation.bookingId,
        userId: updateData.reservation.userId,
        userName: updateData.reservation.userName,
        userEmail: updateData.reservation.userEmail,
        vehiclePlate: updateData.reservation.vehiclePlate,
        reservedUntil: updateData.reservation.reservedUntil,
        startTime: updateData.reservation.startTime,
        endTime: updateData.reservation.endTime
      };
    } else if (updateData.isReserved === false && !spot.isReserved) {
      if (spot.currentReservation && spot.currentReservation.bookingId) {
        spot.reservationsHistory.push({
          bookingId: spot.currentReservation.bookingId,
          userId: spot.currentReservation.userId,
          userName: spot.currentReservation.userName,
          userEmail: spot.currentReservation.userEmail,
          vehiclePlate: spot.currentReservation.vehiclePlate,
          startTime: spot.currentReservation.startTime,
          endTime: spot.currentReservation.endTime,
          status: 'COMPLETED'
        });
        spot.currentReservation = undefined;
      }
    }
    
    await spot.save();

    // Log the action if changed by employee/agent
    if (currentUser && currentUser.role === UserRoles.EMPLOYEE) {
      let stateDesc = 'actif';
      if (spot.status === 'MAINTENANCE') stateDesc = 'hors service (maintenance)';
      else if (spot.status === 'BLOCKED') stateDesc = 'bloqué';
      else if (spot.isReserved) stateDesc = 'réservé';
      else if (!spot.isAvailable) stateDesc = 'occupé';

      await activityLogService.log(
        currentUser.id,
        spot.parkingId,
        'SPOT_STATUS_CHANGE',
        `Changement de statut de la place ${spot.spotNumber} à "${stateDesc}"`
      );
    }

    // Mettre à jour availableSpots
    const count = await ParkingSpot.countDocuments({ parkingId: spot.parkingId, isAvailable: true, status: 'ACTIVE' });
    await Parking.findByIdAndUpdate(spot.parkingId, { availableSpots: count });
    
    return {
      success: true,
      data: spot,
      message: 'Statut mis à jour avec succès.'
    };
  }

  // Générer des places pour un parking (RBAC)
  async generateSpots(parkingId, config, currentUser) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN);
    
    const { rows = 5, columns = 10, levels = 1, zones = ['A', 'B', 'C', 'D'] } = config;
    
    const parking = await Parking.findById(parkingId);
    if (!parking) {
      throw new NotFoundError('Parking non trouvé.');
    }
    
    // Supprimer les anciennes places
    await ParkingSpot.deleteMany({ parkingId });
    
    const spots = [];
    
    for (let level = 0; level < levels; level++) {
      for (const zone of zones) {
        for (let row = 1; row <= rows; row++) {
          for (let col = 1; col <= columns; col++) {
            const spotNumber = `${zone}${row}${col.toString().padStart(2, '0')}`;
            
            let type = 'STANDARD';
            if (row === 1 && col <= 2) type = 'HANDICAP';
            else if (col % 5 === 0) type = 'ELECTRIC';
            else if (col % 7 === 0) type = 'FAMILY';
            else if (col % 3 === 0) type = 'COMPACT';
            
            let status = 'ACTIVE';
            let isAvailable = true;
            let isReserved = false;
            
            if (col === 1 && row === 1 && level === 0) {
              status = 'MAINTENANCE';
              isAvailable = false;
            } else if (spotNumber === 'B205') {
              isReserved = true;
              isAvailable = false;
            } else if (spotNumber === 'C312') {
              isAvailable = false;
            }
            
            spots.push({
              parkingId,
              spotNumber,
              row,
              column: col,
              level,
              zone,
              type,
              priceMultiplier: type === 'VIP' ? 1.5 : type === 'HANDICAP' ? 0.8 : 1.0,
              isAvailable,
              isReserved,
              status
            });
          }
        }
      }
    }
    
    await ParkingSpot.insertMany(spots);
    
    // Mettre à jour Parking's totalSpots et availableSpots
    const count = await ParkingSpot.countDocuments({ parkingId, isAvailable: true, status: 'ACTIVE' });
    const total = await ParkingSpot.countDocuments({ parkingId });
    await Parking.findByIdAndUpdate(parkingId, { totalSpots: total, availableSpots: count });
    
    return {
      success: true,
      message: `${spots.length} places générées avec succès.`,
      count: spots.length,
      config: { rows, columns, levels, zones }
    };
  }

  // Démarrer la simulation temps réel (RBAC)
  startSimulation(parkingId, interval = 5000, io, currentUser) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN);
    
    this.stopSimulation(parkingId, currentUser);
    
    const simulationInterval = setInterval(async () => {
      try {
        const spots = await ParkingSpot.find({ 
          parkingId, 
          status: 'ACTIVE',
          isReserved: false 
        });
        
        if (spots.length === 0) return;

        const changeCount = Math.max(1, Math.floor(spots.length * (Math.random() * 0.1 + 0.05)));
        const shuffled = spots.sort(() => 0.5 - Math.random());
        const spotsToChange = shuffled.slice(0, changeCount);
        
        const changedSpots = [];
        
        for (const spot of spotsToChange) {
          if (spot.isAvailable) {
            spot.isAvailable = false;
            spot.lastReservedAt = new Date();
            spot.totalReservations++;
          } else {
            spot.isAvailable = true;
            spot.lastFreedAt = new Date();
          }
          await spot.save();
          changedSpots.push(spot);
        }

        // Mettre à jour availableSpots
        const count = await ParkingSpot.countDocuments({ parkingId, isAvailable: true, status: 'ACTIVE' });
        await Parking.findByIdAndUpdate(parkingId, { availableSpots: count });
        
        // Émettre via WebSocket
        if (io) {
          const allSpots = await ParkingSpot.find({ parkingId });
          const stats = await this.getSpotStats(parkingId);
          io.to(`parking-${parkingId}`).emit('spots-update', {
            type: 'SIMULATION_UPDATE',
            parkingId,
            spots: allSpots,
            changedSpots,
            timestamp: new Date(),
            stats: stats.data
          });
        }
      } catch (error) {
        console.error('❌ Simulation execution error:', error);
      }
    }, interval);
    
    if (!global.simulations) global.simulations = {};
    global.simulations[parkingId] = simulationInterval;
    
    return {
      success: true,
      message: 'Simulation démarrée.',
      interval,
      parkingId
    };
  }

  // Arrêter la simulation (RBAC)
  stopSimulation(parkingId, currentUser) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN);
    
    if (global.simulations && global.simulations[parkingId]) {
      clearInterval(global.simulations[parkingId]);
      delete global.simulations[parkingId];
      return true;
    }
    return false;
  }

  // Obtenir les places dans une bounding box
  async getSpotsInBounds(parkingId, bounds) {
    const { north, south, east, west } = bounds;
    
    // Cette route requiert des coordonnées GPS de place dans un scénario étendu.
    // Par défaut, retourne les spots filtrés pour le parkingId.
    const spots = await ParkingSpot.find({ parkingId }).limit(100);
    
    return {
      success: true,
      data: spots,
      count: spots.length
    };
  }
}

module.exports = new ParkingSpotService();
