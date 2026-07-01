// src/routes/claims.js
const express = require('express');
const { body }  = require('express-validator');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { protect, authorize } = require('../middleware/auth');
const claimController         = require('../controllers/claimController');

const router = express.Router();

// ─── Configuration Multer (upload photos) ────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/claims');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `claim-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images (JPEG, PNG, WEBP, GIF) sont acceptées.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 } // max 5 Mo par fichier, max 5 fichiers
});

// ─── Middleware commun : authentification ────────────────────────────────────
router.use(protect);

// ─── ROUTES CLIENT / EMPLOYEE / COMPANY ──────────────────────────────────────

// POST /api/claims — Soumettre une réclamation (avec photos facultatives)
router.post(
  '/',
  upload.array('attachments', 5),
  [
    body('category').isIn(['payment', 'reservation', 'parking_condition', 'security', 'staff', 'technical', 'other'])
      .withMessage('Catégorie invalide.'),
    body('subject').trim().isLength({ min: 5, max: 150 })
      .withMessage('Le sujet doit contenir entre 5 et 150 caractères.'),
    body('description').trim().isLength({ min: 10, max: 2000 })
      .withMessage('La description doit contenir entre 10 et 2000 caractères.'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priorité invalide.')
  ],
  claimController.createClaim
);

// GET /api/claims — Mes réclamations (user connecté)
router.get('/', claimController.getMyClaims);

// GET /api/claims/stats — Statistiques (admin uniquement)
router.get('/stats', authorize('super_admin'), claimController.getClaimStats);

// GET /api/claims/all — Toutes les réclamations (admin uniquement)
router.get('/all', authorize('super_admin'), claimController.getAllClaims);

// GET /api/claims/:id — Détail d'une réclamation
router.get('/:id', claimController.getClaimById);

// POST /api/claims/:id/messages — Ajouter un message
router.post(
  '/:id/messages',
  [
    body('content').trim().isLength({ min: 1, max: 1000 })
      .withMessage('Le message doit contenir entre 1 et 1000 caractères.')
  ],
  claimController.addMessage
);

// ─── ROUTES ADMIN / GESTIONNAIRE ─────────────────────────────────────────────

// PATCH /api/claims/:id/status — Changer le statut
router.patch('/:id/status',
  [
    body('status').isIn(['open', 'in_progress', 'resolved', 'rejected', 'closed'])
      .withMessage('Statut invalide.')
  ],
  claimController.updateClaimStatus
);

// PATCH /api/claims/:id/assign — Affecter à un gestionnaire (admin)
router.patch('/:id/assign', authorize('super_admin'), claimController.assignClaim);

// PATCH /api/claims/:id/resolve — Résoudre (admin)
router.patch(
  '/:id/resolve',
  authorize('super_admin'),
  [
    body('resolution').trim().isLength({ min: 5, max: 2000 })
      .withMessage('La résolution doit contenir entre 5 et 2000 caractères.')
  ],
  claimController.resolveClaim
);

// ─── ROUTE CLIENT ─────────────────────────────────────────────────────────────

// PATCH /api/claims/:id/rate — Notation (client)
router.patch(
  '/:id/rate',
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('La note doit être entre 1 et 5.'),
    body('ratingComment').optional().trim().isLength({ max: 300 })
      .withMessage('Le commentaire ne peut pas dépasser 300 caractères.')
  ],
  claimController.rateClaim
);

// ─── Servir les fichiers uploadés ─────────────────────────────────────────────
router.use('/uploads', express.static(uploadDir));

module.exports = router;
