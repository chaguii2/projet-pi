// src/routes/ia.js
const express = require('express');
const router = express.Router();
const { chat, healthCheck, getLocations } = require('../controllers/iaController');

// Route publique – Health check IA
router.get('/health', healthCheck);

// Route publique – Liste des lieux supportés (Tunisie)
router.get('/locations', getLocations);

// Route publique – Chat avec l'agent IA Mistral
// Note: L'IA peut fonctionner sans authentification pour permettre l'accès public
// mais les userId/userEmail passés dans le body permettent d'identifier les utilisateurs
router.post('/chat', chat);

module.exports = router;
