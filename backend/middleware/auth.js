const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Доступ заборонено. Токен не надано.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Роль і активність беремо з БД, а не з JWT: зміни діють одразу
    const user = await User.findById(decoded.userId).select('email role isActive');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Доступ заборонено. Користувача не знайдено або деактивовано.' });
    }

    req.user = { userId: String(user._id), email: user.email, role: user.role };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Доступ заборонено. Недійсний токен.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Доступ заборонено. Термін дії токена минув.' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Внутрішня помилка сервера під час автентифікації' });
  }
};

// Єдиний middleware перевірки ролі: requireRole('admin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Доступ заборонено. Потрібна автентифікація.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Доступ заборонено. Недостатньо прав.' });
  }
  next();
};

module.exports = { auth, requireRole };
