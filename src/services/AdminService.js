// src/services/AdminService.js
const User = require('../models/User');
const UserRoles = require('../models/UserRoles');
const Parking = require('../models/Parking');
const ParkingSpot = require('../models/ParkingSpot');
const { sendEmail } = require('../utils/emailService');
const { ForbiddenError, NotFoundError, UnauthorizedError } = require('../utils/errors');

class AdminService {
  _requireAdmin(currentUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Non authentifié.');
    }
    if (currentUser.role !== UserRoles.SUPER_ADMIN) {
      throw new ForbiddenError('Accès interdit. Rôle Administrateur requis.');
    }
  }

  async getCompanies(currentUser) {
    this._requireAdmin(currentUser);
    const companies = await User.find({ role: UserRoles.COMPANY }).select('-password -resetPasswordToken -resetPasswordExpires');
    return companies;
  }

  async approveCompany(companyId, currentUser) {
    this._requireAdmin(currentUser);

    const company = await User.findOne({ _id: companyId, role: UserRoles.COMPANY });
    if (!company) {
      throw new NotFoundError('Entreprise introuvable.');
    }

    company.status = 'approved';
    company.approvedAt = new Date();
    company.approvedBy = currentUser.id;
    await company.save();

    // Envoyer un email simulé pour notifier de l'approbation
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #10b981; text-align: center;">Compte Entreprise Approuvé</h2>
        <p>Bonjour <strong>${company.name}</strong>,</p>
        <p>Nous avons le plaisir de vous informer que votre compte entreprise sur <strong>Smart Parking</strong> a été approuvé par notre équipe d'administration.</p>
        <p>Vous pouvez dès maintenant vous connecter, ajouter vos parkings et commencer à gérer vos employés.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">L'équipe Smart Parking.</p>
      </div>
    `;
    await sendEmail(company.email, 'Votre compte entreprise a été approuvé !', emailBody);

    return company;
  }

  async rejectCompany(companyId, reason, currentUser) {
    this._requireAdmin(currentUser);

    const company = await User.findOne({ _id: companyId, role: UserRoles.COMPANY });
    if (!company) {
      throw new NotFoundError('Entreprise introuvable.');
    }

    company.status = 'rejected';
    await company.save();

    // Envoyer un email simulé pour notifier du rejet
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #ef4444; text-align: center;">Compte Entreprise Rejeté</h2>
        <p>Bonjour <strong>${company.name}</strong>,</p>
        <p>Nous regrettons de vous informer que votre demande d'inscription d'entreprise sur <strong>Smart Parking</strong> a été rejetée.</p>
        ${reason ? `<p><strong>Raison invoquée :</strong> ${reason}</p>` : ''}
        <p>Si vous pensez qu'il s'agit d'une erreur ou si vous souhaitez apporter des corrections, veuillez contacter notre support.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">L'équipe Smart Parking.</p>
      </div>
    `;
    await sendEmail(company.email, 'Mise à jour concernant votre demande d\'inscription', emailBody);

    return company;
  }

  async suspendCompany(companyId, currentUser) {
    this._requireAdmin(currentUser);

    const company = await User.findOne({ _id: companyId, role: UserRoles.COMPANY });
    if (!company) {
      throw new NotFoundError('Entreprise introuvable.');
    }

    company.status = 'suspended';
    await company.save();

    // Envoyer un email simulé pour notifier de la suspension
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #f59e0b; text-align: center;">Compte Entreprise Suspendu</h2>
        <p>Bonjour <strong>${company.name}</strong>,</p>
        <p>Nous vous informons que votre compte entreprise sur <strong>Smart Parking</strong> a été suspendu temporairement.</p>
        <p>Pour plus d'informations ou pour lever la suspension, veuillez contacter notre équipe d'administration.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">L'équipe Smart Parking.</p>
      </div>
    `;
    await sendEmail(company.email, 'Suspension de votre compte entreprise', emailBody);

    return company;
  }

  async getParkings(currentUser) {
    this._requireAdmin(currentUser);
    const parkings = await Parking.find().populate('companyId', 'name email phone address');
    return parkings;
  }

  async approveParking(parkingId, currentUser) {
    this._requireAdmin(currentUser);

    const parking = await Parking.findById(parkingId);
    if (!parking) {
      throw new NotFoundError('Demande de parking introuvable.');
    }

    parking.status = 'approved';
    await parking.save();

    // ── Auto-générer les places si elles n'existent pas encore ────────────────
    const existingSpots = await ParkingSpot.countDocuments({ parkingId });
    if (existingSpots === 0 && parking.totalSpots > 0) {
      await this._autoGenerateSpots(parking);
    }

    // Récupérer l'entreprise pour lui envoyer la notification par email
    const company = await User.findById(parking.companyId);
    if (company) {
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #10b981; text-align: center;">Demande d'Intégration de Parking Approuvée</h2>
          <p>Bonjour <strong>${company.name}</strong>,</p>
          <p>Nous avons le plaisir de vous informer que votre demande d'intégration pour le parking <strong>${parking.name}</strong> a été approuvée par l'administrateur.</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>Parking :</strong> ${parking.name}</p>
            <p style="margin: 5px 0;"><strong>Adresse :</strong> ${parking.address}, ${parking.zipCode} ${parking.city}</p>
            <p style="margin: 5px 0;"><strong>Capacité :</strong> ${parking.totalSpots} places</p>
          </div>
          <p>Vous pouvez désormais assigner un employé pour la gestion des places de ce parking.</p>
          <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280; text-align: center;">L'équipe Smart Parking.</p>
        </div>
      `;
      await sendEmail(company.email, `Votre parking "${parking.name}" a été approuvé !`, emailBody);
    }

    return parking;
  }

  // ── Génération automatique de places à partir de totalSpots ────────────────
  async _autoGenerateSpots(parking) {
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
    // Mettre à jour availableSpots = totalSpots
    await Parking.findByIdAndUpdate(parking._id, {
      availableSpots: spots.length,
      totalSpots: spots.length
    });

    console.log('✅ ' + spots.length + ' places générées automatiquement pour: ' + parking.name);
  }



  async rejectParking(parkingId, reason, currentUser) {
    this._requireAdmin(currentUser);

    const parking = await Parking.findById(parkingId);
    if (!parking) {
      throw new NotFoundError('Demande de parking introuvable.');
    }

    parking.status = 'rejected';
    parking.rejectionReason = reason || 'Non conforme aux critères requis.';
    await parking.save();

    // Récupérer l'entreprise pour lui envoyer la notification par email
    const company = await User.findById(parking.companyId);
    if (company) {
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #ef4444; text-align: center;">Demande d'Intégration de Parking Rejetée</h2>
          <p>Bonjour <strong>${company.name}</strong>,</p>
          <p>Nous regrettons de vous informer que votre demande d'intégration pour le parking <strong>${parking.name}</strong> a été rejetée par l'administrateur.</p>
          <div style="background-color: #fef2f2; border: 1px solid #fee2e2; padding: 15px; border-radius: 6px; margin: 15px 0; color: #991b1b;">
            <p style="margin: 5px 0;"><strong>Raison du rejet :</strong> ${parking.rejectionReason}</p>
          </div>
          <p>Vous pouvez soumettre une nouvelle demande en adaptant les informations fournies.</p>
          <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280; text-align: center;">L'équipe Smart Parking.</p>
        </div>
      `;
      await sendEmail(company.email, `Mise à jour concernant votre demande de parking "${parking.name}"`, emailBody);
    }

    return parking;
  }
}

module.exports = new AdminService();
