// src/middleware/errorHandler.js
const { ApplicationError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  console.error('💥 Error caught in middleware:', err);

  if (err instanceof ApplicationError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message
    });
  }

  // Handle mongoose validation/cast errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Format incorrect pour le champ ${err.path}`
    });
  }

  // Fallback to 500 internal server error
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Une erreur serveur interne est survenue';
  
  res.status(statusCode).json({
    success: false,
    message: message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = errorHandler;
