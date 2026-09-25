/**
 * FinTrack AI - Cloud DLP & Data Masking Service (SCRUM-146 / SCRUM-147 / SCRUM-148)
 *
 * Implements Google Cloud DLP-compatible InfoType specifications and high-speed
 * in-process regex/object token sanitizers for:
 * 1. CUSTOM_UPI_ID (e.g., username@bankhandle -> ro****@okaxis, 98******10@paytm)
 * 2. CUSTOM_BANK_ACCOUNT (e.g., 9-18 digit account -> ******9012)
 * 3. PHONE_NUMBER (e.g., 10-digit Indian numbers -> +91 98*****210)
 * 4. INDIA_PAN (e.g., ABCDE1234F -> AB****34F)
 */

// Regex patterns for sensitive financial and identity identifiers
// UPI handles do not have top-level domain extensions (.com, .org, .corp), distinguishing them from emails
const UPI_REGEX = /\b([a-zA-Z0-9._-]{2,256})@([a-zA-Z]{2,64})\b(?!\.[a-zA-Z])/g;
const BANK_ACCOUNT_REGEX = /\b\d{9,18}\b/g;
const INDIAN_PHONE_REGEX = /(?:(?:\+|0{0,2})91[\s-]?)?([6-9]\d{9})\b/g;
const PAN_REGEX = /\b([A-Z]{5})([0-9]{4})([A-Z]{1})\b/g;

// Keys commonly holding sensitive banking/PII fields
const SENSITIVE_ACCOUNT_KEYS = new Set([
  'accountnumber',
  'bankaccount',
  'bankaccountnumber',
  'beneficiaryaccount',
  'beneficiaryaccountnumber',
  'accountno',
  'accno',
]);

const SENSITIVE_UPI_KEYS = new Set([
  'upiid',
  'vpa',
  'upihandle',
  'virtualpaymentaddress',
  'payeeaddress',
]);

const SENSITIVE_PHONE_KEYS = new Set([
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'employeephone',
]);

const SENSITIVE_PAN_KEYS = new Set([
  'pan',
  'pannumber',
  'taxid',
]);

/**
 * Google Cloud DLP Configuration Templates (SCRUM-147)
 * Conforms to Google Cloud Data Loss Prevention API v2 schema.
 */
export const cloudDlpConfig = {
  projectId: process.env.GCP_PROJECT_ID || 'fintrack-ai-prod',
  inspectTemplate: {
    name: 'projects/fintrack-ai-prod/inspectTemplates/fintrack-financial-dlp',
    inspectConfig: {
      infoTypes: [
        { name: 'CUSTOM_UPI_ID' },
        { name: 'CUSTOM_BANK_ACCOUNT' },
        { name: 'PHONE_NUMBER' },
        { name: 'INDIA_PAN' },
      ],
      customInfoTypes: [
        {
          infoType: { name: 'CUSTOM_UPI_ID' },
          regex: {
            pattern: '[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}',
          },
          likelihood: 'VERY_LIKELY',
        },
        {
          infoType: { name: 'CUSTOM_BANK_ACCOUNT' },
          regex: {
            pattern: '\\b[0-9]{9,18}\\b',
          },
          likelihood: 'POSSIBLE',
        },
      ],
      minLikelihood: 'POSSIBLE',
      includeQuote: false,
    },
  },
  deidentifyTemplate: {
    name: 'projects/fintrack-ai-prod/deidentifyTemplates/fintrack-masking-rule',
    deidentifyConfig: {
      infoTypeTransformations: {
        transformations: [
          {
            infoTypes: [{ name: 'CUSTOM_UPI_ID' }],
            primitiveTransformation: {
              characterMaskConfig: {
                maskingCharacter: '*',
                numberToMask: 4,
              },
            },
          },
          {
            infoTypes: [{ name: 'CUSTOM_BANK_ACCOUNT' }],
            primitiveTransformation: {
              characterMaskConfig: {
                maskingCharacter: '*',
                reverseOrder: true,
                charactersToIgnore: [{ charactersToSkip: 4 }],
              },
            },
          },
        ],
      },
    },
  },
};

/**
 * Masks a single UPI ID / VPA string.
 * Example: 'rohit.sharma@okhdfcbank' -> 'ro****@okhdfcbank'
 * Example: '9876543210@paytm' -> '98******10@paytm'
 */
export function maskUpiId(val) {
  if (!val || typeof val !== 'string') {
    return val;
  }

  const parts = val.split('@');
  if (parts.length !== 2) {
    return val;
  }

  const [username, handle] = parts;
  if (!username || !handle) {
    return val;
  }

  // If username is phone-based (all digits, length 10)
  if (/^\d{10}$/.test(username)) {
    return `${username.slice(0, 2)}******${username.slice(-2)}@${handle}`;
  }

  if (username.length <= 2) {
    return `${username[0]}*@${handle}`;
  }

  if (username.length === 3) {
    return `${username.slice(0, 1)}*${username.slice(-1)}@${handle}`;
  }

  return `${username.slice(0, 2)}****@${handle}`;
}

/**
 * Masks a Bank Account Number: preserves the last 4 digits, masks preceding digits.
 * Example: '123456789012' -> '********9012'
 */
export function maskBankAccount(val) {
  if (val === null || val === undefined) {
    return val;
  }

  const str = String(val).trim();
  const digitsOnly = str.replace(/[\s-]/g, '');

  if (digitsOnly.length >= 9 && /^\d+$/.test(digitsOnly)) {
    const maskLen = digitsOnly.length - 4;
    return `${'*'.repeat(maskLen)}${digitsOnly.slice(-4)}`;
  }

  return val;
}

/**
 * Masks an Indian mobile phone number: preserves first 2 and last 2 or 3 digits.
 * Example: '9876543210' -> '98*****210'
 * Example: '+919876543210' -> '+91 98*****210'
 */
export function maskPhoneNumber(val) {
  if (!val || typeof val !== 'string') {
    return val;
  }

  const clean = val.trim();
  const match = clean.match(/(?:(?:\+|0{0,2})91[\s-]?)?([6-9]\d{9})\b/);
  if (!match) {
    return val;
  }

  const fullDigits = match[1];
  const maskedDigits = `${fullDigits.slice(0, 2)}*****${fullDigits.slice(-3)}`;

  if (clean.includes('+91')) {
    return `+91 ${maskedDigits}`;
  }

  return maskedDigits;
}

/**
 * Masks Indian PAN number: preserves first 2 and last 3 characters.
 * Example: 'ABCDE1234F' -> 'AB****34F'
 */
export function maskPan(val) {
  if (!val || typeof val !== 'string') {
    return val;
  }

  const str = val.trim().toUpperCase();
  if (/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(str)) {
    return `${str.slice(0, 2)}****${str.slice(-3)}`;
  }

  return val;
}

/**
 * Scans and masks all sensitive patterns within a freeform text string.
 * Used for sanitizing logs, unstructured error messages, and descriptions.
 */
export function maskSensitiveText(text) {
  if (typeof text !== 'string') {
    return text;
  }

  // 1. Mask UPI IDs
  let sanitized = text.replace(UPI_REGEX, (match, username, handle) => {
    return maskUpiId(`${username}@${handle}`);
  });

  // 2. Mask Indian PAN numbers
  sanitized = sanitized.replace(PAN_REGEX, (match, p1, p2, p3) => {
    return `${p1.slice(0, 2)}****${p2.slice(-2)}${p3}`;
  });

  // 3. Mask standalone 9-18 digit account numbers
  sanitized = sanitized.replace(BANK_ACCOUNT_REGEX, (match) => {
    if (match.length >= 9 && match.length <= 18) {
      return maskBankAccount(match);
    }
    return match;
  });

  // 4. Mask 10-digit mobile phone numbers (starting with 6-9)
  sanitized = sanitized.replace(INDIAN_PHONE_REGEX, (match) => {
    return maskPhoneNumber(match);
  });

  return sanitized;
}

// Keys to ignore from content regex masking (preserves hashes, IDs, timestamps, emails)
const IGNORED_KEYS = new Set([
  '_id',
  'id',
  'email',
  'corporateemail',
  'workemail',
  'useremail',
  'officialemail',
  'token',
  'refreshtoken',
  'accesstoken',
  'jwtsecret',
  'hash',
  'prevhash',
  'currenthash',
  'signature',
  'url',
  'filepath',
  'mimetype',
  'status',
  'type',
  'createdat',
  'updatedat',
  'retentionuntil',
  'timestamp',
]);

/**
 * Recursively masks sensitive fields across nested objects, arrays, or primitives.
 * Applies both key-name heuristics and text-content pattern scanning.
 */
export function maskSensitiveData(data, depth = 0) {
  if (depth > 8 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return maskSensitiveText(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    const errorObj = {
      name: data.name,
      message: maskSensitiveText(data.message),
      stack: maskSensitiveText(data.stack || ''),
    };
    return errorObj;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item, depth + 1));
  }

  if (typeof data === 'object') {
    // If it's a Mongoose document or has toJSON
    const source = typeof data.toJSON === 'function' ? data.toJSON() : data;
    const result = {};

    for (const [key, value] of Object.entries(source)) {
      const lowerKey = key.toLowerCase();

      if (IGNORED_KEYS.has(lowerKey)) {
        result[key] = value;
      } else if (SENSITIVE_ACCOUNT_KEYS.has(lowerKey)) {
        result[key] = maskBankAccount(value);
      } else if (SENSITIVE_UPI_KEYS.has(lowerKey)) {
        result[key] = maskUpiId(value);
      } else if (SENSITIVE_PHONE_KEYS.has(lowerKey)) {
        result[key] = maskPhoneNumber(value);
      } else if (SENSITIVE_PAN_KEYS.has(lowerKey)) {
        result[key] = maskPan(value);
      } else {
        result[key] = maskSensitiveData(value, depth + 1);
      }
    }
    return result;
  }

  return data;
}

/**
 * Applies role-based data masking to API response bodies (SCRUM-148).
 * Privileged roles: ['SYSTEM', 'SECURITY_ADMIN', 'SUPER_ADMIN', 'FINANCE_CONTROLLER'].
 * Non-privileged roles: 'USER', 'EMPLOYEE', 'EMPLOYER_ADMIN', 'ANONYMOUS'.
 */
export function maskObjectForNonPrivileged(data, options = {}) {
  const { role = 'USER' } = options;

  const PRIVILEGED_ROLES = new Set([
    'SYSTEM',
    'SECURITY_ADMIN',
    'SUPER_ADMIN',
    'FINANCE_CONTROLLER',
  ]);

  if (PRIVILEGED_ROLES.has(role)) {
    return data;
  }

  return maskSensitiveData(data);
}

export const dlpService = {
  cloudDlpConfig,
  maskUpiId,
  maskBankAccount,
  maskPhoneNumber,
  maskPan,
  maskSensitiveText,
  maskSensitiveData,
  maskObjectForNonPrivileged,
};

export default dlpService;
