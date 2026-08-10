/**
 * ach-verification.js
 * -------------------
 * ACH bank-account *ownership* verification.
 *
 * Validating a routing number's checksum proves the number is well-formed; it
 * does NOT prove the person entering it owns the account. The standard way to
 * prove ownership over ACH is the micro-deposit flow:
 *
 *   1. INITIATE  — the processor sends 1-2 tiny deposits (e.g. $0.07, $0.21)
 *                  to the account. (Instant-verification via an aggregator like
 *                  Plaid is the other common path; this module models the
 *                  universally-available micro-deposit path.)
 *   2. VERIFY    — a day or two later the account holder reports the exact
 *                  amounts. Matching them proves ownership.
 *
 * This module implements the verification *state machine* and the amount
 * matching/lockout logic. The actual money movement and persistence live
 * behind a pluggable `backend` so you can wire it to your processor (Stripe,
 * Dwolla, an ACH gateway, ...) in production. A reference in-memory backend is
 * provided for local development and the demo.
 */

import { validateAch } from './validators.js';

export const ACH_STATUS = Object.freeze({
  PENDING: 'pending', // deposits sent, awaiting confirmation
  VERIFIED: 'verified',
  FAILED: 'failed', // too many wrong attempts; must restart
});

const MAX_ATTEMPTS = 3;
const MICRO_DEPOSIT_COUNT = 2;

/**
 * Money is handled in integer cents throughout to avoid float rounding bugs.
 */
function randomMicroDepositCents() {
  // 1..99 cents inclusive
  return 1 + Math.floor(Math.random() * 99);
}

/**
 * Reference in-memory backend. Swap for one that talks to your processor.
 * A backend must implement:
 *   createVerification(record) -> Promise<void>
 *   getVerification(id)        -> Promise<record|null>
 *   updateVerification(id, patch) -> Promise<void>
 */
export function createInMemoryBackend() {
  const store = new Map();
  return {
    async createVerification(record) {
      store.set(record.id, { ...record });
    },
    async getVerification(id) {
      const r = store.get(id);
      return r ? { ...r } : null;
    },
    async updateVerification(id, patch) {
      const r = store.get(id);
      if (!r) throw new Error(`Unknown verification ${id}`);
      store.set(id, { ...r, ...patch });
    },
  };
}

export class AchVerifier {
  /**
   * @param {object} [opts]
   * @param {object} [opts.backend] storage/money-movement backend
   * @param {() => string} [opts.idGenerator]
   * @param {number} [opts.maxAttempts]
   */
  constructor(opts = {}) {
    this.backend = opts.backend || createInMemoryBackend();
    this.maxAttempts = opts.maxAttempts || MAX_ATTEMPTS;
    this.idGenerator =
      opts.idGenerator ||
      (() =>
        'ach_' +
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2)));
  }

  /**
   * Step 1 — validate the bank fields and kick off micro-deposits.
   * @param {{ routingNumber: string, accountNumber: string,
   *           accountType: string, accountHolder: string }} fields
   * @returns {Promise<{ id: string, status: string, depositCount: number }>}
   */
  async initiate(fields) {
    const check = validateAch(fields);
    if (!check.valid) {
      const err = new Error('ACH details are invalid.');
      err.fieldErrors = check.errors;
      throw err;
    }

    const id = this.idGenerator();
    const amounts = Array.from({ length: MICRO_DEPOSIT_COUNT }, randomMicroDepositCents);

    // NEVER persist the full account number in the clear. Store a masked
    // display value plus whatever opaque token your processor returns. Here we
    // keep only the last 4 for display.
    const accountDigits = String(fields.accountNumber).replace(/\D/g, '');
    const record = {
      id,
      status: ACH_STATUS.PENDING,
      accountType: String(fields.accountType).toLowerCase(),
      accountHolder: String(fields.accountHolder).trim(),
      last4: accountDigits.slice(-4),
      // In a real backend `expectedAmounts` lives server-side only and is never
      // returned to the client. It is the secret the user must reproduce.
      expectedAmounts: amounts,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    await this.backend.createVerification(record);

    // The deposits "land" via your processor's ACH credit. We return only
    // non-secret metadata to the caller.
    return { id, status: record.status, depositCount: amounts.length };
  }

  /**
   * Step 2 — confirm the deposited amounts.
   * @param {string} id verification id from initiate()
   * @param {number[]} amountsCents the amounts the user reports, in cents
   * @returns {Promise<{ status: string, attemptsRemaining: number }>}
   */
  async confirm(id, amountsCents) {
    const record = await this.backend.getVerification(id);
    if (!record) throw new Error(`Unknown verification ${id}`);

    if (record.status === ACH_STATUS.VERIFIED) {
      return { status: ACH_STATUS.VERIFIED, attemptsRemaining: 0 };
    }
    if (record.status === ACH_STATUS.FAILED) {
      return { status: ACH_STATUS.FAILED, attemptsRemaining: 0 };
    }

    const submitted = (amountsCents || []).map((n) => parseInt(n, 10));
    const expected = record.expectedAmounts;

    const matches =
      submitted.length === expected.length &&
      // order-independent compare: the deposits can be reported in any order
      sortedEqual(submitted, expected);

    const attempts = record.attempts + 1;

    if (matches) {
      await this.backend.updateVerification(id, {
        status: ACH_STATUS.VERIFIED,
        attempts,
        verifiedAt: new Date().toISOString(),
      });
      return { status: ACH_STATUS.VERIFIED, attemptsRemaining: 0 };
    }

    const failed = attempts >= this.maxAttempts;
    await this.backend.updateVerification(id, {
      status: failed ? ACH_STATUS.FAILED : ACH_STATUS.PENDING,
      attempts,
    });

    return {
      status: failed ? ACH_STATUS.FAILED : ACH_STATUS.PENDING,
      attemptsRemaining: failed ? 0 : this.maxAttempts - attempts,
    };
  }

  /** Look up current status (never leaks expected amounts). */
  async status(id) {
    const record = await this.backend.getVerification(id);
    if (!record) return null;
    return {
      id: record.id,
      status: record.status,
      last4: record.last4,
      accountType: record.accountType,
      attempts: record.attempts,
      attemptsRemaining: Math.max(0, this.maxAttempts - record.attempts),
    };
  }
}

function sortedEqual(a, b) {
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

export default AchVerifier;
