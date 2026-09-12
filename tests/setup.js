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
