// src/controllers/reservationController.js
const { validationResult } = require('express-validator');
const reservationService = require('../services/ReservationService');

// Helper pour formater les erreurs de validation
const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

// ─── CLIENT ───────────────────────────────────────────────────────────────────

// POST /api/reservations
exports.createReservation = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    const result = await reservationService.createReservation(req.body, req.user);

    // Émettre un événement WebSocket si disponible
    const io = req.app.get('io');
    if (io && result.data) {
      const parkingId = result.data.parkingId?._id || result.data.parkingId;
      io.to(`parking-${parkingId}`).emit('reservation-created', {
        type: 'RESERVATION_CREATED',
        reservation: result.data,
        timestamp: new Date()
      });
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// GET /api/reservations/my
exports.getMyReservations = async (req, res, next) => {
  try {
    const result = await reservationService.getMyReservations(req.user, req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// GET /api/reservations/:id
exports.getReservationById = async (req, res, next) => {
  try {
    const result = await reservationService.getReservationById(req.params.id, req.user);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// PUT /api/reservations/:id/confirm
exports.confirmReservation = async (req, res, next) => {
  try {
    const result = await reservationService.confirmReservation(req.params.id, req.user);

    const io = req.app.get('io');
    if (io && result.data) {
      io.to(`parking-${result.data.parkingId}`).emit('reservation-updated', {
        type: 'RESERVATION_CONFIRMED',
        reservationId: result.data._id,
        timestamp: new Date()
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// PUT /api/reservations/:id/cancel
exports.cancelReservation = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await reservationService.cancelReservation(req.params.id, req.user, reason);

    const io = req.app.get('io');
    if (io && result.data) {
      const parkingId = result.data.parkingId;
      io.to(`parking-${parkingId}`).emit('reservation-updated', {
        type: 'RESERVATION_CANCELLED',
        reservationId: result.data._id,
        timestamp: new Date()
      });
      io.to(`parking-${parkingId}`).emit('spots-update', {
        type: 'SPOT_FREED',
        spotId: result.data.spotId,
        parkingId,
        timestamp: new Date()
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// POST /api/reservations/:id/review
exports.leaveReview = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    const { rating, comment } = req.body;
    const result = await reservationService.leaveReview(req.params.id, req.user, rating, comment);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ─── EMPLOYEE / COMPANY / ADMIN ───────────────────────────────────────────────

// GET /api/reservations/parking/:parkingId
exports.getParkingReservations = async (req, res, next) => {
  try {
    const result = await reservationService.getParkingReservations(
      req.params.parkingId, req.user, req.query
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// PUT /api/reservations/:id/checkin
exports.checkIn = async (req, res, next) => {
  try {
    const { qrCode } = req.body;
    const io = req.app.get('io');
    const result = await reservationService.checkIn(req.params.id, req.user, qrCode || null, io);

    if (io && result.data) {
      io.to(`parking-${result.data.parkingId}`).emit('reservation-updated', {
        type: 'CLIENT_CHECKED_IN',
        reservationId: result.data._id,
        spotNumber: result.data.spotNumber,
        timestamp: new Date()
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// PUT /api/reservations/:id/checkout
exports.checkOut = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const result = await reservationService.checkOut(req.params.id, req.user, io);

    if (io && result.data) {
      const parkingId = result.data.parkingId;
      io.to(`parking-${parkingId}`).emit('reservation-updated', {
        type: 'CLIENT_CHECKED_OUT',
        reservationId: result.data._id,
        timestamp: new Date()
      });
      io.to(`parking-${parkingId}`).emit('spots-update', {
        type: 'SPOT_FREED',
        spotId: result.data.spotId,
        parkingId,
        timestamp: new Date()
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// PUT /api/reservations/:id/no-show
exports.markNoShow = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const result = await reservationService.markNoShow(req.params.id, req.user, io);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// GET /api/reservations/qr/:qrCode
exports.verifyByQrCode = async (req, res, next) => {
  try {
    const result = await reservationService.verifyByQrCode(req.params.qrCode, req.user);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// GET /api/reservations/parking/:parkingId/stats
exports.getParkingStats = async (req, res, next) => {
  try {
    const result = await reservationService.getParkingStats(req.params.parkingId, req.user);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ─── SUPER ADMIN ──────────────────────────────────────────────────────────────

// GET /api/reservations
exports.getAllReservations = async (req, res, next) => {
  try {
    const result = await reservationService.getAllReservations(req.user, req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
