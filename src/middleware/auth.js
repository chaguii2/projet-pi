const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Non authentifié.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Token invalide.' });
    }
    
    // Shift enforcement for employees
    if (user.role === 'employee') {
      const isProfileRoute = req.method === 'GET' && (req.path === '/me' || req.originalUrl?.endsWith('/users/me'));
      if (!isProfileRoute) {
        const now = new Date();
        const currentStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const start = user.shiftStart || '08:00';
        const end = user.shiftEnd || '17:00';
        
        let insideShift = false;
        if (start <= end) {
          insideShift = currentStr >= start && currentStr <= end;
        } else {
          insideShift = currentStr >= start || currentStr <= end;
        }
        
        if (!insideShift) {
          return res.status(403).json({
            success: false,
            message: `Accès refusé en dehors des heures de service (${start} - ${end}).`,
            isOutOfShift: true
          });
        }
      }
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expiré.' });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }
    next();
  };
};
