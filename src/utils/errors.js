// src/utils/errors.js

class ApplicationError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends ApplicationError {
  constructor(message = 'Requête incorrecte') {
    super(message, 400);
  }
}

class UnauthorizedError extends ApplicationError {
  constructor(message = 'Non authentifié') {
    super(message, 401);
  }
}

class ForbiddenError extends ApplicationError {
  constructor(message = 'Accès interdit') {
    super(message, 403);
  }
}

class NotFoundError extends ApplicationError {
  constructor(message = 'Ressource introuvable') {
    super(message, 404);
  }
}

module.exports = {
  ApplicationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError
};
