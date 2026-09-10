import { ApiResponse } from '../utils/apiResponse.js';

export const checkHealth = (req, res) => {
  return ApiResponse.success(res, 'FinTrack API is operational', {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};
