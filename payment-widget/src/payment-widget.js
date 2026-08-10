/**
 * payment-widget.js
 * -----------------
 * <payment-widget> — a self-contained, embeddable Money-In payment UI.
 *
 * Supports two tender types:
 *   • Credit/debit card — with network detection, Luhn check, CVV (3/4 by
 *     brand) and billing ZIP/AVS, formatted as the user types.
 *   • ACH bank transfer — routing (ABA checksum) + account + type, with the
 *     micro-deposit ownership-verification flow available via AchVerifier.
 *
 * Security: the widget refuses to operate or submit outside a secure (HTTPS)
 * context and validates the submission endpoint is HTTPS. Sensitive fields are
 * partitioned and never logged in the clear. See security.js.
 *
 * Developer usage (ES module):
 *   import './payment-widget.js';
 *   <payment-widget
 *      amount="49.99" currency="USD"
 *      endpoint="https://api.example.com/payments"
 *      methods="card,ach"></payment-widget>
 *
 *   document.querySelector('payment-widget')
 *     .addEventListener('payment:submit', (e) => { ... e.detail ... });
 *
 * The element emits:
 *   payment:ready    — connected & rendered
 *   payment:change   — any field changed (detail: { method, valid })
 *   payment:invalid  — submit attempted with errors (detail: { errors })
 *   payment:submit   — validation passed (detail: { method, payload, token? })
 *   payment:error    — submission/transport failed (detail: { error })
 *   payment:success  — endpoint accepted the payment (detail: server JSON)
 */

import {
  detectBrand,
  formatCardNumber,
  onlyDigits,
  validateCardNumber,
  validateCvv,
  validateExpiry,
  validatePostalCode,
  validateAch,
  CARD_BRANDS,
} from './validators.js';
import {
  isSecureContext,
  assertHttpsEndpoint,
  partitionSensitive,
} from './security.js';

const STYLES = /* css */ `
  :host {
    --pw-accent: #2563eb;
    --pw-accent-text: #ffffff;
    --pw-bg: #ffffff;
    --pw-fg: #1f2937;
    --pw-muted: #6b7280;
    --pw-border: #d1d5db;
    --pw-error: #dc2626;
    --pw-ok: #059669;
    --pw-radius: 10px;
    --pw-font: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    display: block;
    color: var(--pw-fg);
    font-family: var(--pw-font);
    box-sizing: border-box;
  }
  *, *::before, *::after { box-sizing: inherit; }

  .card {
    background: var(--pw-bg);
    border: 1px solid var(--pw-border);
    border-radius: var(--pw-radius);
    padding: 20px;
    max-width: 420px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
  }
  .header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
  .header h2 { font-size: 1.05rem; margin: 0; }
  .amount { font-weight: 700; font-size: 1.15rem; }
  .secure-note {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: .72rem; color: var(--pw-muted); margin-bottom: 14px;
  }
  .secure-note svg { width: 13px; height: 13px; }

  .tabs { display: flex; gap: 6px; margin-bottom: 16px; }
  .tab {
    flex: 1; padding: 9px 8px; border: 1px solid var(--pw-border);
    background: #f9fafb; border-radius: 8px; cursor: pointer; font-size: .85rem;
    color: var(--pw-fg); transition: background .15s, border-color .15s;
  }
  .tab[aria-selected="true"] { border-color: var(--pw-accent); background: #eff6ff; font-weight: 600; }
  .tab:focus-visible { outline: 2px solid var(--pw-accent); outline-offset: 2px; }

  .field { margin-bottom: 12px; }
  .row { display: flex; gap: 10px; }
  .row > .field { flex: 1; }
  label { display: block; font-size: .78rem; color: var(--pw-muted); margin-bottom: 4px; }
  .input-wrap { position: relative; }
  input, select {
    width: 100%; padding: 10px 11px; font-size: .92rem; color: var(--pw-fg);
    border: 1px solid var(--pw-border); border-radius: 8px; background: #fff;
    font-family: inherit;
  }
  input:focus, select:focus { outline: none; border-color: var(--pw-accent); box-shadow: 0 0 0 3px rgba(37,99,235,.15); }
  input[aria-invalid="true"] { border-color: var(--pw-error); }
  .brand {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    font-size: .7rem; font-weight: 700; letter-spacing: .03em; color: var(--pw-muted);
  }
  .err { color: var(--pw-error); font-size: .73rem; margin-top: 4px; min-height: 1em; }

  button.submit {
    width: 100%; margin-top: 6px; padding: 12px; border: 0; border-radius: 8px;
    background: var(--pw-accent); color: var(--pw-accent-text); font-size: .95rem;
    font-weight: 600; cursor: pointer; transition: opacity .15s, filter .15s;
  }
  button.submit:hover { filter: brightness(1.05); }
  button.submit:disabled { opacity: .6; cursor: not-allowed; }
  button.submit:focus-visible { outline: 2px solid var(--pw-fg); outline-offset: 2px; }

  .pane { display: none; }
  .pane.active { display: block; }

  .banner { padding: 10px 12px; border-radius: 8px; font-size: .82rem; margin-bottom: 12px; display: none; }
  .banner.show { display: block; }
  .banner.error { background: #fef2f2; color: var(--pw-error); border: 1px solid #fecaca; }
  .banner.ok { background: #ecfdf5; color: var(--pw-ok); border: 1px solid #a7f3d0; }
`;

const LOCK_ICON = /* html */ `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/>
  </svg>`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class PaymentWidget extends HTMLElement {
  static get observedAttributes() {
    return ['amount', 'currency', 'endpoint', 'methods', 'title'];
  }

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._method = 'card';
    this._submitting = false;
  }

  // ---- lifecycle -----------------------------------------------------------
  connectedCallback() {
    this._render();
    if (!isSecureContext()) {
      this._showBanner(
        'error',
        'Insecure connection: this payment form requires HTTPS and has been disabled.'
      );
      this._setFormEnabled(false);
    }
    this.dispatchEvent(new CustomEvent('payment:ready'));
  }

  attributeChangedCallback() {
    if (this._root.childElementCount) this._render();
  }

  // ---- public config (attributes with sensible defaults) -------------------
  get amount() { return this.getAttribute('amount') || '0.00'; }
  get currency() { return (this.getAttribute('currency') || 'USD').toUpperCase(); }
  get endpoint() { return this.getAttribute('endpoint') || ''; }
  get methods() {
    return (this.getAttribute('methods') || 'card,ach')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  get heading() { return this.getAttribute('title') || 'Payment details'; }

  // ---- rendering -----------------------------------------------------------
  _render() {
    const methods = this.methods;
    if (!methods.includes(this._method)) this._method = methods[0] || 'card';

    const formattedAmount = this._formatAmount();
    const showCard = methods.includes('card');
    const showAch = methods.includes('ach');
    const showTabs = showCard && showAch;

    this._root.innerHTML = `
      <style>${STYLES}</style>
      <div class="card" part="card">
        <div class="header">
          <h2>${escapeHtml(this.heading)}</h2>
          <span class="amount">${escapeHtml(formattedAmount)}</span>
        </div>
        <span class="secure-note">${LOCK_ICON} Secured with TLS encryption</span>

        <div class="banner" role="alert"></div>

        ${showTabs ? `
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-method="card" aria-selected="${this._method === 'card'}">Card</button>
          <button class="tab" role="tab" data-method="ach" aria-selected="${this._method === 'ach'}">Bank (ACH)</button>
        </div>` : ''}

        ${showCard ? this._cardPaneHtml() : ''}
        ${showAch ? this._achPaneHtml() : ''}

        <button class="submit" type="button">Pay ${escapeHtml(formattedAmount)}</button>
      </div>
    `;

    this._wireEvents();
    this._updateActivePane();
  }

  _cardPaneHtml() {
    return `
      <div class="pane" data-pane="card">
        <div class="field">
          <label for="pw-cardname">Name on card</label>
          <input id="pw-cardname" name="cardName" autocomplete="cc-name" inputmode="text" />
          <div class="err" data-err="cardName"></div>
        </div>
        <div class="field">
          <label for="pw-cardnumber">Card number</label>
          <div class="input-wrap">
            <input id="pw-cardnumber" name="cardNumber" autocomplete="cc-number"
                   inputmode="numeric" placeholder="1234 5678 9012 3456" maxlength="23" />
            <span class="brand" data-brand></span>
          </div>
          <div class="err" data-err="cardNumber"></div>
        </div>
        <div class="row">
          <div class="field">
            <label for="pw-exp">Expiry (MM/YY)</label>
            <input id="pw-exp" name="expiry" autocomplete="cc-exp"
                   inputmode="numeric" placeholder="MM/YY" maxlength="7" />
            <div class="err" data-err="expiry"></div>
          </div>
          <div class="field">
            <label for="pw-cvv">CVV</label>
            <input id="pw-cvv" name="cvv" autocomplete="cc-csc"
                   inputmode="numeric" placeholder="123" maxlength="4" />
            <div class="err" data-err="cvv"></div>
          </div>
          <div class="field">
            <label for="pw-zip">Billing ZIP</label>
            <input id="pw-zip" name="postalCode" autocomplete="postal-code"
                   inputmode="numeric" placeholder="12345" maxlength="10" />
            <div class="err" data-err="postalCode"></div>
          </div>
        </div>
      </div>`;
  }

  _achPaneHtml() {
    return `
      <div class="pane" data-pane="ach">
        <div class="field">
          <label for="pw-holder">Account holder name</label>
          <input id="pw-holder" name="accountHolder" autocomplete="name" />
          <div class="err" data-err="accountHolder"></div>
        </div>
        <div class="row">
          <div class="field">
            <label for="pw-routing">Routing number</label>
            <input id="pw-routing" name="routingNumber" inputmode="numeric"
                   placeholder="9 digits" maxlength="9" />
            <div class="err" data-err="routingNumber"></div>
          </div>
          <div class="field">
            <label for="pw-acct-type">Account type</label>
            <select id="pw-acct-type" name="accountType">
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
            <div class="err" data-err="accountType"></div>
          </div>
        </div>
        <div class="field">
          <label for="pw-account">Account number</label>
          <input id="pw-account" name="accountNumber" inputmode="numeric"
                 placeholder="4-17 digits" maxlength="17" />
          <div class="err" data-err="accountNumber"></div>
        </div>
        <p class="secure-note" style="margin:0">
          You authorize a debit from this account. Ownership is confirmed via
          micro-deposits before funds move.
        </p>
      </div>`;
  }

  // ---- events --------------------------------------------------------------
  _wireEvents() {
    this._root.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => this._selectMethod(tab.dataset.method));
    });

    const cardNumber = this._q('[name=cardNumber]');
    if (cardNumber) {
      cardNumber.addEventListener('input', () => {
        const caretEnd = cardNumber.selectionStart === cardNumber.value.length;
        cardNumber.value = formatCardNumber(cardNumber.value);
        if (caretEnd) cardNumber.setSelectionRange(cardNumber.value.length, cardNumber.value.length);
        this._updateBrand(cardNumber.value);
        this._emitChange();
      });
    }

    const exp = this._q('[name=expiry]');
    if (exp) {
      exp.addEventListener('input', () => {
        const d = onlyDigits(exp.value).slice(0, 4);
        exp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
        this._emitChange();
      });
    }

    // Numeric-only fields
    ['cvv', 'postalCode', 'routingNumber', 'accountNumber'].forEach((name) => {
      const el = this._q(`[name=${name}]`);
      if (el) {
        el.addEventListener('input', () => {
          if (name !== 'postalCode') el.value = onlyDigits(el.value);
          this._emitChange();
        });
      }
    });

    // Generic change + blur validation for everything else
    this._root.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('blur', () => this._validateField(el.name));
      el.addEventListener('input', () => this._clearError(el.name));
    });

    this._root.querySelector('.submit').addEventListener('click', () => this._onSubmit());
  }

  _selectMethod(method) {
    if (!this.methods.includes(method)) return;
    this._method = method;
    this._root.querySelectorAll('.tab').forEach((t) =>
      t.setAttribute('aria-selected', String(t.dataset.method === method)));
    this._updateActivePane();
    this._emitChange();
  }

  _updateActivePane() {
    this._root.querySelectorAll('.pane').forEach((p) =>
      p.classList.toggle('active', p.dataset.pane === this._method));
  }

  _updateBrand(value) {
    const brandEl = this._q('[data-brand]');
    if (!brandEl) return;
    const brand = detectBrand(value);
    brandEl.textContent = brand ? brand.label.replace('American Express', 'AMEX') : '';
    const cvv = this._q('[name=cvv]');
    if (cvv && brand) cvv.setAttribute('maxlength', String(brand.cvvLength));
  }

  // ---- validation ----------------------------------------------------------
  _validateField(name) {
    const el = this._q(`[name=${name}]`);
    if (!el) return true;
    let result = { valid: true };

    switch (name) {
      case 'cardName':
      case 'accountHolder':
        result = el.value.trim()
          ? { valid: true }
          : { valid: false, error: 'This field is required.' };
        break;
      case 'cardNumber':
        result = validateCardNumber(el.value);
        break;
      case 'cvv':
        result = validateCvv(el.value, (detectBrand(this._q('[name=cardNumber]').value) || {}).key);
        break;
      case 'expiry': {
        const [mm, yy] = el.value.split('/');
        result = validateExpiry(mm, yy);
        break;
      }
      case 'postalCode':
        result = validatePostalCode(el.value);
        break;
      case 'routingNumber': {
        const ach = validateAch({
          routingNumber: el.value, accountNumber: '0000', accountType: 'checking', accountHolder: 'x',
        });
        result = ach.errors.routingNumber ? { valid: false, error: ach.errors.routingNumber } : { valid: true };
        break;
      }
      case 'accountNumber': {
        const ach = validateAch({
          routingNumber: '000000000', accountNumber: el.value, accountType: 'checking', accountHolder: 'x',
        });
        result = ach.errors.accountNumber ? { valid: false, error: ach.errors.accountNumber } : { valid: true };
        break;
      }
      default:
        result = { valid: true };
    }

    this._setError(name, result.valid ? '' : result.error);
    el.setAttribute('aria-invalid', String(!result.valid));
    return result.valid;
  }

  _validateActiveMethod() {
    const fields = this._method === 'card'
      ? ['cardName', 'cardNumber', 'expiry', 'cvv', 'postalCode']
      : ['accountHolder', 'routingNumber', 'accountType', 'accountNumber'];
    // validate all, collect overall validity (don't short-circuit so every
    // error is shown at once)
    return fields.map((f) => this._validateField(f)).every(Boolean);
  }

  _setError(name, msg) {
    const el = this._root.querySelector(`[data-err="${name}"]`);
    if (el) el.textContent = msg || '';
  }
  _clearError(name) {
    this._setError(name, '');
    const el = this._q(`[name=${name}]`);
    if (el) el.removeAttribute('aria-invalid');
  }

  // ---- submission ----------------------------------------------------------
  async _onSubmit() {
    if (this._submitting) return;
    this._hideBanner();

    if (!isSecureContext()) {
      this._showBanner('error', 'Connection is not secure (HTTPS required).');
      return;
    }

    if (!this._validateActiveMethod()) {
      this.dispatchEvent(new CustomEvent('payment:invalid', {
        detail: { method: this._method, errors: this._collectErrors() },
      }));
      return;
    }

    const payload = this._collectPayload();
    const { secure, public: pub } = partitionSensitive(payload);

    // Let the host app intercept (e.g. to tokenize via their PSP). If they call
    // preventDefault(), we stop here and let them drive the rest.
    const submitEvent = new CustomEvent('payment:submit', {
      cancelable: true,
      detail: { method: this._method, payload, secure, public: pub },
    });
    const proceed = this.dispatchEvent(submitEvent);
    if (!proceed) return; // host handled it

    if (!this.endpoint) {
      // No endpoint configured: hand control to the host and stop.
      this._showBanner('ok', 'Validation passed. Configure an `endpoint` or handle payment:submit to process.');
      return;
    }

    await this._postToEndpoint(payload);
  }

  async _postToEndpoint(payload) {
    let url;
    try {
      url = assertHttpsEndpoint(this.endpoint);
    } catch (err) {
      this._showBanner('error', err.message);
      this.dispatchEvent(new CustomEvent('payment:error', { detail: { error: err } }));
      return;
    }

    this._setSubmitting(true);
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          method: this._method,
          amount: this.amount,
          currency: this.currency,
          ...payload,
        }),
      });
      if (!res.ok) throw new Error(`Payment failed (HTTP ${res.status}).`);
      const data = await res.json().catch(() => ({}));
      this._showBanner('ok', 'Payment submitted successfully.');
      this.dispatchEvent(new CustomEvent('payment:success', { detail: data }));
    } catch (err) {
      this._showBanner('error', err.message || 'Payment could not be processed.');
      this.dispatchEvent(new CustomEvent('payment:error', { detail: { error: err } }));
    } finally {
      this._setSubmitting(false);
    }
  }

  _collectPayload() {
    if (this._method === 'card') {
      const [mm, yy] = (this._val('expiry') || '').split('/');
      return {
        cardName: this._val('cardName'),
        cardNumber: onlyDigits(this._val('cardNumber')),
        expiryMonth: (mm || '').trim(),
        expiryYear: (yy || '').trim(),
        cvv: this._val('cvv'),
        postalCode: this._val('postalCode'),
      };
    }
    return {
      accountHolder: this._val('accountHolder'),
      routingNumber: this._val('routingNumber'),
      accountNumber: this._val('accountNumber'),
      accountType: this._val('accountType'),
    };
  }

  _collectErrors() {
    const errors = {};
    this._root.querySelectorAll('[data-err]').forEach((el) => {
      if (el.textContent) errors[el.getAttribute('data-err')] = el.textContent;
    });
    return errors;
  }

  _emitChange() {
    this.dispatchEvent(new CustomEvent('payment:change', {
      detail: { method: this._method },
    }));
  }

  // ---- small DOM helpers ---------------------------------------------------
  _q(sel) { return this._root.querySelector(sel); }
  _val(name) { const el = this._q(`[name=${name}]`); return el ? el.value : ''; }

  _setSubmitting(on) {
    this._submitting = on;
    const btn = this._root.querySelector('.submit');
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? 'Processing…' : `Pay ${this._formatAmount()}`;
    }
  }
  _setFormEnabled(on) {
    this._root.querySelectorAll('input, select, button').forEach((el) => { el.disabled = !on; });
  }

  _showBanner(kind, msg) {
    const b = this._root.querySelector('.banner');
    if (!b) return;
    b.className = `banner show ${kind}`;
    b.textContent = msg;
  }
  _hideBanner() {
    const b = this._root.querySelector('.banner');
    if (b) b.className = 'banner';
  }

  _formatAmount() {
    const n = Number(this.amount);
    if (Number.isNaN(n)) return `${this.currency} ${this.amount}`;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: this.currency }).format(n);
    } catch {
      return `${this.currency} ${n.toFixed(2)}`;
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('payment-widget')) {
  customElements.define('payment-widget', PaymentWidget);
}

export { PaymentWidget, CARD_BRANDS };
export default PaymentWidget;
