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

// Enable CORS (Dynamic localhost allowed for Flutter Web dev)
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        config.nodeEnv === 'development' ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        callback(null, true);
      } else {
        callback(null, origin === config.clientUrl);
      }
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
