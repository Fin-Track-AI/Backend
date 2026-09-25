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

// Enable CORS (supports mobile apps, localhost, and configured client domains)
const allowedOrigins = (config.clientUrl || '*')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Mobile apps, curl, and native HTTP clients send no Origin header
      if (!origin) {
        return callback(null, true);
      }

      // Development, wildcard, or local addresses
      if (
        config.nodeEnv === 'development' ||
        allowedOrigins.includes('*') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }

      const cleanOrigin = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(cleanOrigin)) {
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

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
