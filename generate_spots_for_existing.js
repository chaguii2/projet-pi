// generate_spots_for_existing.js
// Génère les ParkingSpot pour les parkings approuvés qui n'en ont pas encore
const mongoose = require('mongoose');
require('dotenv').config();
const Parking = require('./src/models/Parking');
const ParkingSpot = require('./src/models/ParkingSpot');

async function autoGenerateSpots(parking) {
  const total = parking.totalSpots;
  const spots = [];
  const zones = ['A', 'B', 'C', 'D'];
  const spotsPerZone = Math.ceil(total / zones.length);
  let count = 0;

  for (const zone of zones) {
    for (let i = 1; i <= spotsPerZone && count < total; i++) {
      const spotNumber = zone + i.toString().padStart(2, '0');
      let type = 'STANDARD';
      if (i === 1) type = 'HANDICAP';
      else if (i % 8 === 0) type = 'ELECTRIC';
      else if (i % 5 === 0) type = 'COMPACT';

      spots.push({
        parkingId: parking._id,
        spotNumber,
        row: Math.ceil(i / 5),
        column: ((i - 1) % 5) + 1,
        level: 0,
        zone,
        type,
        priceMultiplier: type === 'HANDICAP' ? 0.8 : type === 'ELECTRIC' ? 1.2 : 1.0,
        isAvailable: true,
        isReserved: false,
        status: 'ACTIVE'
      });
      count++;
    }
  }

  await ParkingSpot.insertMany(spots);
  await Parking.findByIdAndUpdate(parking._id, {
    availableSpots: spots.length,
    totalSpots: spots.length
  });

  console.log('Places generees: ' + spots.length + ' pour parking: ' + parking.name);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connecte a MongoDB');

  // Trouver les parkings approuvés sans spots
  const approvedParkings = await Parking.find({ status: 'approved', totalSpots: { $gt: 0 } });
  console.log('Parkings approuves trouves: ' + approvedParkings.length);

  for (const parking of approvedParkings) {
    const existingCount = await ParkingSpot.countDocuments({ parkingId: parking._id });
    console.log('Parking "' + parking.name + '": ' + existingCount + ' spots existants / ' + parking.totalSpots + ' total');
    if (existingCount === 0) {
      await autoGenerateSpots(parking);
    } else {
      console.log('-> Spots deja presents, ignoré');
    }
  }

  console.log('Termine!');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(function(err) {
  console.error('Erreur:', err.message);
  process.exit(1);
});
