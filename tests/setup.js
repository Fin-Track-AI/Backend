/**
 * Jest Global Test Setup
 * Starts an in-memory MongoDB instance so services can make real DB calls without
 * needing an external MongoDB connection during CI or local test runs.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

// Start in-memory MongoDB before all tests
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}, 30000);

// Clean up all collections between test files (beforeEach in each test file handles per-test cleanup)
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
}, 10000);

import jwt from 'jsonwebtoken';
import { config } from '../src/config/env.js';

export const getAuthToken = (role = 'USER', userId = '507f1f77bcf86cd799439011', email = 'test@fintrack.com', employerId = null) => {
  return jwt.sign(
    { userId, id: userId, role, email, employerId },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
};

export const getAuthHeader = (role = 'USER', userId = '507f1f77bcf86cd799439011', email = 'test@fintrack.com', employerId = null) => {
  return `Bearer ${getAuthToken(role, userId, email, employerId)}`;
};
