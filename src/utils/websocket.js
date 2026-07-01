// src/utils/websocket.js
const socketIO = require('socket.io');

let io;

const initWebSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:4200',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 [WS] Nouveau client connecté: ${socket.id}`);

    // Rejoindre le canal d'un parking spécifique pour recevoir les mises à jour de simulation
    socket.on('join-parking', (parkingId) => {
      socket.join(`parking-${parkingId}`);
      console.log(`📡 [WS] Client ${socket.id} rejoint parking-${parkingId}`);
    });

    socket.on('leave-parking', (parkingId) => {
      socket.leave(`parking-${parkingId}`);
      console.log(`👋 [WS] Client ${socket.id} quitte parking-${parkingId}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ [WS] Client déconnecté: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('WebSocket non initialisé. Appelez initWebSocket() d\'abord.');
  }
  return io;
};

module.exports = { initWebSocket, getIO };
