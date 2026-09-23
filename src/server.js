import app from './app.js';
import { config } from './config/env.js';
import { connectDB } from './config/db.js';
import { logger } from './utils/logger.js';

const startServer = async () => {
  try {
    // Initialize Database Connection
    await connectDB();

    const port = Number(config.port) || 5001;
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info(`Server is running on port ${port} [${config.nodeEnv} mode]`);
      logger.info(`Health check available at http://0.0.0.0:${port}/api/v1/health`);
    });

    // Graceful Shutdown
    const handleShutdown = (signal) => {
      logger.info(`${signal} received. Closing HTTP server gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
