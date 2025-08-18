function admin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Доступ заборонено. Потрібні права адміністратора.' });
  }
  next();
}

function manager(req, res, next) {
  if (req.user.role !== 'manager' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Доступ заборонено. Потрібні права менеджера або адміністратора.' });
  }
  next();
}

module.exports = {
  admin,
  manager,
};
