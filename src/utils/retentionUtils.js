/**
 * FinTrack AI - Retention & Statutory Compliance Helpers (SCRUM-155)
 * Defines retention periods under Indian Income Tax Act Sec 44AA and Companies Act Sec 128.
 */

export const RETENTION_PERIODS = {
  STATUTORY_5_YEAR: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years in ms
  STANDARD_1_YEAR: 365 * 24 * 60 * 60 * 1000,      // 1 year in ms
  TRANSIENT_30_DAYS: 30 * 24 * 60 * 60 * 1000,     // 30 days in ms
};

/**
 * Calculates retention expiry date based on statutory policy category.
 *
 * @param {Date|string} [baseDate=new Date()]
 * @param {'STATUTORY_5_YEAR'|'STANDARD_1_YEAR'|'TRANSIENT_30_DAYS'} [category='STATUTORY_5_YEAR']
 * @returns {Date}
 */
export function calculateRetentionDate(baseDate = new Date(), category = 'STATUTORY_5_YEAR') {
  const startMs = new Date(baseDate).getTime();
  const durationMs = RETENTION_PERIODS[category] || RETENTION_PERIODS.STATUTORY_5_YEAR;
  return new Date(startMs + durationMs);
}
