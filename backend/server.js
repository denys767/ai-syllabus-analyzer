const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { performance } = require('perf_hooks');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const surveyRoutes = require('./routes/surveys');
const syllabusRoutes = require('./routes/syllabus');
const aiRoutes = require('./routes/ai');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/users');
const googleFormsRoutes = require('./routes/googleForms');
const clusterRoutes = require('./routes/clusters');
const policiesRoutes = require('./routes/policies');

const app = express();
const PORT = process.env.PORT || 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '20000', 10);
const AI_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '130000', 10);
const LONG_RUNNING_PATHS = ['/api/ai/challenge', '/api/ai/challenge/respond'];

// Basic in-memory health flags
let dbConnected = false;

// Global process error handlers to avoid full process crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Do not exit in development; in production consider graceful shutdown
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-process-exit
    // process.exit(1);
  }
});

// Trust proxy setting for rate limiting
app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '1', 10));

// Security middleware
app.use(helmet());

// CORS configuration FIRST, so even errors/limits include headers
const allowedOrigins = [
  (process.env.FRONTEND_URL || 'http://localhost:3000').trim(),
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser tools
    return callback(null, allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // allowedHeaders omitted to echo Access-Control-Request-Headers dynamically
  preflightContinue: false,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate limiting (configurable) with safe skips for health/webhook/preflight.
// This baseline limiter is for unauthenticated/public traffic only.
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.path || '';
    if (req.method === 'OPTIONS') return true; // never rate-limit preflight
    if (req.headers.authorization) return true; // skip global limiter for authenticated traffic
    return p === '/health' || p.startsWith('/api/google-forms');
  }
});
app.use(limiter);

// Per-user limiter for authenticated API routes
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '120', 10), // allow 120 req/min per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (!token) return req.ip;
      const decoded = jwt.decode(token);
      return decoded?.userId || req.ip;
    } catch {
      return req.ip;
    }
  },
  skip: (req) => req.method === 'OPTIONS'
});
app.use('/api', authLimiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lightweight request logger + per-request timeout
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const id = Math.random().toString(36).slice(2, 8);
  res.setHeader('X-Request-Id', id);

  // Per-request timeout (avoid hanging requests)
  const url = req.originalUrl || req.url || '';
  const isLongRunningAiRequest = LONG_RUNNING_PATHS.some(prefix => url.startsWith(prefix));
  const timeoutMs = isLongRunningAiRequest ? AI_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS;
  res.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      console.warn(`[timeout] ${req.method} ${url} id=${id} exceeded ${timeoutMs}ms`);
      res.status(504).json({ message: 'Request timed out' });
    }
  });

  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    if (durationMs > 1000) {
      console.warn(`[slow] ${req.method} ${req.originalUrl} -> ${status} in ${durationMs.toFixed(1)}ms id=${id}`);
    }
  });
  next();
});

// MongoDB connection
// Mongoose ≥6 defaults already set modern parser & topology; avoid deprecated flags
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-syllabus-analyzer', {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  autoIndex: process.env.NODE_ENV !== 'production'
})
.then(async () => {
  console.log('✅ MongoDB connected successfully');
  dbConnected = true;
  await initializeAdmin();
})
.catch(err => console.error('❌ MongoDB connection error:', err));

// Track DB connectivity for quick 503 instead of hangs
mongoose.connection.on('connected', () => {
  dbConnected = true;
  console.log('ℹ️ Mongoose connection state: connected');
});
mongoose.connection.on('disconnected', () => {
  dbConnected = false;
  console.warn('⚠️ Mongoose connection state: disconnected');
});
mongoose.connection.on('error', (err) => {
  dbConnected = false;
  console.error('🛑 Mongoose error:', err.message);
});

// Short-circuit when DB is down (except health/webhook/preflight)
app.use((req, res, next) => {
  const p = req.path || '';
  if (req.method === 'OPTIONS') return next(); // let CORS preflight pass
  if (!dbConnected && p !== '/health' && !p.startsWith('/api/google-forms')) {
    return res.status(503).json({ message: 'Service temporarily unavailable (database)' });
  }
  next();
});

// Initialize admin user
async function initializeAdmin() {
  try {
    const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL });
    
    if (!adminExists) {
      const admin = new User({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        firstName: process.env.ADMIN_FIRST_NAME || 'System',
        lastName: process.env.ADMIN_LAST_NAME || 'Administrator',
        role: 'admin',
        isVerified: true,
        isActive: true
      });
      
      await admin.save();
      console.log('✅ Admin user created successfully');
      console.log(`📧 Admin email: ${process.env.ADMIN_EMAIL}`);
    } else {
      console.log('ℹ️ Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error initializing admin:', error);
  }
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/syllabus', syllabusRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/google-forms', googleFormsRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/policies', policiesRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
  service: 'AI Syllabus Analyzer Backend',
  dbConnected
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error stack:', err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Tighten HTTP server timeouts to avoid resource leaks
const serverRequestTimeout = Math.max(DEFAULT_REQUEST_TIMEOUT_MS, AI_REQUEST_TIMEOUT_MS);
server.requestTimeout = serverRequestTimeout;
server.headersTimeout = Math.max(serverRequestTimeout + 1000, 25000); // ms
server.keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS || '65000', 10);

// Event loop delay monitor (warn if > 200ms)
let lastTs = performance.now();
setInterval(() => {
  const now = performance.now();
  const drift = now - lastTs - 500;
  lastTs = now;
  if (drift > 200) {
    console.warn(`⚠️ Event loop delay detected: ~${Math.round(drift)}ms`);
  }
}, 500).unref();

module.exports = app;
