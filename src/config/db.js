import mongoose from 'mongoose';
import { config } from './env.js';

export const connectDB = async () => {
  if (!config.mongoUri) {
    console.log('[DB Warning] MONGO_URI is not defined in environment settings.');
    return;
  }

  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`[DB] MongoDB Atlas connected successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[DB Error] Failed to connect to MongoDB: ${error.message}`);
    // Non-fatal fallback for test environments without network access
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};
