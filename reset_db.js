const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');
const Parking = require('./src/models/Parking');
const ParkingSpot = require('./src/models/ParkingSpot');
const MockEmail = require('./src/models/MockEmail');

async function resetAndSeed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    // Nettoyer les collections
    await User.deleteMany({});
    await Parking.deleteMany({});
    await ParkingSpot.deleteMany({});
    await MockEmail.deleteMany({});
    console.log('🗑️  Collections nettoyées (Utilisateurs, Parkings, Places, Mails).');

    // 1. Créer le Super Admin
    const admin = new User({
      name: 'Super Admin',
      email: 'admin@smartparking.com',
      password: 'Admin123!',
      phone: '0600000000',
      role: 'super_admin',
      isActive: true,
      status: 'approved'
    });
    await admin.save();
    console.log('✅ Super Admin créé : admin@smartparking.com / Admin123!');

    // 2. Créer l'Entreprise (Company) approuvée
    const company = new User({
      name: 'Parking Indigo Corp',
      email: 'company@smartparking.com',
      password: 'Company123!',
      phone: '0611223344',
      role: 'company',
      address: '15 Avenue des Champs-Élysées, Paris',
      siret: '12345678901234',
      status: 'approved',
      isActive: true
    });
    await company.save();
    console.log('✅ Company créée : company@smartparking.com / Company123!');

    console.log('🎉 Base de données initialisée avec succès !');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

resetAndSeed();
