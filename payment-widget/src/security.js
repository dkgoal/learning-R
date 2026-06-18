/**
 * security.js
 * -----------
 * Transport & runtime security guards for the payment widget.
 *
 * Note on the requirement "follow SSL or better security protocols": in a web
 * payment context the relevant secure-transport protocol is TLS (the modern
 * successor to SSL), surfaced to the browser as HTTPS. (SSH is a remote-shell
 * protocol and is not used to serve web pages.) This module enforces that the
 * widget only ever runs and transmits over a secure context.
 *
 * What real PCI-DSS-aligned security additionally requires lives mostly on your
 * server and your processor; the widget is built so that sensitive data is
 * validated in the browser and then handed to a tokenization endpoint over
 * TLS, never stored or logged in the clear.
 */

/**
 * True when the page is running in a browser "secure context": HTTPS, or
 * localhost during development (which browsers treat as secure).
 * @returns {boolean}
 */
export function isSecureContext() {
  if (typeof window === 'undefined') return true; // non-browser (tests/SSR)
  if (window.isSecureContext === true) return true;
  const host = window.location && window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Ensure a submission target is an absolute https:// URL. Refuses http:// so
 * card/bank data can never be posted in cleartext.
 * @param {string} url
 * @returns {URL}
 * @throws {Error} when the URL is not https
 */
export function assertHttpsEndpoint(url) {
  let parsed;
  try {
    parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined);
  } catch {
    throw new Error('Submission endpoint is not a valid URL.');
  }
  const localhost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';
  if (parsed.protocol !== 'https:' && !localhost) {
    throw new Error('Refusing to transmit payment data over a non-HTTPS endpoint.');
  }
  return parsed;
}

/**
 * Recommended security response headers for the page that hosts the widget.
 * Set these from your server. Provided here as documentation + a helper you can
 * spread into a framework response.
 */
export const RECOMMENDED_SECURITY_HEADERS = Object.freeze({
  // Force HTTPS for a year, including subdomains.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  // Lock down what can load/execute. Tighten `connect-src` to your API origin.
  'Content-Security-Policy':
    "default-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'payment=(self)',
});

/**
 * Build a payload safe to send to your tokenization endpoint. It deliberately
 * does NOT include the raw PAN/CVV beyond what the request itself carries, and
 * strips anything that should never be persisted client-side.
 *
 * In production you should not POST the raw PAN to your own server at all —
 * you POST it directly to your PSP's tokenization endpoint (or use their
 * hosted fields) and your server only ever sees a token. This helper marks the
 * sensitive fields so your transport layer can route them correctly.
 *
 * @param {object} fields
 * @returns {{ secure: object, public: object }}
 */
export function partitionSensitive(fields) {
  const SENSITIVE = new Set([
    'cardNumber',
    'cvv',
    'accountNumber',
    'routingNumber',
  ]);
  const secure = {};
  const pub = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE.has(k)) secure[k] = v;
    else pub[k] = v;
  }
  return { secure, public: pub };
}

/**
 * Redact sensitive values for logging/telemetry. Never log the output of a
 * form without running it through this first.
 * @param {object} fields
 * @returns {object}
 */
export function redactForLogging(fields) {
  const out = {};
  // Redact number-bearing fields, but leave names/holders alone (a "cardName"
  // is not sensitive even though it contains "card").
  const isSensitive = (k) =>
    !/name|holder/i.test(k) &&
    /cardnumber|card$|accountnumber|account$|cvv|cvc|routing|pan/i.test(k);
  for (const [k, v] of Object.entries(fields)) {
    const s = String(v == null ? '' : v);
    if (isSensitive(k)) {
      const digits = s.replace(/\D/g, '');
      out[k] = digits.length > 4 ? `••••${digits.slice(-4)}` : '••••';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default {
  isSecureContext,
  assertHttpsEndpoint,
  RECOMMENDED_SECURITY_HEADERS,
  partitionSensitive,
  redactForLogging,
};
