const nodemailer = require('nodemailer');
const MockEmail = require('../models/MockEmail');

// Vérifier si SMTP est configuré (évite les valeurs d'exemple par défaut)
const smtpConfigured = 
  process.env.SMTP_USER && 
  process.env.SMTP_USER !== 'your_email@gmail.com' && 
  process.env.SMTP_PASS && 
  process.env.SMTP_PASS !== 'your_app_password';

let transporter = null;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465', // true pour le port 465, false pour les autres (ex: 587)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      // Évite les erreurs de certificat auto-signé sur certains serveurs
      rejectUnauthorized: false
    }
  });
}

/**
 * Envoie un email réel si SMTP est configuré, sinon simule l'envoi,
 * et l'enregistre toujours en base de données pour le Centre de Notifications.
 * @param {string} to - Destinataire
 * @param {string} subject - Sujet du mail
 * @param {string} body - Contenu HTML
 */
exports.sendEmail = async (to, subject, body) => {
  try {
    // 1. Toujours enregistrer dans la base de données (Centre de Notifications)
    const mockEmail = new MockEmail({
      to,
      subject,
      body
    });
    await mockEmail.save();

    // 2. Envoyer le vrai email si SMTP est configuré
    if (smtpConfigured && transporter) {
      try {
        await transporter.sendMail({
          from: `"Smart Parking" <${process.env.SMTP_USER}>`,
          to,
          subject,
          html: body
        });
        console.log(`📧 [EMAIL RÉEL ENVOYÉ] à ${to} | Sujet: ${subject}`);
      } catch (smtpError) {
        console.error('❌ Erreur lors de l\'envoi de l\'email réel via SMTP:', smtpError.message);
        console.log(`⚠️ Repli sur le Centre de Notifications pour l'e-mail destiné à : ${to}`);
      }
    } else {
      console.log('\n==================================================');
      console.log(`📧 [MOCK EMAIL SENT - SMTP NON CONFIGURÉ]`);
      console.log(`À      : ${to}`);
      console.log(`Sujet  : ${subject}`);
      console.log(`Contenu: ${body.replace(/<[^>]*>/g, ' ').substring(0, 150)}...`);
      console.log('==================================================\n');
    }

    return true;
  } catch (error) {
    console.error('❌ Erreur générale lors de l\'envoi de l\'email:', error);
    return false;
  }
};
