import { config } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const HSTS_HEADER_VALUE = 'max-age=31536000; includeSubDomains; preload';

/**
 * Express Middleware: Enforce TLS 1.2+ and In-Transit Security (SCRUM-151)
 *
 * 1. Sets Strict-Transport-Security (HSTS) headers (1 year max-age, includeSubDomains, preload).
 * 2. In production environments, verifies reverse-proxy protocols ('x-forwarded-proto')
 *    and blocks unencrypted HTTP requests.
 */
export const tlsGuard = (req, res, next) => {
  // Always set Strict-Transport-Security header
  res.setHeader('Strict-Transport-Security', HSTS_HEADER_VALUE);

  // In production mode, enforce that traffic arrived via secure HTTPS proxy
  if (config.nodeEnv === 'production') {
    const proto = req.headers['x-forwarded-proto'];

    // Block insecure plain HTTP forwarded by reverse proxy / load balancer
    if (proto === 'http') {
      return ApiResponse.error(
        res,
        'Forbidden: Insecure HTTP transport detected. HTTPS with TLS 1.2+ is strictly required for FinTrack AI.',
        403,
        {
          complianceStatus: 'TLS_ENFORCEMENT_REQUIRED',
          minTlsVersion: 'TLSv1.2',
        }
      );
    }
  }

  next();
};
