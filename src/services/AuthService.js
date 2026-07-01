// src/services/AuthService.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserRoles = require('../models/UserRoles');
const { sendEmail } = require('../utils/emailService');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');

class AuthService {
  generateToken(user) {
    return jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }

  async registerUser(userData) {
    const { name, email, password, phone, role, address, siret, vehiclePlate, vehicleSerialNumber, vehicleType } = userData;
    const requestedRole = role ? role.toLowerCase() : UserRoles.CLIENT;

    if (requestedRole === UserRoles.EMPLOYEE) {
      throw new BadRequestError('Les employés doivent être créés par une entreprise.');
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
      role: requestedRole,
      address: requestedRole === UserRoles.COMPANY ? address : undefined,
      siret: requestedRole === UserRoles.COMPANY ? siret : undefined,
      vehiclePlate: requestedRole === UserRoles.CLIENT ? vehiclePlate : undefined,
      vehicleSerialNumber: requestedRole === UserRoles.CLIENT ? vehicleSerialNumber : undefined,
      vehicleType: requestedRole === UserRoles.CLIENT ? vehicleType : undefined
    });

    await user.save();

    const token = this.generateToken(user);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        ...(user.role === UserRoles.CLIENT && {
          vehiclePlate: user.vehiclePlate,
          vehicleSerialNumber: user.vehicleSerialNumber,
          vehicleType: user.vehicleType
        })
      },
      token
    };
  }

  async loginUser(email, password) {
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      throw new UnauthorizedError('Email ou mot de passe invalide.');
    }

    user.lastLogin = new Date();
    await user.save();

    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    };
  }

  async forgotPassword(email) {
    const user = await User.findOne({ email });

    // Réponse générique pour ne pas révéler si l'email existe
    if (!user) {
      return { message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' };
    }

    // Générer le token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 30; // 30 minutes
    await user.save({ validateBeforeSave: false });

    // Lien frontend
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password?token=${resetToken}`;

    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #6366f1; text-align: center;">🔐 Réinitialisation de mot de passe</h2>
        <p>Bonjour <strong>${user.name}</strong>,</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe sur <strong>Smart Parking</strong>.</p>
        <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${resetUrl}"
             style="background-color: #6366f1; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">
            Réinitialiser mon mot de passe
          </a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">Ou copiez ce lien dans votre navigateur :</p>
        <p style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 13px;">
          ${resetUrl}
        </p>
        <p>⏱ <strong>Ce lien expire dans 30 minutes.</strong></p>
        <p style="color: #6b7280; font-size: 13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. Votre mot de passe ne sera pas modifié.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Parking — Email automatique, ne pas répondre.</p>
      </div>
    `;

    const emailSent = await sendEmail(
      email,
      'Réinitialisation de votre mot de passe - Smart Parking',
      emailBody
    );

    if (!emailSent) {
      // Annuler le token si l'email échoue
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      throw new Error('Erreur lors de l\'envoi de l\'email. Veuillez réessayer.');
    }

    return { message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' };
  }

  async resetPassword(token, password) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      throw new BadRequestError('Token invalide ou expiré.');
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Email de confirmation
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #22c55e; text-align: center;">✅ Mot de passe modifié avec succès</h2>
        <p>Bonjour <strong>${user.name}</strong>,</p>
        <p>Votre mot de passe a bien été réinitialisé. Vous pouvez dès maintenant vous connecter avec votre nouveau mot de passe.</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/login"
             style="background-color: #6366f1; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Se connecter
          </a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">Si vous n'êtes pas à l'origine de cette action, contactez immédiatement notre support.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Parking — Email automatique, ne pas répondre.</p>
      </div>
    `;
    await sendEmail(user.email, 'Votre mot de passe a été modifié - Smart Parking', emailBody);

    return {
      message: 'Mot de passe réinitialisé avec succès.',
      token: this.generateToken(user)
    };
  }
}

module.exports = new AuthService();
