/**
 * FinTrack AI - Audit Payload Sanitizer & Redactor
 * Ensures no sensitive PII, auth credentials, or payment secrets are stored in audit logs.
 */

const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'jwtsecret',
  'authorization',
  'cookie',
  'pin',
  'cvv',
  'otp',
  'apikey',
  'geminiapikey',
]);

/**
 * Masks credit card or bank account numbers: keeps last 4 digits.
 */
function maskAccountNumber(val) {
  const str = String(val).replace(/\s|-/g, '');
  if (str.length >= 10 && /^\d+$/.test(str)) {
    return '*'.repeat(str.length - 4) + str.slice(-4);
  }
  return val;
}

/**
 * Masks Indian PAN number: ABCDE1234F -> AB****34F
 */
function maskPan(val) {
  const str = String(val).trim().toUpperCase();
  if (/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(str)) {
    return `${str.slice(0, 2)}****${str.slice(-3)}`;
  }
  return val;
}

/**
 * Recursively sanitizes any object, array, or primitive before audit persistence.
 */
export function sanitizeAuditData(data, depth = 0) {
  if (depth > 6 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Check if looks like a bearer token or secret
    if (data.startsWith('Bearer ') || data.startsWith('ey')) {
      return REDACTED_VALUE;
    }
    return maskPan(maskAccountNumber(data));
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = REDACTED_VALUE;
    } else {
      sanitized[key] = sanitizeAuditData(value, depth + 1);
    }
  }

  return sanitized;
}
