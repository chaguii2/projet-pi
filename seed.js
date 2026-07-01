// seed.js - Ajouter un Super Admin et une Company dans la base de données
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    // 1. Créer le Super Admin
    const existingAdmin = await User.findOne({ email: 'admin@smartparking.com' });
    if (existingAdmin) {
      console.log('⚠️  Le Super Admin existe déjà.');
    } else {
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
      console.log('✅ Super Admin créé :');
      console.log('   Email    : admin@smartparking.com');
      console.log('   Mot de passe : Admin123!');
    }

    // 2. Créer l'Entreprise (Company) déjà approuvée
    const existingCompany = await User.findOne({ email: 'company@smartparking.com' });
    if (existingCompany) {
      console.log('⚠️  La Company existe déjà.');
    } else {
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
      console.log('✅ Company créée :');
      console.log('   Email    : company@smartparking.com');
      console.log('   Mot de passe : Company123!');
      console.log('   Statut   : Approuvée (prête à ajouter des parkings)');
    }

    console.log('\n🎉 Seeding terminé avec succès !');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors du seeding:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
