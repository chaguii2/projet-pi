// src/services/UserService.js
const User = require('../models/User');
const UserRoles = require('../models/UserRoles');
const Parking = require('../models/Parking');
const { sendEmail } = require('../utils/emailService');
const { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../utils/errors');

class UserService {
  // Helpers for RBAC validation
  _requireAuth(currentUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Non authentifié.');
    }
  }

  _requireRoles(currentUser, ...allowedRoles) {
    this._requireAuth(currentUser);
    if (!allowedRoles.includes(currentUser.role)) {
      throw new ForbiddenError('Accès refusé.');
    }
  }

  async getMe(currentUser) {
    this._requireAuth(currentUser);
    const user = await User.findById(currentUser.id);
    if (!user) {
      throw new NotFoundError('Utilisateur introuvable.');
    }
    return user;
  }

  async updateMe(currentUser, updates) {
    this._requireAuth(currentUser);
    
    // Empêcher la modification de champs critiques en direct
    delete updates.role;
    delete updates.password;
    delete updates.resetPasswordToken;
    delete updates.resetPasswordExpires;

    const user = await User.findByIdAndUpdate(currentUser.id, updates, {
      new: true,
      runValidators: true
    });

    if (!user) {
      throw new NotFoundError('Utilisateur introuvable.');
    }
    return user;
  }

  async deleteMe(currentUser) {
    this._requireAuth(currentUser);
    await User.findByIdAndDelete(currentUser.id);
    return { message: 'Compte supprimé avec succès.' };
  }

  async getUsers(currentUser) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN, UserRoles.COMPANY);

    const query = {};
    if (currentUser.role === UserRoles.COMPANY) {
      query.companyId = currentUser.id;
      query.role = UserRoles.EMPLOYEE;
    }

    const users = await User.find(query).select('-password -resetPasswordToken -resetPasswordExpires');
    return users;
  }

  async getUserById(id, currentUser) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN, UserRoles.COMPANY);

    const user = await User.findById(id).select('-password -resetPasswordToken -resetPasswordExpires');
    if (!user) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    if (currentUser.role === UserRoles.COMPANY && user.companyId?.toString() !== currentUser.id) {
      throw new ForbiddenError('Accès refusé. Cet utilisateur n\'appartient pas à votre entreprise.');
    }

    return user;
  }

  async updateUser(id, updates, currentUser) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN, UserRoles.COMPANY);

    // Protection des champs critiques
    delete updates.password;
    delete updates.resetPasswordToken;
    delete updates.resetPasswordExpires;
    delete updates.email;

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    if (currentUser.role === UserRoles.COMPANY && user.companyId?.toString() !== currentUser.id) {
      throw new ForbiddenError('Accès refusé. Cet utilisateur n\'appartient pas à votre entreprise.');
    }

    Object.assign(user, updates);
    await user.save();

    return user;
  }

  async deleteUser(id, currentUser) {
    this._requireRoles(currentUser, UserRoles.SUPER_ADMIN, UserRoles.COMPANY);

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    if (currentUser.role === UserRoles.COMPANY && user.companyId?.toString() !== currentUser.id) {
      throw new ForbiddenError('Accès refusé. Cet utilisateur n\'appartient pas à votre entreprise.');
    }

    await User.deleteOne({ _id: user._id });
    return { message: 'Utilisateur supprimé.' };
  }

  async createEmployee(employeeData, currentUser) {
    this._requireRoles(currentUser, UserRoles.COMPANY, UserRoles.SUPER_ADMIN);

    const { name, email, password, phone, position, permissions, shiftStart, shiftEnd, companyId, parkingId } = employeeData;
    const ownerCompanyId = currentUser.role === UserRoles.COMPANY ? currentUser.id : companyId;

    if (!parkingId) {
      throw new BadRequestError('L\'identifiant du parking est requis.');
    }

    // 1. Vérifier si l'entreprise a au moins un parking approuvé
    const approvedParkingExists = await Parking.findOne({ companyId: ownerCompanyId, status: 'approved' });
    if (!approvedParkingExists) {
      throw new BadRequestError('Vous devez intégrer un parking et obtenir l\'approbation de l\'administration avant de pouvoir créer des employés.');
    }

    // 2. Vérifier si le parking spécifique appartient à l'entreprise et est approuvé
    const parking = await Parking.findOne({ _id: parkingId, companyId: ownerCompanyId, status: 'approved' });
    if (!parking) {
      throw new NotFoundError('Le parking spécifié n\'existe pas, n\'appartient pas à votre entreprise ou n\'est pas encore approuvé par l\'administration.');
    }

    // 3. Limite d'un employé par parking
    const existingEmployee = await User.findOne({ role: UserRoles.EMPLOYEE, parkingId });
    if (existingEmployee) {
      throw new BadRequestError('Un employé est déjà assigné à ce parking. Limite de 1 employé par parking.');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Un utilisateur avec cet email existe déjà.');
    }

    const user = new User({
      name,
      email,
      password,
      phone,
      role: UserRoles.EMPLOYEE,
      companyId: ownerCompanyId,
      parkingId,
      position: position || 'agent',
      permissions: permissions || ['scan_qr', 'manage_spots'],
      shiftStart: shiftStart || '08:00',
      shiftEnd: shiftEnd || '17:00'
    });

    await user.save();

    // Envoyer l'email simulé contenant ses identifiants
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #6366f1; text-align: center;">Bienvenue chez Smart Parking</h2>
        <p>Bonjour <strong>${user.name}</strong>,</p>
        <p>Votre compte employé pour le parking <strong>${parking.name}</strong> a été créé avec succès par votre entreprise.</p>
        <p>Voici vos identifiants de connexion :</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>Email :</strong> ${email}</p>
          <p style="margin: 5px 0;"><strong>Mot de passe :</strong> ${password}</p>
        </div>
        <p>Vous pouvez vous connecter dès maintenant sur notre plateforme pour gérer les places du parking.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Ceci est un email automatique du système Smart Parking.</p>
      </div>
    `;
    await sendEmail(email, 'Création de votre compte Employé - Smart Parking', emailBody);

    return user;
  }

  async getCompanyEmployees(companyId, currentUser) {
    this._requireRoles(currentUser, UserRoles.COMPANY, UserRoles.SUPER_ADMIN);

    const ownerCompanyId = currentUser.role === UserRoles.COMPANY ? currentUser.id : companyId;

    if (currentUser.role === UserRoles.COMPANY && ownerCompanyId !== currentUser.id) {
      throw new ForbiddenError('Accès refusé.');
    }

    const employees = await User.find({
      role: UserRoles.EMPLOYEE,
      companyId: ownerCompanyId
    }).select('+faceDescriptor -password -resetPasswordToken -resetPasswordExpires');
    
    const mapped = employees.map(emp => {
      const obj = emp.toObject();
      obj.hasFace = !!emp.faceDescriptor && emp.faceDescriptor.length > 0;
      delete obj.faceDescriptor;
      return obj;
    });
    
    return mapped;
  }

  async submitParkingRequest(parkingData, currentUser) {
    this._requireRoles(currentUser, UserRoles.COMPANY);

    const { name, address, city, zipCode, totalSpots, pricePerHour, location = null, openingTime, closingTime, isOpen24h, features, pricePerDay, pricePerMonth, contactPhone, contactEmail, description } = parkingData;

    const parking = new Parking({
      name,
      address,
      city,
      zipCode,
      totalSpots,
      availableSpots: totalSpots, // Initialiser à totalSpots — pas 0
      pricePerHour,
      companyId: currentUser.id,
      location: location || { type: 'Point', coordinates: [10.1815, 36.8065] }, // Default coordinates to Tunis
      openingTime: openingTime || '08:00',
      closingTime: closingTime || '22:00',
      isOpen24h: isOpen24h || false,
      features: features || [],
      pricePerDay: pricePerDay || null,
      pricePerMonth: pricePerMonth || null,
      contactPhone: contactPhone || currentUser.phone || '',
      contactEmail: contactEmail || currentUser.email || '',
      description: description || ''
    });

    await parking.save();

    // Envoyer un email simulé pour notifier le Super Admin
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #6366f1; text-align: center;">Nouvelle Demande d'Intégration de Parking</h2>
        <p>Bonjour Admin,</p>
        <p>L'entreprise <strong>${currentUser.name}</strong> a soumis une demande d'intégration de parking.</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>Nom :</strong> ${name}</p>
          <p style="margin: 5px 0;"><strong>Adresse :</strong> ${address}, ${zipCode} ${city}</p>
          <p style="margin: 5px 0;"><strong>Nombre de Places :</strong> ${totalSpots}</p>
          <p style="margin: 5px 0;"><strong>Prix / Heure :</strong> ${pricePerHour} DT</p>
        </div>
        <p>Veuillez vous connecter sur le panneau d'administration pour approuver ou rejeter cette demande.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Notification automatique Smart Parking.</p>
      </div>
    `;
    await sendEmail('admin@smartparking.com', `Nouvelle demande de parking : ${name}`, emailBody);

    return parking;
  }

  async getCompanyParkings(currentUser) {
    this._requireRoles(currentUser, UserRoles.COMPANY);
    return await Parking.find({ companyId: currentUser.id, isDeleted: { $ne: true } });
  }
}

module.exports = new UserService();
