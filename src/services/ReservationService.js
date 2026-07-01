// src/services/ReservationService.js
const Reservation = require('../models/Reservation');
const ParkingSpot = require('../models/ParkingSpot');
const Parking = require('../models/Parking');
const User = require('../models/User');
const UserRoles = require('../models/UserRoles');
const activityLogService = require('./ActivityLogService');
const { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError } = require('../utils/errors');

// Délai avant auto-expiration d'une réservation "pending" (en minutes)
const PENDING_EXPIRY_MINUTES = 15;

class ReservationService {
  // ─── Guards ───────────────────────────────────────────────────────────────────

  _requireAuth(user) {
    if (!user) throw new UnauthorizedError('Authentification requise.');
  }

  _requireRoles(user, ...roles) {
    this._requireAuth(user);
    if (!roles.includes(user.role)) {
      throw new ForbiddenError('Accès refusé. Rôle insuffisant.');
    }
  }

  // ─── Vérifier accès à un parking (propriétaire ou super_admin) ────────────────

  async _verifyParkingAccess(parkingId, user) {
    this._requireAuth(user);
    if (user.role === UserRoles.SUPER_ADMIN) return;

    const parking = await Parking.findById(parkingId);
    if (!parking) throw new NotFoundError('Parking non trouvé.');

    if (user.role === UserRoles.COMPANY) {
      if (parking.companyId.toString() !== user._id.toString()) {
        throw new ForbiddenError('Ce parking ne vous appartient pas.');
      }
      return;
    }

    if (user.role === UserRoles.EMPLOYEE) {
      if (!user.parkingId || user.parkingId.toString() !== parkingId.toString()) {
        throw new ForbiddenError('Vous n\'êtes pas assigné à ce parking.');
      }
      return;
    }

    throw new ForbiddenError('Accès refusé.');
  }

  // ─── Mettre à jour le compteur de places disponibles ─────────────────────────

  async _syncAvailableSpots(parkingId) {
    const count = await ParkingSpot.countDocuments({
      parkingId,
      isAvailable: true,
      isReserved: false,
      status: 'ACTIVE'
    });
    await Parking.findByIdAndUpdate(parkingId, { availableSpots: count });
  }

  // ─── 1. Créer une réservation ──────────────────────────────────────────────────

  async createReservation(data, currentUser) {
    this._requireRoles(currentUser, UserRoles.CLIENT);

    const {
      parkingId,
      spotId,       // optionnel : si null → attribution automatique
      vehiclePlate,
      vehicleType = 'car',
      startTime,
      endTime,
      paymentMethod = 'cash',
      notes
    } = data;

    // ── Validation des dates ────────────────────────────────────────────────────
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestError('Dates invalides.');
    }
    if (start >= end) {
      throw new BadRequestError('La date de fin doit être après la date de début.');
    }
    const now = new Date();
    if (start < now) {
      throw new BadRequestError('Impossible de réserver dans le passé.');
    }
    const durationHours = parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
    if (durationHours < 0.5) {
      throw new BadRequestError('La durée minimale de réservation est de 30 minutes.');
    }
    if (durationHours > 720) { // 30 jours max
      throw new BadRequestError('La durée maximale de réservation est de 30 jours.');
    }

    // ── Vérifier le parking ─────────────────────────────────────────────────────
    const parking = await Parking.findById(parkingId);
    if (!parking) throw new NotFoundError('Parking non trouvé.');
    if (parking.status !== 'approved') {
      throw new BadRequestError('Ce parking n\'est pas disponible pour les réservations.');
    }
    if (parking.isBlocked || parking.isDeleted) {
      throw new BadRequestError('Ce parking est temporairement indisponible.');
    }

    // ── Vérifier les horaires du parking ───────────────────────────────────────
    if (!parking.isOpen24h) {
      const openH = parseInt(parking.openingTime.split(':')[0]);
      const closeH = parseInt(parking.closingTime.split(':')[0]);
      const startH = start.getHours();
      const endH = end.getHours();
      if (startH < openH || endH > closeH) {
        throw new BadRequestError(
          `Ce parking est ouvert de ${parking.openingTime} à ${parking.closingTime}.`
        );
      }
    }

    // ── Déterminer et verrouiller atomiquement la place ──────────────────────────
    let spot;
    if (spotId) {
      // Verrouillage atomique : marquer isReserved=true uniquement si encore disponible
      spot = await ParkingSpot.findOneAndUpdate(
        { _id: spotId, parkingId, isAvailable: true, isReserved: false, status: 'ACTIVE' },
        { $set: { isReserved: true } },
        { new: true }
      );
      if (!spot) {
        // Vérifier si la place existe mais est indisponible
        const exists = await ParkingSpot.findById(spotId);
        if (!exists) throw new NotFoundError('Place de parking non trouvée.');
        if (exists.parkingId.toString() !== parkingId.toString())
          throw new BadRequestError('Cette place n\'appartient pas à ce parking.');
        throw new BadRequestError('Cette place n\'est plus disponible (déjà réservée par un autre client).');
      }
    } else {
      // Attribution automatique selon le type de véhicule — verrouillage atomique
      const spotTypeMap = {
        motorcycle: 'MOTORCYCLE',
        electric: 'ELECTRIC',
        handicap: 'HANDICAP',
        car: 'STANDARD'
      };
      const preferredType = spotTypeMap[vehicleType] || 'STANDARD';

      // Essayer le type préféré, sinon STANDARD — atomique pour éviter la race condition
      spot = await ParkingSpot.findOneAndUpdate(
        { parkingId, type: preferredType, isAvailable: true, isReserved: false, status: 'ACTIVE' },
        { $set: { isReserved: true } },
        { new: true, sort: { zone: 1, row: 1, column: 1 } }
      );

      if (!spot && preferredType !== 'STANDARD') {
        spot = await ParkingSpot.findOneAndUpdate(
          { parkingId, type: 'STANDARD', isAvailable: true, isReserved: false, status: 'ACTIVE' },
          { $set: { isReserved: true } },
          { new: true, sort: { zone: 1, row: 1, column: 1 } }
        );
      }

      if (!spot) {
        throw new BadRequestError('Aucune place disponible dans ce parking pour le moment.');
      }
    }

    // ── Vérifier qu'il n'y a pas de conflit de créneau pour cette place ────────
    const conflict = await Reservation.findOne({
      spotId: spot._id,
      status: { $in: ['pending', 'confirmed', 'active'] },
      $or: [
        { startTime: { $lt: end, $gte: start } },
        { endTime: { $gt: start, $lte: end } },
        { startTime: { $lte: start }, endTime: { $gte: end } }
      ]
    });
    if (conflict) {
      throw new BadRequestError('Cette place est déjà réservée pour ce créneau horaire.');
    }

    // ── Calculer le prix ───────────────────────────────────────────────────────
    const totalPrice = parseFloat(
      (durationHours * parking.pricePerHour * spot.priceMultiplier).toFixed(2)
    );

    // ── Créer la réservation ───────────────────────────────────────────────────
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + PENDING_EXPIRY_MINUTES);

    const reservation = new Reservation({
      clientId: currentUser._id,
      parkingId,
      spotId: spot._id,
      spotNumber: spot.spotNumber,
      clientName: currentUser.name,
      clientEmail: currentUser.email,
      clientPhone: currentUser.phone || null,
      vehiclePlate: vehiclePlate.toUpperCase(),
      vehicleType,
      startTime: start,
      endTime: end,
      durationHours,
      pricePerHour: parking.pricePerHour,
      priceMultiplier: spot.priceMultiplier,
      totalPrice,
      paymentMethod,
      autoConfirmExpiry: expiry,
      notes: notes || null
    });

    await reservation.save();

    // ── Finaliser le marquage de la place (isReserved déjà posé atomiquement) ──
    // isReserved=true a été posé atomiquement lors de la sélection de la place
    spot.isAvailable = false;
    spot.currentReservation = {
      bookingId: reservation._id.toString(),
      userId: currentUser._id,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userPhone: currentUser.phone || null,
      vehiclePlate: vehiclePlate.toUpperCase(),
      reservedUntil: end,
      startTime: start,
      endTime: end
    };
    spot.totalReservations += 1;
    spot.lastReservedAt = new Date();
    await spot.save();

    // ── Mettre à jour les métriques utilisateur ────────────────────────────────
    await User.findByIdAndUpdate(currentUser._id, {
      $inc: { totalReservations: 1 }
    });

    // ── Synchroniser availableSpots ────────────────────────────────────────────
    await this._syncAvailableSpots(parkingId);

    return {
      success: true,
      message: `Réservation créée avec succès. Elle expire dans ${PENDING_EXPIRY_MINUTES} minutes si non confirmée.`,
      data: await Reservation.findById(reservation._id)
        .populate('parkingId', 'name address city pricePerHour')
        .populate('spotId', 'spotNumber zone type level row column')
    };
  }

  // ─── 2. Récupérer mes réservations (client) ────────────────────────────────────

  async getMyReservations(currentUser, filters = {}) {
    this._requireRoles(currentUser, UserRoles.CLIENT);

    // Auto-marquer les expirations avant de répondre
    await this._expirePendingReservations();

    const query = { clientId: currentUser._id };
    if (filters.status) query.status = filters.status;

    const page = parseInt(filters.page) || 1;
    const limit = Math.min(parseInt(filters.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      Reservation.find(query)
        .populate('parkingId', 'name address city contactPhone')
        .populate('spotId', 'spotNumber zone type level')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Reservation.countDocuments(query)
    ]);

    return {
      success: true,
      data: reservations,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ─── 3. Récupérer une réservation par ID ─────────────────────────────────────

  async getReservationById(reservationId, currentUser) {
    this._requireAuth(currentUser);

    const reservation = await Reservation.findById(reservationId)
      .populate('parkingId', 'name address city pricePerHour contactPhone contactEmail')
      .populate('spotId', 'spotNumber zone type level row column')
      .populate('clientId', 'name email phone vehiclePlate');

    if (!reservation) throw new NotFoundError('Réservation non trouvée.');

    // Contrôle d'accès
    if (currentUser.role === UserRoles.CLIENT) {
      if (reservation.clientId._id.toString() !== currentUser._id.toString()) {
        throw new ForbiddenError('Cette réservation ne vous appartient pas.');
      }
    } else if (currentUser.role === UserRoles.COMPANY || currentUser.role === UserRoles.EMPLOYEE) {
      await this._verifyParkingAccess(reservation.parkingId._id, currentUser);
    }
    // super_admin → accès total

    return { success: true, data: reservation };
  }

  // ─── 4. Confirmer une réservation (client, employee, company, admin) ──────────

  async confirmReservation(reservationId, currentUser) {
    this._requireAuth(currentUser);

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) throw new NotFoundError('Réservation non trouvée.');

    // Contrôle d'accès
    if (currentUser.role === UserRoles.CLIENT) {
      if (reservation.clientId.toString() !== currentUser._id.toString()) {
        throw new ForbiddenError('Cette réservation ne vous appartient pas.');
      }
    } else if ([UserRoles.COMPANY, UserRoles.EMPLOYEE].includes(currentUser.role)) {
      await this._verifyParkingAccess(reservation.parkingId, currentUser);
    }

    if (reservation.status !== 'pending') {
      throw new BadRequestError(`Impossible de confirmer une réservation en statut "${reservation.status}".`);
    }

    reservation.status = 'confirmed';
    reservation.confirmedAt = new Date();
    reservation.autoConfirmExpiry = null;
    reservation.paymentStatus = 'paid';
    reservation.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    await reservation.save();

    return {
      success: true,
      message: 'Réservation confirmée avec succès.',
      data: reservation
    };
  }

  // ─── 5. Annuler une réservation ────────────────────────────────────────────────

  async cancelReservation(reservationId, currentUser, reason = null) {
    this._requireAuth(currentUser);

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) throw new NotFoundError('Réservation non trouvée.');

    // Contrôle d'accès
    let cancelledByRole = 'system';
    if (currentUser.role === UserRoles.CLIENT) {
      if (reservation.clientId.toString() !== currentUser._id.toString()) {
        throw new ForbiddenError('Cette réservation ne vous appartient pas.');
      }
      cancelledByRole = 'client';
    } else if (currentUser.role === UserRoles.COMPANY || currentUser.role === UserRoles.EMPLOYEE) {
      await this._verifyParkingAccess(reservation.parkingId, currentUser);
      cancelledByRole = 'company';
    } else if (currentUser.role === UserRoles.SUPER_ADMIN) {
      cancelledByRole = 'admin';
    }

    if (!['pending', 'confirmed'].includes(reservation.status)) {
      throw new BadRequestError(
        `Impossible d'annuler une réservation en statut "${reservation.status}".`
      );
    }

    reservation.status = 'cancelled';
    reservation.cancelledAt = new Date();
    reservation.cancelReason = reason || 'Annulée par l\'utilisateur';
    reservation.cancelledBy = cancelledByRole;

    await reservation.save();

    // Libérer la place
    await this._freeSpot(reservation);
    await this._syncAvailableSpots(reservation.parkingId);

    return {
      success: true,
      message: 'Réservation annulée avec succès.',
      data: reservation
    };
  }

  // ─── 6. Check-in (arrivée du client) ──────────────────────────────────────────

  async checkIn(reservationId, currentUser, qrCode = null, io = null) {
    this._requireRoles(currentUser, UserRoles.EMPLOYEE, UserRoles.COMPANY, UserRoles.SUPER_ADMIN);

    // Recherche par ID ou par QR code
    let reservation;
    if (qrCode) {
      reservation = await Reservation.findOne({ qrCode });
    } else {
      reservation = await Reservation.findById(reservationId);
    }

    if (!reservation) throw new NotFoundError('Réservation non trouvée.');

    // Vérifier l'accès au parking
    if (currentUser.role !== UserRoles.SUPER_ADMIN) {
      await this._verifyParkingAccess(reservation.parkingId, currentUser);
    }

    if (reservation.status !== 'confirmed') {
      throw new BadRequestError(
        `Impossible de faire le check-in : statut actuel "${reservation.status}". La réservation doit être confirmée.`
      );
    }

    const now = new Date();
    if (now > reservation.endTime) {
      throw new BadRequestError('Cette réservation est expirée. Le client ne peut plus se présenter.');
    }

    reservation.status = 'active';
    reservation.checkedInAt = now;
    await reservation.save();

    // Enregistrer le log d'activité
    await activityLogService.log(
      currentUser.id,
      reservation.parkingId,
      'CHECK_IN',
      `Véhicule enregistré (Plaque: ${reservation.vehiclePlate}, Place: ${reservation.spotNumber})`
    );

    // ── Mettre à jour la place : client physiquement présent → occupée ─────────
    const spot = await ParkingSpot.findById(reservation.spotId);
    if (spot) {
      spot.isReserved = false;   // n'est plus en attente, il est là
      spot.isAvailable = false;  // mais pas disponible car occupé
      await spot.save();

      // Émettre la mise à jour en temps réel
      if (io) {
        io.to(`parking-${reservation.parkingId.toString()}`).emit('spots-update', {
          type: 'CHECKIN',
          parkingId: reservation.parkingId.toString(),
          changedSpots: [spot],
          reservationId: reservation._id,
          timestamp: new Date()
        });
      }
    }

    await this._syncAvailableSpots(reservation.parkingId);

    return {
      success: true,
      message: `Check-in effectué. Bienvenue, ${reservation.clientName} ! Place : ${reservation.spotNumber}.`,
      data: reservation
    };
  }

  // ─── 7. Check-out (départ du client) ──────────────────────────────────────────

  async checkOut(reservationId, currentUser, io = null) {
    this._requireRoles(currentUser, UserRoles.EMPLOYEE, UserRoles.COMPANY, UserRoles.SUPER_ADMIN);

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) throw new NotFoundError('Réservation non trouvée.');

    if (currentUser.role !== UserRoles.SUPER_ADMIN) {
      await this._verifyParkingAccess(reservation.parkingId, currentUser);
    }

    if (reservation.status !== 'active') {
      throw new BadRequestError(
        `Impossible de faire le check-out : statut actuel "${reservation.status}".`
      );
    }

    const now = new Date();
    const actualHours = parseFloat(
      ((now - reservation.checkedInAt) / (1000 * 60 * 60)).toFixed(2)
    );
    // Si départ anticipé, recalculer le prix (pas de remboursement si départ tardif)
    const billedHours = Math.min(actualHours, reservation.durationHours);
    const finalPrice = parseFloat(
      (billedHours * reservation.pricePerHour * reservation.priceMultiplier).toFixed(2)
    );

    reservation.status = 'completed';
    reservation.checkedOutAt = now;
    if (actualHours < reservation.durationHours) {
      reservation.totalPrice = finalPrice;
    }
    await reservation.save();

    // Enregistrer le log d'activité
    await activityLogService.log(
      currentUser.id,
      reservation.parkingId,
      'CHECK_OUT',
      `Départ véhicule (Plaque: ${reservation.vehiclePlate}, Place: ${reservation.spotNumber}, Montant: ${reservation.totalPrice} DT)`
    );

    // Libérer la place et émettre en temps réel
    const freedSpot = await this._freeSpot(reservation);
    await this._syncAvailableSpots(reservation.parkingId);

    if (io && freedSpot) {
      io.to(`parking-${reservation.parkingId.toString()}`).emit('spots-update', {
        type: 'CHECKOUT',
        parkingId: reservation.parkingId.toString(),
        changedSpots: [freedSpot],
        reservationId: reservation._id,
        timestamp: new Date()
      });
    }

    // Mettre à jour les dépenses du client
    await User.findByIdAndUpdate(reservation.clientId, {
      $inc: { totalSpent: reservation.totalPrice }
    });

    return {
      success: true,
      message: `Check-out effectué. Durée réelle : ${actualHours}h. Montant facturé : ${reservation.totalPrice} DT.`,
      data: reservation
    };
  }

  // ─── 8. Marquer "no_show" ──────────────────────────────────────────────────────

  async markNoShow(reservationId, currentUser, io = null) {
    this._requireRoles(currentUser, UserRoles.EMPLOYEE, UserRoles.COMPANY, UserRoles.SUPER_ADMIN);

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) throw new NotFoundError('Réservation non trouvée.');

    if (currentUser.role !== UserRoles.SUPER_ADMIN) {
      await this._verifyParkingAccess(reservation.parkingId, currentUser);
    }

    if (!['pending', 'confirmed'].includes(reservation.status)) {
      throw new BadRequestError(`Impossible de marquer "no_show" : statut actuel "${reservation.status}".`);
    }

    reservation.status = 'no_show';
    reservation.cancelledAt = new Date();
    await reservation.save();

    // Enregistrer le log d'activité
    await activityLogService.log(
      currentUser.id,
      reservation.parkingId,
      'SPOT_STATUS_CHANGE',
      `Réservation marquée No-Show (Place: ${reservation.spotNumber}, Client: ${reservation.clientName})`
    );

    const freedSpot = await this._freeSpot(reservation);
    await this._syncAvailableSpots(reservation.parkingId);

    if (io && freedSpot) {
      io.to(`parking-${reservation.parkingId.toString()}`).emit('spots-update', {
        type: 'SPOT_FREED',
        spotId: reservation.spotId,
        parkingId: reservation.parkingId.toString(),
        changedSpots: [freedSpot],
        timestamp: new Date()
      });
    }

    return {
      success: true,
      message: 'Réservation marquée "no_show".',
      data: reservation
    };
  }

  // ─── 9. Laisser un avis (client, après completed) ─────────────────────────────

  async leaveReview(reservationId, currentUser, rating, comment = null) {
    this._requireRoles(currentUser, UserRoles.CLIENT);

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) throw new NotFoundError('Réservation non trouvée.');

    if (reservation.clientId.toString() !== currentUser._id.toString()) {
      throw new ForbiddenError('Cette réservation ne vous appartient pas.');
    }

    if (reservation.status !== 'completed') {
      throw new BadRequestError('Vous ne pouvez laisser un avis qu\'après la fin de votre séjour.');
    }

    if (reservation.rating) {
      throw new BadRequestError('Vous avez déjà évalué cette réservation.');
    }

    if (!rating || rating < 1 || rating > 5) {
      throw new BadRequestError('La note doit être comprise entre 1 et 5.');
    }

    reservation.rating = rating;
    reservation.reviewComment = comment || null;
    await reservation.save();

    // Recalculer la note moyenne du parking
    const [result] = await Reservation.aggregate([
      { $match: { parkingId: reservation.parkingId, rating: { $ne: null } } },
      { $group: { _id: '$parkingId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    if (result) {
      await Parking.findByIdAndUpdate(reservation.parkingId, {
        rating: parseFloat(result.avgRating.toFixed(1)),
        totalReviews: result.count
      });
    }

    return {
      success: true,
      message: 'Merci pour votre avis !',
      data: reservation
    };
  }

  // ─── 10. Liste des réservations d'un parking (company/employee/admin) ──────────

  async getParkingReservations(parkingId, currentUser, filters = {}) {
    this._requireAuth(currentUser);

    if (currentUser.role !== UserRoles.SUPER_ADMIN) {
      await this._verifyParkingAccess(parkingId, currentUser);
    }

    const query = { parkingId };
    if (filters.status) query.status = filters.status;
    if (filters.date) {
      const date = new Date(filters.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      query.startTime = { $gte: date, $lt: nextDay };
    }

    const page = parseInt(filters.page) || 1;
    const limit = Math.min(parseInt(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      Reservation.find(query)
        .populate('clientId', 'name email phone')
        .populate('spotId', 'spotNumber zone type level')
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(limit),
      Reservation.countDocuments(query)
    ]);

    // Statistiques rapides
    const stats = await Reservation.aggregate([
      { $match: { parkingId: require('mongoose').Types.ObjectId.createFromHexString(parkingId) } },
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } }
    ]);

    return {
      success: true,
      data: reservations,
      stats,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
  }

  // ─── 11. Toutes les réservations (super_admin) ────────────────────────────────

  async getAllReservations(currentUser, filters = {}) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN);

    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.parkingId) query.parkingId = filters.parkingId;
    if (filters.clientId) query.clientId = filters.clientId;

    const page = parseInt(filters.page) || 1;
    const limit = Math.min(parseInt(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      Reservation.find(query)
        .populate('clientId', 'name email phone')
        .populate('parkingId', 'name address city')
        .populate('spotId', 'spotNumber zone type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Reservation.countDocuments(query)
    ]);

    return {
      success: true,
      data: reservations,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
  }

  // ─── 12. Vérifier une réservation par QR code (employee/company/admin) ─────────

  async verifyByQrCode(qrCode, currentUser) {
    this._requireRoles(currentUser, UserRoles.EMPLOYEE, UserRoles.COMPANY, UserRoles.SUPER_ADMIN);

    const reservation = await Reservation.findOne({ qrCode })
      .populate('clientId', 'name email phone')
      .populate('parkingId', 'name address')
      .populate('spotId', 'spotNumber zone type');

    if (!reservation) throw new NotFoundError('QR code invalide ou réservation introuvable.');

    if (currentUser.role !== UserRoles.SUPER_ADMIN) {
      await this._verifyParkingAccess(reservation.parkingId._id, currentUser);
    }

    return {
      success: true,
      valid: ['confirmed', 'active'].includes(reservation.status),
      data: reservation
    };
  }

  // ─── 13. Statistiques dashboard d'un parking (company/admin) ─────────────────

  async getParkingStats(parkingId, currentUser) {
    this._requireAuth(currentUser);

    if (currentUser.role !== UserRoles.SUPER_ADMIN) {
      await this._verifyParkingAccess(parkingId, currentUser);
    }

    const mongoose = require('mongoose');
    const pid = mongoose.Types.ObjectId.createFromHexString(parkingId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [overall, todayStats, revenueByDay, ratingAvg] = await Promise.all([
      // Stats globales par statut
      Reservation.aggregate([
        { $match: { parkingId: pid } },
        { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } }
      ]),
      // Réservations du jour
      Reservation.aggregate([
        { $match: { parkingId: pid, createdAt: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } }
      ]),
      // Revenus des 7 derniers jours
      Reservation.aggregate([
        {
          $match: {
            parkingId: pid,
            status: 'completed',
            checkedOutAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkedOutAt' } },
            revenue: { $sum: '$totalPrice' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Note moyenne
      Reservation.aggregate([
        { $match: { parkingId: pid, rating: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ])
    ]);

    return {
      success: true,
      data: {
        overall,
        today: todayStats[0] || { count: 0, revenue: 0 },
        revenueByDay,
        rating: ratingAvg[0] || { avg: 0, count: 0 }
      }
    };
  }

  // ─── Méthodes utilitaires internes ────────────────────────────────────────────

  // Libérer une place après annulation/fin de réservation — retourne le spot mis à jour
  async _freeSpot(reservation) {
    const spot = await ParkingSpot.findById(reservation.spotId);
    if (!spot) return null;

    // Archiver dans l'historique
    if (spot.currentReservation && spot.currentReservation.bookingId === reservation._id.toString()) {
      spot.reservationsHistory.push({
        bookingId: reservation._id.toString(),
        userId: reservation.clientId,
        userName: reservation.clientName,
        userEmail: reservation.clientEmail,
        vehiclePlate: reservation.vehiclePlate,
        startTime: reservation.startTime,
        endTime: reservation.checkedOutAt || reservation.endTime,
        status: reservation.status
      });
      spot.currentReservation = {
        bookingId: null,
        userId: null,
        userName: null,
        userEmail: null,
        userPhone: null,
        vehiclePlate: null,
        reservedUntil: null,
        startTime: null,
        endTime: null
      };
    }

    spot.isReserved = false;
    spot.isAvailable = true;
    spot.lastFreedAt = new Date();
    await spot.save();
    return spot; // retourner pour WebSocket emit
  }

  // Auto-expiration des réservations "pending" dépassées
  async _expirePendingReservations() {
    const now = new Date();
    const expired = await Reservation.find({
      status: 'pending',
      autoConfirmExpiry: { $lt: now }
    });

    for (const reservation of expired) {
      reservation.status = 'expired';
      reservation.cancelledAt = now;
      reservation.cancelledBy = 'system';
      reservation.cancelReason = 'Expiration automatique (non confirmée dans les délais)';
      await reservation.save();
      await this._freeSpot(reservation);
      await this._syncAvailableSpots(reservation.parkingId);
    }

    return expired.length;
  }
}

module.exports = new ReservationService();
