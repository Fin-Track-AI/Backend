import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { nonTransactionalSafeguard } from './middlewares/safeguard.middleware.js';
import { nonPrivilegedMaskingMiddleware } from './middlewares/masking.middleware.js';
import { tlsGuard } from './middlewares/tlsGuard.middleware.js';
import { config } from './config/env.js';

const app = express();
app.set('trust proxy', true);

// Security HTTP headers with TLS 1.2+ HSTS enforcement (SCRUM-151)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// SCRUM-151: Ingress TLS 1.2+ transport security guard
app.use(tlsGuard);

import rateLimit from 'express-rate-limit';

// Global API Rate Limiter (200 requests per 15 minutes per IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

app.use(globalLimiter);

// Enable CORS with strict origin validation (SEC-011)
const allowedOrigins = (config.clientUrl || '*')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

const LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Mobile apps, curl, and native HTTP clients send no Origin header
      if (!origin) {
        return callback(null, true);
      }

      // Allow local development ports strictly matching regex (not arbitrary substring matches)
      if (config.nodeEnv === 'development' || LOCALHOST_REGEX.test(origin)) {
        return callback(null, true);
      }

      const cleanOrigin = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(cleanOrigin) || (allowedOrigins.includes('*') && config.nodeEnv === 'development')) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  })
);

// HTTP request logger
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Body parsers with safe size limits (prevent resource exhaustion)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// SCRUM-161: Non-Transactional Boundary Safeguard (blocks fund movement & payout attempts)
app.use(nonTransactionalSafeguard);

// SCRUM-148: Non-Privileged View & Response Data Masking
app.use(nonPrivilegedMaskingMiddleware);

// Root health check for GCP Cloud Run and load balancers
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Root welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to FinTrack API Services',
    version: '1.0.0',
    documentation: '/api/v1/health',
  });
});

// API Routes
app.use('/api/v1', routes);

// 404 & Global Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
