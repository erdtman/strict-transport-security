'use strict';

// What value each set of options produces. The response is a real
// http.ServerResponse rather than a stub, so what these read back is exactly
// what a server would send.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const STS = require('../');

test('the default policy lasts 30 days', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS()(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('an empty options object uses the default', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({})(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('null options use the default', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS(null)(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('a max-age in seconds is sent as given', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': 12345 })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=12345');
});

test('a zero max-age is kept, it is the RFC 6797 signal to delete the policy', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': 0 })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=0');
});

test('a max-age in days is sent as seconds', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': { days: 30 } })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('every time unit is added together', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': { seconds: 1, minutes: 1, hours: 1, days: 1 } })(null, res, () => {});

  // 1 + 60 + 3600 + 86400
  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=90061');
});

test('a zero time unit is kept', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': { seconds: 0 } })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=0');
});

test('the largest safe max-age is still written as digits', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': Number.MAX_SAFE_INTEGER })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=9007199254740991');
});

test('includeSubDomains adds its directive', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': 456789, includeSubDomains: true })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=456789; includeSubDomains');
});

test('preload adds its directive', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': 456789, preload: true })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=456789; preload');
});

test('includeSubDomains and preload are both added', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': 456789, includeSubDomains: true, preload: true })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=456789; includeSubDomains; preload');
});

test('the directive order does not follow the option order', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ preload: true, includeSubDomains: true, 'max-age': 1 })(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=1; includeSubDomains; preload');
});

test('no other header is set', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ 'max-age': 1, includeSubDomains: true, preload: true })(null, res, () => {});

  assert.deepStrictEqual(res.getHeaderNames(), ['strict-transport-security']);
});

// getSTSHeader is the compile step every factory is built from, and the one a
// framework with no factory here is written against, so what it returns is
// part of the public contract.

test('getSTSHeader compiles the options to the one header they are sent as', () => {
  assert.deepStrictEqual(STS.getSTSHeader({ 'max-age': 1 }), {
    name: 'Strict-Transport-Security',
    value: 'max-age=1',
    secureOnly: false
  });
});

test('getSTSHeader compiles the default policy', () => {
  assert.deepStrictEqual(STS.getSTSHeader(), {
    name: 'Strict-Transport-Security',
    value: 'max-age=2592000',
    secureOnly: false
  });
});

test('getSTSHeader compiles every directive', () => {
  assert.strictEqual(
    STS.getSTSHeader({ 'max-age': { days: 365 }, includeSubDomains: true, preload: true }).value,
    'max-age=31536000; includeSubDomains; preload'
  );
});

test('getSTSHeader reports secureOnly, so a hand written adapter can honour it', () => {
  // It is not part of the header value: it says when the header may be sent.
  assert.strictEqual(STS.getSTSHeader({ secureOnly: true }).secureOnly, true);
});

test('getSTSHeader reports a truthy secureOnly as the boolean true', () => {
  assert.strictEqual(STS.getSTSHeader({ secureOnly: 'yes' }).secureOnly, true);
});

test('getSTSHeader is frozen, so a caller cannot rewrite a shared header', () => {
  const header = STS.getSTSHeader({ 'max-age': 1 });

  assert.ok(Object.isFrozen(header));
  assert.throws(() => { header.value = 'max-age=0'; }, TypeError);
});
