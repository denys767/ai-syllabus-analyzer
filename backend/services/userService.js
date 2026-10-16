const User = require('../models/User');

// true, якщо після деактивації/зниження/видалення цього користувача не лишиться жодного активного адміна
async function isLastActiveAdmin(user) {
  if (!user || user.role !== 'admin' || user.isActive === false) return false;
  const others = await User.countDocuments({ role: 'admin', isActive: true, _id: { $ne: user._id } });
  return others === 0;
}

module.exports = { isLastActiveAdmin };
