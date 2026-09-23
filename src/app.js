import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { config } from './config/env.js';

const app = express();

// Security HTTP headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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
