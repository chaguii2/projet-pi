// src/controllers/iaController.js
const aiService = require('../services/AIService');

const chat = async (req, res, next) => {
  try {
    const { 
      message, 
      userId = 'anonymous', 
      userName, 
      userEmail, 
      coordinates = null 
    } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        reply: "❌ Veuillez poser une question ou donner une instruction."
      });
    }
    
    const result = await aiService.chat(message, userId, {
      userName,
      userEmail,
      coordinates
    });
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.status(200).json({
      success: true,
      reply: result.reply,
      suggestions: result.suggestions || ["Trouver parking", "Disponibilité", "Tarifs", "Aide"],
      data: result.data || null,
      actionsExecuted: result.actionsExecuted || [],
      mode: "mistral"
    });
    
  } catch (error) {
    next(error);
  }
};

const healthCheck = async (req, res, next) => {
  try {
    const status = await aiService.healthCheck();
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};

const getLocations = async (req, res, next) => {
  try {
    const { search, limit = 50 } = req.query;
    const locations = await aiService.getLocations(search, limit);
    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { chat, healthCheck, getLocations };
