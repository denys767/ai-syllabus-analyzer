const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.log('Auth middleware: No token provided');
      return res.status(401).json({
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      console.log('Auth middleware: User not found or inactive', decoded.userId);
      return res.status(401).json({
        message: 'Access denied. User not found or inactive.'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.log('Auth middleware error:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Access denied. Invalid token.'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Access denied. Token expired.'
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({
      message: 'Internal server error during authentication'
    });
  }
};

// Role-based access control middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Access denied. Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Check if user is verified
const requireVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Email verification required. Please verify your email before proceeding.'
      });
    }

    next();
  } catch (error) {
    console.error('Verification check error:', error);
    res.status(500).json({
      message: 'Internal server error during verification check'
    });
  }
};

// Use centralized role middleware to avoid duplication
const { admin } = require('./roles');

module.exports = {
  auth,
  authorize,
  requireVerification,
  admin
};
