// src/controllers/claimController.js
const Claim = require('../models/Claim');
const { validationResult } = require('express-validator');

// ─── Helper validation ────────────────────────────────────────────────────────
const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

// ─── POST /api/claims ─────────────────────────────────────────────────────────
// Soumettre une nouvelle réclamation (avec pièces jointes facultatives)
exports.createClaim = async (req, res, next) => {
  try {
    // Les administrateurs gèrent les réclamations, ils ne peuvent pas en soumettre
    if (req.user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Les administrateurs ne peuvent pas soumettre de réclamation.'
      });
    }

    if (handleValidation(req, res)) return;

    const { category, subject, description, priority } = req.body;

    // Construire la liste des pièces jointes (si upload Multer)
    const attachments = (req.files || []).map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    }));

    const claim = await Claim.create({
      submittedBy:    req.user._id,
      submitterName:  req.user.name,
      submitterEmail: req.user.email,
      submitterRole:  req.user.role,
      category,
      subject,
      description,
      priority: priority || 'medium',
      attachments
    });

    res.status(201).json({
      success: true,
      message: 'Réclamation soumise avec succès.',
      data: claim
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/claims ──────────────────────────────────────────────────────────
// Réclamations du user connecté (client / employee / company)
exports.getMyClaims = async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;

    const filter = { submittedBy: req.user._id };
    if (status)   filter.status   = status;
    if (priority) filter.priority = priority;

    const skip = (Number(page) - 1) * Number(limit);

    const [claims, total] = await Promise.all([
      Claim.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean({ virtuals: true }),
      Claim.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: claims,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/claims/all ──────────────────────────────────────────────────────
// Toutes les réclamations — admin uniquement
exports.getAllClaims = async (req, res, next) => {
  try {
    const { status, priority, category, page = 1, limit = 20, search } = req.query;

    const filter = {};
    if (status)   filter.status   = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { submitterName: { $regex: search, $options: 'i' } },
        { claimNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [claims, total] = await Promise.all([
      Claim.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('submittedBy', 'name email role')
        .populate('assignedTo', 'name email')
        .lean({ virtuals: true }),
      Claim.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: claims,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/claims/stats ────────────────────────────────────────────────────
// Statistiques des réclamations — admin uniquement
exports.getClaimStats = async (req, res, next) => {
  try {
    const [statusStats, priorityStats, categoryStats, overdueCount, totalCount] = await Promise.all([
      Claim.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Claim.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      Claim.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      Claim.countDocuments({
        status: { $in: ['open', 'in_progress'] },
        slaDeadline: { $lt: new Date() }
      }),
      Claim.countDocuments()
    ]);

    // Taux de résolution
    const resolvedCount = (statusStats.find(s => s._id === 'resolved')?.count || 0) +
                          (statusStats.find(s => s._id === 'closed')?.count || 0);
    const resolutionRate = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        overdueCount,
        resolutionRate,
        byStatus: statusStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        byPriority: priorityStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        byCategory: categoryStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {})
      }
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/claims/:id ──────────────────────────────────────────────────────
// Détail d'une réclamation (auteur ou admin)
exports.getClaimById = async (req, res, next) => {
  try {
    const claim = await Claim.findById(req.params.id)
      .populate('submittedBy', 'name email role')
      .populate('assignedTo', 'name email')
      .populate('messages.authorId', 'name role');

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Réclamation introuvable.' });
    }

    // Seul l'auteur ou un admin peut voir la réclamation
    const isOwner = claim.submittedBy._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'super_admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    res.status(200).json({ success: true, data: claim });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/claims/:id/status ─────────────────────────────────────────────
// Changer le statut d'une réclamation (admin / company)
exports.updateClaimStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'in_progress', 'resolved', 'rejected', 'closed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut invalide.' });
    }

    const claim = await Claim.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Réclamation introuvable.' });
    }

    // Le client peut seulement fermer une réclamation résolue
    if (req.user.role === 'client') {
      if (status !== 'closed' || claim.status !== 'resolved') {
        return res.status(403).json({ success: false, message: 'Action non autorisée.' });
      }
    }

    claim.status = status;
    if (status === 'resolved' && !claim.resolvedAt) {
      claim.resolvedAt = new Date();
    }
    await claim.save();

    res.status(200).json({ success: true, message: 'Statut mis à jour.', data: claim });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/claims/:id/messages ────────────────────────────────────────────
// Ajouter un message dans le fil de discussion
exports.addMessage = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Le message ne peut pas être vide.' });
    }

    const claim = await Claim.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Réclamation introuvable.' });
    }

    // Seul l'auteur ou un admin peut envoyer des messages
    const isOwner = claim.submittedBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'super_admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    // Passer le statut automatiquement à in_progress quand un gestionnaire répond
    if (isAdmin && claim.status === 'open') {
      claim.status = 'in_progress';
    }

    claim.messages.push({
      authorId:   req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role,
      content:    content.trim()
    });

    await claim.save();

    const newMessage = claim.messages[claim.messages.length - 1];
    res.status(201).json({ success: true, message: 'Message envoyé.', data: newMessage });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/claims/:id/assign ─────────────────────────────────────────────
// Affecter une réclamation à un gestionnaire (admin uniquement)
exports.assignClaim = async (req, res, next) => {
  try {
    const { assignedTo } = req.body;

    const claim = await Claim.findByIdAndUpdate(
      req.params.id,
      { assignedTo, status: 'in_progress' },
      { new: true }
    ).populate('assignedTo', 'name email');

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Réclamation introuvable.' });
    }

    res.status(200).json({ success: true, message: 'Réclamation affectée.', data: claim });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/claims/:id/resolve ────────────────────────────────────────────
// Résoudre une réclamation avec un texte de résolution
exports.resolveClaim = async (req, res, next) => {
  try {
    const { resolution } = req.body;
    if (!resolution || !resolution.trim()) {
      return res.status(400).json({ success: false, message: 'Le texte de résolution est requis.' });
    }

    const claim = await Claim.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Réclamation introuvable.' });
    }

    claim.status     = 'resolved';
    claim.resolution = resolution.trim();
    claim.resolvedAt = new Date();

    // Vérifier si le SLA a été respecté
    if (claim.slaDeadline && new Date() > claim.slaDeadline) {
      claim.slaBreached = true;
    }

    await claim.save();

    res.status(200).json({ success: true, message: 'Réclamation résolue.', data: claim });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/claims/:id/rate ───────────────────────────────────────────────
// Notation de la résolution par le client
exports.rateClaim = async (req, res, next) => {
  try {
    const { rating, ratingComment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'La note doit être comprise entre 1 et 5.' });
    }

    const claim = await Claim.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Réclamation introuvable.' });
    }

    // Seul l'auteur peut noter
    if (claim.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    if (claim.status !== 'resolved') {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez noter qu\'une réclamation résolue.' });
    }

    if (claim.rating) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà noté cette réclamation.' });
    }

    claim.rating        = rating;
    claim.ratingComment = ratingComment || null;
    claim.status        = 'closed';
    await claim.save();

    res.status(200).json({ success: true, message: 'Merci pour votre évaluation !', data: claim });
  } catch (error) {
    next(error);
  }
};
