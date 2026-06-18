/**
 * validators.js
 * -------------
 * Pure, dependency-free validation helpers for the payment widget.
 *
 * Everything here is client-side *input* validation only. It exists to give the
 * cardholder fast feedback and to avoid sending obviously-bad data to your
 * backend. It is NOT a substitute for server-side validation, tokenization, or
 * the authorization/verification the card networks and your processor perform.
 *
 * Exposed both as an ES module (import { ... } from './validators.js') and, for
 * plain <script> usage, as window.PaymentValidators.
 */

// ---------------------------------------------------------------------------
// Card networks (brand) — definitions follow each network's published BIN /
// IIN ranges, PAN lengths, and CVV lengths.
// ---------------------------------------------------------------------------

/**
 * Each brand declares:
 *  - patterns: array of regexes matched against the (digits-only) PAN prefix
 *  - lengths:  set of valid PAN lengths
 *  - cvvLength: required CVV length (Amex uses a 4-digit CID)
 *  - gaps:     where to place spaces when formatting for display
 */
const CARD_BRANDS = {
  visa: {
    label: 'Visa',
    patterns: [/^4/],
    lengths: [13, 16, 19],
    cvvLength: 3,
    gaps: [4, 8, 12],
  },
  mastercard: {
    label: 'Mastercard',
    // 51-55 and the 2221-2720 range
    patterns: [/^5[1-5]/, /^222[1-9]/, /^22[3-9]/, /^2[3-6]/, /^27[01]/, /^2720/],
    lengths: [16],
    cvvLength: 3,
    gaps: [4, 8, 12],
  },
  amex: {
    label: 'American Express',
    patterns: [/^3[47]/],
    lengths: [15],
    cvvLength: 4,
    gaps: [4, 10],
  },
  discover: {
    label: 'Discover',
    patterns: [/^6011/, /^65/, /^64[4-9]/, /^622(12[6-9]|1[3-9]|[2-8]|9[01]|92[0-5])/],
    lengths: [16, 19],
    cvvLength: 3,
    gaps: [4, 8, 12],
  },
};

/**
 * Identify the card brand from a (partial) PAN.
 * @param {string} pan
 * @returns {{ key: string, ...CARD_BRANDS[key] } | null}
 */
function detectBrand(pan) {
  const digits = onlyDigits(pan);
  for (const [key, brand] of Object.entries(CARD_BRANDS)) {
    if (brand.patterns.some((re) => re.test(digits))) {
      return { key, ...brand };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function onlyDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/**
 * Luhn (mod-10) checksum — the integrity check every card network requires of
 * a PAN, and which ACH/bank routing numbers do NOT use (they use ABA, below).
 * @param {string} value digits-only string
 * @returns {boolean}
 */
function luhnValid(value) {
  const digits = onlyDigits(value);
  if (digits.length === 0) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // fast parseInt for a single char
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Card field validators
// ---------------------------------------------------------------------------

/**
 * Validate a card number: brand recognized, length valid for that brand, and
 * Luhn checksum passes.
 * @param {string} pan
 * @returns {{ valid: boolean, brand: string|null, error?: string }}
 */
function validateCardNumber(pan) {
  const digits = onlyDigits(pan);
  if (!digits) return { valid: false, brand: null, error: 'Card number is required.' };

  const brand = detectBrand(digits);
  if (!brand) {
    return { valid: false, brand: null, error: 'Unsupported or unrecognized card network.' };
  }
  if (!brand.lengths.includes(digits.length)) {
    return { valid: false, brand: brand.key, error: `Invalid length for ${brand.label}.` };
  }
  if (!luhnValid(digits)) {
    return { valid: false, brand: brand.key, error: 'Card number failed checksum.' };
  }
  return { valid: true, brand: brand.key };
}

/**
 * Validate the CVV/CVC/CID for a given brand. Network spec: 3 digits for
 * Visa/Mastercard/Discover, 4 for American Express.
 * @param {string} cvv
 * @param {string|null} brandKey
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCvv(cvv, brandKey) {
  const digits = onlyDigits(cvv);
  if (!digits) return { valid: false, error: 'Security code is required.' };
  const expected = brandKey && CARD_BRANDS[brandKey] ? CARD_BRANDS[brandKey].cvvLength : null;
  if (expected) {
    if (digits.length !== expected) {
      return { valid: false, error: `Security code must be ${expected} digits.` };
    }
  } else if (digits.length < 3 || digits.length > 4) {
    return { valid: false, error: 'Security code must be 3 or 4 digits.' };
  }
  return { valid: true };
}

/**
 * Validate an expiry date in MM/YY (or MM/YYYY) form and ensure it is not in
 * the past. `now` is injectable for testing.
 * @param {string} month
 * @param {string} year
 * @param {Date} [now]
 * @returns {{ valid: boolean, error?: string }}
 */
function validateExpiry(month, year, now = new Date()) {
  const m = parseInt(onlyDigits(month), 10);
  let y = parseInt(onlyDigits(year), 10);
  if (!m || Number.isNaN(y)) return { valid: false, error: 'Expiration date is required.' };
  if (m < 1 || m > 12) return { valid: false, error: 'Invalid expiration month.' };
  if (y < 100) y += 2000; // normalize 2-digit year

  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  if (y < curYear || (y === curYear && m < curMonth)) {
    return { valid: false, error: 'Card has expired.' };
  }
  if (y > curYear + 25) return { valid: false, error: 'Invalid expiration year.' };
  return { valid: true };
}

/**
 * AVS postal code. We accept US ZIP (5 or ZIP+4) and generic alphanumeric
 * postal codes (e.g. CA/UK) so the widget works internationally.
 * @param {string} zip
 * @param {string} [country] ISO-3166 alpha-2, defaults to 'US'
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePostalCode(zip, country = 'US') {
  const raw = String(zip == null ? '' : zip).trim();
  if (!raw) return { valid: false, error: 'Billing ZIP/postal code is required.' };
  if (country.toUpperCase() === 'US') {
    if (!/^\d{5}(-\d{4})?$/.test(raw)) {
      return { valid: false, error: 'Enter a valid 5-digit ZIP (or ZIP+4).' };
    }
  } else if (!/^[A-Za-z0-9][A-Za-z0-9\s-]{1,9}[A-Za-z0-9]$/.test(raw)) {
    return { valid: false, error: 'Enter a valid postal code.' };
  }
  return { valid: true };
}

/**
 * Pretty-print a PAN with brand-appropriate spacing as the user types.
 * @param {string} pan
 * @returns {string}
 */
function formatCardNumber(pan) {
  const digits = onlyDigits(pan);
  const brand = detectBrand(digits);
  const gaps = brand ? brand.gaps : [4, 8, 12];
  const maxLen = brand ? Math.max(...brand.lengths) : 19;
  const trimmed = digits.slice(0, maxLen);
  let out = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (gaps.includes(i)) out += ' ';
    out += trimmed[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// ACH (US bank account) validators
// ---------------------------------------------------------------------------

/**
 * Validate an ABA routing/transit number.
 *
 * ACH does NOT use Luhn. A routing number is exactly 9 digits and is verified
 * with the ABA checksum:
 *
 *   3(d1+d4+d7) + 7(d2+d5+d8) + 1(d3+d6+d9) ≡ 0 (mod 10)
 *
 * We additionally sanity-check the leading "Federal Reserve district" range,
 * which is 00-12, 21-32, 61-72, or 80. (00 is reserved/government but valid.)
 *
 * @param {string} routing
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRoutingNumber(routing) {
  const d = onlyDigits(routing);
  if (d.length !== 9) {
    return { valid: false, error: 'Routing number must be 9 digits.' };
  }

  const lead = parseInt(d.slice(0, 2), 10);
  const inRange =
    (lead >= 0 && lead <= 12) ||
    (lead >= 21 && lead <= 32) ||
    (lead >= 61 && lead <= 72) ||
    lead === 80;
  if (!inRange) {
    return { valid: false, error: 'Routing number is not from a valid range.' };
  }

  const n = d.split('').map(Number);
  const checksum =
    3 * (n[0] + n[3] + n[6]) +
    7 * (n[1] + n[4] + n[7]) +
    1 * (n[2] + n[5] + n[8]);
  if (checksum % 10 !== 0) {
    return { valid: false, error: 'Routing number failed checksum.' };
  }
  return { valid: true };
}

/**
 * Validate a US bank account number. Account numbers are not standardized
 * across banks, so we enforce only a sane digit length (typically 4-17).
 * @param {string} account
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAccountNumber(account) {
  const d = onlyDigits(account);
  if (d.length < 4 || d.length > 17) {
    return { valid: false, error: 'Account number must be 4-17 digits.' };
  }
  return { valid: true };
}

const ACH_ACCOUNT_TYPES = ['checking', 'savings'];

/**
 * Validate the whole ACH bundle (routing + account + type + holder name).
 * @param {{ routingNumber: string, accountNumber: string,
 *           accountType: string, accountHolder?: string }} fields
 * @returns {{ valid: boolean, errors: Record<string,string> }}
 */
function validateAch(fields) {
  const errors = {};
  const routing = validateRoutingNumber(fields.routingNumber);
  if (!routing.valid) errors.routingNumber = routing.error;

  const account = validateAccountNumber(fields.accountNumber);
  if (!account.valid) errors.accountNumber = account.error;

  if (!ACH_ACCOUNT_TYPES.includes(String(fields.accountType || '').toLowerCase())) {
    errors.accountType = 'Select checking or savings.';
  }

  if (!fields.accountHolder || !String(fields.accountHolder).trim()) {
    errors.accountHolder = 'Account holder name is required.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

const PaymentValidators = {
  CARD_BRANDS,
  ACH_ACCOUNT_TYPES,
  onlyDigits,
  luhnValid,
  detectBrand,
  validateCardNumber,
  validateCvv,
  validateExpiry,
  validatePostalCode,
  formatCardNumber,
  validateRoutingNumber,
  validateAccountNumber,
  validateAch,
};

// UMD-ish: expose as a global for plain <script> usage.
if (typeof window !== 'undefined') {
  window.PaymentValidators = PaymentValidators;
}

export {
  CARD_BRANDS,
  ACH_ACCOUNT_TYPES,
  onlyDigits,
  luhnValid,
  detectBrand,
  validateCardNumber,
  validateCvv,
  validateExpiry,
  validatePostalCode,
  formatCardNumber,
  validateRoutingNumber,
  validateAccountNumber,
  validateAch,
};
export default PaymentValidators;
