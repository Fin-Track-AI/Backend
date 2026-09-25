import { dlpService } from '../services/dlp.service.js';

function sanitizeLogArg(arg) {
  if (typeof arg === 'string') {
    return dlpService.maskSensitiveText(arg);
  }
  return dlpService.maskSensitiveData(arg);
}

export const logger = {
  info: (msg, ...args) => {
    const cleanMsg = typeof msg === 'string' ? dlpService.maskSensitiveText(msg) : dlpService.maskSensitiveData(msg);
    const cleanArgs = args.map(sanitizeLogArg);
    console.log(`[INFO] ${new Date().toISOString()} - ${cleanMsg}`, ...cleanArgs);
  },
  warn: (msg, ...args) => {
    const cleanMsg = typeof msg === 'string' ? dlpService.maskSensitiveText(msg) : dlpService.maskSensitiveData(msg);
    const cleanArgs = args.map(sanitizeLogArg);
    console.warn(`[WARN] ${new Date().toISOString()} - ${cleanMsg}`, ...cleanArgs);
  },
  error: (msg, ...args) => {
    const cleanMsg = typeof msg === 'string' ? dlpService.maskSensitiveText(msg) : dlpService.maskSensitiveData(msg);
    const cleanArgs = args.map(sanitizeLogArg);
    console.error(`[ERROR] ${new Date().toISOString()} - ${cleanMsg}`, ...cleanArgs);
  },
};

