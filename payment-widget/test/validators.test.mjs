/**
 * Minimal test runner — no dependencies. Run with: node test/validators.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
} from '../src/validators.js';
import { AchVerifier, createInMemoryBackend, ACH_STATUS } from '../src/ach-verification.js';
import { assertHttpsEndpoint, redactForLogging, partitionSensitive } from '../src/security.js';

test('Luhn checksum', () => {
  assert.ok(luhnValid('4242424242424242'));
  assert.ok(luhnValid('378282246310005')); // Amex
  assert.ok(!luhnValid('4242424242424241'));
  assert.ok(!luhnValid(''));
});

test('brand detection', () => {
  assert.equal(detectBrand('4242424242424242').key, 'visa');
  assert.equal(detectBrand('5555555555554444').key, 'mastercard');
  assert.equal(detectBrand('2223003122003222').key, 'mastercard'); // 2-series
  assert.equal(detectBrand('378282246310005').key, 'amex');
  assert.equal(detectBrand('6011111111111117').key, 'discover');
  assert.equal(detectBrand('9999'), null);
});

test('card number validation', () => {
  assert.ok(validateCardNumber('4242 4242 4242 4242').valid);
  assert.equal(validateCardNumber('4242 4242 4242 4242').brand, 'visa');
  assert.ok(!validateCardNumber('4242 4242 4242 4241').valid); // bad luhn
  assert.ok(!validateCardNumber('42424242').valid); // bad length
  assert.ok(!validateCardNumber('1234567890123452').valid); // unknown brand
});

test('CVV follows network spec (3 vs 4)', () => {
  assert.ok(validateCvv('123', 'visa').valid);
  assert.ok(!validateCvv('1234', 'visa').valid); // visa wants 3
  assert.ok(validateCvv('1234', 'amex').valid); // amex wants 4
  assert.ok(!validateCvv('123', 'amex').valid);
  assert.ok(!validateCvv('12', null).valid);
});

test('expiry validation', () => {
  const now = new Date('2026-06-10');
  assert.ok(validateExpiry('12', '30', now).valid);
  assert.ok(validateExpiry('06', '26', now).valid); // current month ok
  assert.ok(!validateExpiry('05', '26', now).valid); // past
  assert.ok(!validateExpiry('13', '30', now).valid); // bad month
  assert.ok(!validateExpiry('12', '2099', now).valid); // too far out
});

test('postal code / AVS', () => {
  assert.ok(validatePostalCode('94107').valid);
  assert.ok(validatePostalCode('94107-1234').valid);
  assert.ok(!validatePostalCode('9410').valid);
  assert.ok(validatePostalCode('K1A 0B1', 'CA').valid);
});

test('card number formatting', () => {
  assert.equal(formatCardNumber('4242424242424242'), '4242 4242 4242 4242');
  assert.equal(formatCardNumber('378282246310005'), '3782 822463 10005'); // amex grouping
});

test('ABA routing number checksum', () => {
  assert.ok(validateRoutingNumber('011000015').valid); // real Fed routing
  assert.ok(validateRoutingNumber('021000021').valid); // Chase
  assert.ok(!validateRoutingNumber('011000016').valid); // bad checksum
  assert.ok(!validateRoutingNumber('12345').valid); // wrong length
  assert.ok(!validateRoutingNumber('991000010').valid); // bad lead range
});

test('account number bounds', () => {
  assert.ok(validateAccountNumber('123456').valid);
  assert.ok(!validateAccountNumber('123').valid);
  assert.ok(!validateAccountNumber('1'.repeat(18)).valid);
});

test('validateAch aggregate', () => {
  const ok = validateAch({
    routingNumber: '011000015', accountNumber: '123456789',
    accountType: 'checking', accountHolder: 'Ada',
  });
  assert.ok(ok.valid);
  const bad = validateAch({
    routingNumber: '1', accountNumber: '1', accountType: 'foo', accountHolder: '',
  });
  assert.ok(!bad.valid);
  assert.equal(Object.keys(bad.errors).length, 4);
});

test('ACH micro-deposit verification — happy path', async () => {
  let seq = 0;
  const verifier = new AchVerifier({
    backend: createInMemoryBackend(),
    idGenerator: () => 'ach_test_' + ++seq,
  });
  const { id } = await verifier.initiate({
    routingNumber: '011000015', accountNumber: '000123456789',
    accountType: 'checking', accountHolder: 'Ada Lovelace',
  });
  const rec = await verifier.backend.getVerification(id);
  // confirm in reversed order to prove order-independence
  const res = await verifier.confirm(id, [...rec.expectedAmounts].reverse());
  assert.equal(res.status, ACH_STATUS.VERIFIED);
});

test('ACH verification — lockout after max attempts', async () => {
  const verifier = new AchVerifier({ backend: createInMemoryBackend(), maxAttempts: 3 });
  const { id } = await verifier.initiate({
    routingNumber: '011000015', accountNumber: '000123456789',
    accountType: 'checking', accountHolder: 'Ada',
  });
  let res;
  for (let i = 0; i < 3; i++) res = await verifier.confirm(id, [999, 999]);
  assert.equal(res.status, ACH_STATUS.FAILED);
  // further attempts stay failed
  res = await verifier.confirm(id, [1, 2]);
  assert.equal(res.status, ACH_STATUS.FAILED);
});

test('ACH initiate rejects invalid fields', async () => {
  const verifier = new AchVerifier({ backend: createInMemoryBackend() });
  await assert.rejects(
    () => verifier.initiate({ routingNumber: 'bad', accountNumber: '1', accountType: 'x', accountHolder: '' }),
    (err) => { assert.ok(err.fieldErrors); return true; }
  );
});

test('status never leaks expected amounts', async () => {
  const verifier = new AchVerifier({ backend: createInMemoryBackend() });
  const { id } = await verifier.initiate({
    routingNumber: '011000015', accountNumber: '000123456789',
    accountType: 'savings', accountHolder: 'Ada',
  });
  const s = await verifier.status(id);
  assert.equal(s.status, ACH_STATUS.PENDING);
  assert.equal(s.last4, '6789');
  assert.ok(!('expectedAmounts' in s));
});

test('security: HTTPS endpoint enforcement', () => {
  assert.ok(assertHttpsEndpoint('https://api.example.com/pay'));
  assert.ok(assertHttpsEndpoint('http://localhost:3000/pay')); // localhost dev allowed
  assert.throws(() => assertHttpsEndpoint('http://api.example.com/pay'));
  assert.throws(() => assertHttpsEndpoint('not a url'));
});

test('security: redaction & partitioning', () => {
  const red = redactForLogging({ cardNumber: '4242424242424242', cardName: 'Ada', cvv: '123' });
  assert.equal(red.cardNumber, '••••4242');
  assert.equal(red.cardName, 'Ada');
  assert.equal(red.cvv, '••••');

  const { secure, public: pub } = partitionSensitive({
    cardNumber: '4242', cvv: '123', cardName: 'Ada', postalCode: '94107',
  });
  assert.ok('cardNumber' in secure && 'cvv' in secure);
  assert.ok('cardName' in pub && 'postalCode' in pub);
});
