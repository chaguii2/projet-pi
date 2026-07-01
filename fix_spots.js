// fix_spots.js - Corriger availableSpots pour tous les parkings existants
const mongoose = require('mongoose');
require('dotenv').config();
const Parking = require('./src/models/Parking');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connecté à MongoDB');

  // Trouver tous les parkings où availableSpots est 0 mais totalSpots > 0
  const parkings = await Parking.find({ availableSpots: 0, totalSpots: { $gt: 0 } });
  console.log('Parkings à corriger:', parkings.length);

  for (const p of parkings) {
    p.availableSpots = p.totalSpots;
    await p.save();
    console.log('Corrigé: "' + p.name + '" -> availableSpots: ' + p.availableSpots);
  }

  console.log('Correction terminée!');
  await mongoose.disconnect();
  process.exit(0);
}

fix().catch(function(err) {
  console.error('Erreur:', err.message);
  process.exit(1);
});
