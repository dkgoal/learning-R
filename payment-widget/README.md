# Payment Widget

An embeddable, dependency-free **Money-In** payment UI that developers can drop
into any web app. Supports **credit/debit card** and **ACH bank transfer**, with
validation that follows card-network specs, ACH account-ownership verification,
and enforced secure (HTTPS/TLS) transport.

> **A note on "SSL or better".** In a web payment context, the secure-transport
> protocol is **TLS** (the modern successor to SSL), exposed to browsers as
> **HTTPS**. (SSH is a remote-shell protocol and isn't used to serve web pages.)
> This widget enforces that interpretation: it refuses to run or transmit
> outside a secure context. See [Security](#security).

## Features

- **`<payment-widget>` custom element** — Shadow-DOM encapsulated, themeable via
  CSS custom properties, framework-agnostic, zero dependencies.
- **Card network specs** — brand detection (Visa, Mastercard incl. 2-series,
  Amex, Discover), Luhn checksum, **CVV length by brand (3 vs 4 for Amex)**,
  expiry, and **billing ZIP / AVS**. Live formatting as you type.
- **ACH** — routing number validated with the **ABA checksum** (not Luhn),
  account number, account type, plus the **micro-deposit ownership-verification
  flow** in [`src/ach-verification.js`](src/ach-verification.js).
- **Security** — secure-context guard, HTTPS-only submission endpoint,
  sensitive-field partitioning, log redaction, and recommended response headers.

## Quick start

```html
<script type="module" src="/path/to/src/payment-widget.js"></script>

<payment-widget
  amount="49.99"
  currency="USD"
  methods="card,ach"
  endpoint="https://api.yourapp.com/payments"
  title="Complete your purchase"></payment-widget>
```

That's it — the widget renders, validates input, and POSTs to your `endpoint`
over HTTPS when the user pays.

### Attributes

| Attribute  | Default        | Description                                        |
|------------|----------------|----------------------------------------------------|
| `amount`   | `0.00`         | Charge amount; rendered with `Intl.NumberFormat`.  |
| `currency` | `USD`          | ISO-4217 currency code.                            |
| `methods`  | `card,ach`     | Comma list of enabled tenders (`card`, `ach`).     |
| `endpoint` | _(none)_       | HTTPS URL to POST the payment to. Omit to handle it yourself. |
| `title`    | `Payment details` | Heading text.                                   |

### Events

The element dispatches `CustomEvent`s you can listen to:

| Event              | When                          | `detail`                              |
|--------------------|-------------------------------|---------------------------------------|
| `payment:ready`    | rendered & connected          | —                                     |
| `payment:change`   | any field changes             | `{ method }`                          |
| `payment:invalid`  | submit attempted with errors  | `{ method, errors }`                  |
| `payment:submit`   | validation passed (cancelable)| `{ method, payload, secure, public }` |
| `payment:success`  | endpoint returned 2xx         | server JSON                           |
| `payment:error`    | transport/endpoint failure    | `{ error }`                           |

Call `event.preventDefault()` on `payment:submit` to take over (e.g. tokenize
with your PSP) instead of letting the widget POST to `endpoint`:

```js
const widget = document.querySelector('payment-widget');
widget.addEventListener('payment:submit', async (e) => {
  e.preventDefault(); // we'll handle it
  const token = await myPsp.tokenize(e.detail.secure); // card/account fields
  await fetch('/charge', { method: 'POST', body: JSON.stringify({ token, ...e.detail.public }) });
});
```

### Theming

```css
payment-widget {
  --pw-accent: #7c3aed;
  --pw-radius: 14px;
  --pw-error: #b91c1c;
}
```

## ACH verification

Validating a routing number proves it's *well-formed*; it does **not** prove the
user owns the account. [`AchVerifier`](src/ach-verification.js) implements the
standard **micro-deposit** ownership check:

```js
import { AchVerifier, ACH_STATUS } from './src/ach-verification.js';

const verifier = new AchVerifier({ backend: myProcessorBackend });

// 1. Send micro-deposits
const { id } = await verifier.initiate({
  routingNumber: '011000015',
  accountNumber: '000123456789',
  accountType: 'checking',
  accountHolder: 'Ada Lovelace',
});

// 2. A day or two later, the user reports the amounts (in cents)
const result = await verifier.confirm(id, [7, 21]);
if (result.status === ACH_STATUS.VERIFIED) {
  // ownership proven — safe to debit
}
```

- Amounts are compared **order-independently** and tracked in integer cents.
- After `maxAttempts` (default 3) wrong tries the verification is **locked**
  (`FAILED`) and must be restarted.
- The expected amounts live **server-side only** and are never returned to the
  client; `status()` exposes only non-secret metadata (status, last 4, attempts).
- Plug in your processor (Stripe, Dwolla, an ACH gateway) by implementing the
  `backend` interface (`createVerification` / `getVerification` /
  `updateVerification`). An in-memory reference backend is included for dev.

## Security

`src/security.js` provides the transport guarantees:

- **`isSecureContext()`** — the widget disables itself outside HTTPS
  (localhost is treated as secure for development).
- **`assertHttpsEndpoint(url)`** — refuses to POST card/bank data to a
  non-HTTPS endpoint.
- **`partitionSensitive(fields)`** — separates PAN/CVV/account/routing from
  non-sensitive fields so your transport can route secrets to your PSP.
- **`redactForLogging(fields)`** — masks number-bearing fields to last-4 before
  anything hits a log or telemetry.
- **`RECOMMENDED_SECURITY_HEADERS`** — HSTS, CSP, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy: payment=(self)` to set from your server.

### Important: this is client-side input validation, not a payments backend

To stay **PCI-DSS** compliant in production:

- Serve the page over **HTTPS/TLS 1.2+** with HSTS.
- **Do not** send the raw PAN to your own server. Use your PSP's tokenization
  (hosted fields or a tokenization endpoint) so your server only ever sees a
  **token**. The `payment:submit` event and `partitionSensitive` are designed to
  make that handoff easy.
- Never log, store, or cache the PAN/CVV/account number in the clear.
- Run authorization/AVS/CVV checks server-side via your processor — the
  browser-side checks here are for UX and early rejection only.

## Project layout

```
payment-widget/
├── src/
│   ├── payment-widget.js     # <payment-widget> custom element (UI)
│   ├── validators.js         # Luhn, brand, CVV, expiry, AVS, ABA routing
│   ├── ach-verification.js   # micro-deposit ownership verification
│   └── security.js           # HTTPS/TLS guards, redaction, headers
├── demo/index.html           # interactive demo + ACH verification playground
├── test/validators.test.mjs  # node --test suite (no deps)
└── package.json
```

## Develop

```bash
npm test                       # run the test suite (Node's built-in runner)
python3 -m http.server 8080    # then open http://localhost:8080/demo/
```

## License

MIT
