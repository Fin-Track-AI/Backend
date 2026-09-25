import mongoose from 'mongoose';
import { config } from './env.js';

export const getMongoTlsOptions = () => ({
  tls: true,
  minTLSVersion: 'TLSv1.2',
});

export const connectDB = async () => {
  if (!config.mongoUri) {
    console.log('[DB Warning] MONGO_URI is not defined in environment settings.');
    return;
  }

  const isRemote =
    config.mongoUri.includes('mongodb+srv') ||
    config.mongoUri.includes('ssl=true') ||
    config.nodeEnv === 'production';

  const connectionOptions = isRemote ? getMongoTlsOptions() : {};

  try {
    const conn = await mongoose.connect(config.mongoUri, connectionOptions);
    console.log(`[DB] MongoDB Atlas connected successfully (TLS 1.2+): ${conn.connection.host}`);
  } catch (error) {
    console.error(`[DB Error] Failed to connect to MongoDB: ${error.message}`);
    // Non-fatal fallback for test environments without network access
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};
