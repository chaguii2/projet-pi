// backend/server.js
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const app = express();

// ==================== MIDDLEWARES ====================
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CONNEXION MONGODB ====================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ MongoDB erreur:', err));

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Routes existantes
const authRoutes    = require('./src/routes/auth');
const userRoutes    = require('./src/routes/users');
const adminRoutes   = require('./src/routes/admin');

// Nouvelles routes intégrées
const iaRoutes      = require('./src/routes/ia');
const parkingRoutes = require('./src/routes/parking');
const subscriptionRoutes = require('./src/routes/subscription');
const reservationRoutes  = require('./src/routes/reservation');
const claimRoutes        = require('./src/routes/claims');

app.use('/api/auth',         authRoutes);
app.use('/api/users',        userRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/ia',           iaRoutes);
app.use('/api/parking',      parkingRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/claims',       claimRoutes);

// ==================== MOCK EMAILS ====================
const MockEmail = require('./src/models/MockEmail');
const { protect } = require('./src/middleware/auth');

app.get('/api/mock-emails', protect, async (req, res) => {
  try {
    const query = {};
    // Si l'utilisateur n'est pas un Super Admin, filtrer les notifications par son e-mail
    if (req.user.role !== 'super_admin') {
      query.to = req.user.email;
    }
    const emails = await MockEmail.find(query).sort({ createdAt: -1 });
    res.json({ emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/mock-emails', protect, async (req, res) => {
  try {
    const query = {};
    // Si l'utilisateur n'est pas un Super Admin, ne vider que ses propres notifications
    if (req.user.role !== 'super_admin') {
      query.to = req.user.email;
    }
    await MockEmail.deleteMany(query);
    res.json({ message: 'Boîte de réception virtuelle vidée.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FICHIERS STATIQUES (SPA + UPLOADS) ====================
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend/dist/frontend/browser')));
// Servir les pièces jointes des réclamations
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
    return res.sendFile(path.join(__dirname, '../frontend/dist/frontend/browser/index.html'));
  }
  next();
});

// ==================== GLOBAL ERROR HANDLER ====================
// Doit être déclaré APRÈS toutes les routes
const errorHandler = require('./src/middleware/errorHandler');
app.use(errorHandler);

// ==================== SERVEUR HTTP + SOCKET.IO ====================
const { initWebSocket } = require('./src/utils/websocket');
const server = http.createServer(app);
const io = initWebSocket(server);
app.set('io', io); // Rendre l'instance io disponible dans les controllers via req.app.get('io')

// ==================== DÉMARRAGE ====================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` 🚀 Serveur Smart Parking démarré`);
  console.log(`========================================`);
  console.log(` 📡 API:        http://localhost:${PORT}/api`);
  console.log(` 🤖 IA Mistral: POST http://localhost:${PORT}/api/ia/chat`);
  console.log(` 🏥 IA Health:  GET  http://localhost:${PORT}/api/ia/health`);
  console.log(` 🗺️  Carte:      GET  http://localhost:${PORT}/api/parking/map/parkings`);
  console.log(` 🅿️  Places:     GET  http://localhost:${PORT}/api/parking/:id/spots`);
  console.log(` 📋 Réservations: POST http://localhost:${PORT}/api/reservations`);
  console.log(` 📋 Mes réservs: GET  http://localhost:${PORT}/api/reservations/my`);
  console.log(`========================================\n`);
});

// Pré-charger les modèles pour éviter les warnings de ré-enregistrement
require('./src/models/User');
require('./src/models/Parking');
require('./src/models/ParkingSpot');
require('./src/models/SubscriptionPlan');
require('./src/models/Subscription');
require('./src/models/Reservation');
require('./src/models/Claim');

console.log('✅ Modèles Utilisateur, Parking, ParkingSpot, Reservation et Claim chargés');

// ==================== JOB AUTO-EXPIRATION DES RÉSERVATIONS ====================
// Vérifie toutes les 5 minutes les réservations "pending" expirées
const reservationService = require('./src/services/ReservationService');
setInterval(async () => {
  try {
    const count = await reservationService._expirePendingReservations();
    if (count > 0) {
      console.log(`⏰ Auto-expiration : ${count} réservation(s) expirée(s).`);
    }
  } catch (err) {
    console.error('❌ Erreur auto-expiration réservations:', err.message);
  }
}, 5 * 60 * 1000); // toutes les 5 minutes