'use strict';

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

function run (options, req) {
  const result = { nextCalls: 0, headers: 0 };
  const res = {
    setHeader: (name, value) => {
      result.headers++;
      result.name = name;
      result.value = value;
    }
  };
  STS.getSTS(options)(req === undefined ? null : req, res, () => {
    result.nextCalls++;
  });
  return result;
}

function header (options, req) {
  const result = run(options, req);
  assert.strictEqual(result.name, 'Strict-Transport-Security');
  assert.strictEqual(result.headers, 1);
  assert.strictEqual(result.nextCalls, 1);
  return result.value;
}

test('default', () => {
  assert.strictEqual(header(), 'max-age=2592000');
});

test('empty options object uses the default', () => {
  assert.strictEqual(header({}), 'max-age=2592000');
});

test('set direct', () => {
  assert.strictEqual(header({ 'max-age': 12345 }), 'max-age=12345');
});

test('zero is kept, it is the RFC 6797 signal to delete the policy', () => {
  assert.strictEqual(header({ 'max-age': 0 }), 'max-age=0');
});

test('all time parameters', () => {
  const options = {
    'max-age': { seconds: 1, minutes: 1, hours: 1, days: 1 }
  };
  assert.strictEqual(header(options), 'max-age=90061');
});

test('a single time unit', () => {
  assert.strictEqual(header({ 'max-age': { days: 30 } }), 'max-age=2592000');
});

test('a zero time unit', () => {
  assert.strictEqual(header({ 'max-age': { seconds: 0 } }), 'max-age=0');
});

test('include subdomains', () => {
  const options = { 'max-age': 456789, includeSubDomains: true };
  assert.strictEqual(header(options), 'max-age=456789; includeSubDomains');
});

test('preload', () => {
  const options = { 'max-age': 456789, preload: true };
  assert.strictEqual(header(options), 'max-age=456789; preload');
});

test('include subdomains and preload', () => {
  const options = {
    'max-age': 456789,
    includeSubDomains: true,
    preload: true
  };
  assert.strictEqual(header(options), 'max-age=456789; includeSubDomains; preload');
});

test('directives are ordered independently of the option order', () => {
  const options = {
    preload: true,
    includeSubDomains: true,
    'max-age': 1
  };
  assert.strictEqual(header(options), 'max-age=1; includeSubDomains; preload');
});

test('the header is compiled once and reused', () => {
  const sts = STS.getSTS({ 'max-age': 1 });
  const values = [];
  const res = { setHeader: (name, value) => values.push(value) };
  sts(null, res, () => {});
  sts(null, res, () => {});
  assert.deepStrictEqual(values, ['max-age=1', 'max-age=1']);
});

test('rejects a max-age that is not a number or object', () => {
  const bad = ['600', true, Symbol('x'), 10n, () => 1];
  for (const value of bad) {
    assert.throws(() => STS.getSTS({ 'max-age': value }), {
      name: 'TypeError',
      message: /must be a number or an object of time units/
    }, `expected ${String(value)} to be rejected`);
  }
});

test('rejects null and arrays rather than treating them as objects', () => {
  for (const value of [null, [], [1, 2]]) {
    assert.throws(() => STS.getSTS({ 'max-age': value }), {
      name: 'TypeError',
      message: /must be a number or an object of time units/
    }, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('rejects an object with no recognized time units', () => {
  for (const value of [{}, { weeks: 2 }, { Days: 1 }]) {
    assert.throws(() => STS.getSTS({ 'max-age': value }), {
      name: 'TypeError',
      message: /no recognized time units, expected one of seconds, minutes, hours, days/
    }, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('rejects a non-integer or negative max-age', () => {
  for (const value of [-1, 1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => STS.getSTS({ 'max-age': value }), {
      name: 'RangeError',
      message: /must be a non-negative integer/
    }, `expected ${value} to be rejected`);
  }
});

test('rejects a non-integer or negative time unit', () => {
  for (const value of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => STS.getSTS({ 'max-age': { minutes: value } }), {
      name: 'RangeError',
      message: /options\['max-age'\]\.minutes must be a non-negative integer/
    }, `expected minutes: ${value} to be rejected`);
  }
});

test('rejects a time unit that is not a number', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { days: '1' } }), {
    name: 'TypeError',
    message: /options\['max-age'\]\.days must be a number, got a string/
  });
});

test('names null in the error message instead of calling it an object', () => {
  assert.throws(() => STS.getSTS({ 'max-age': null }), {
    message: /got null$/
  });
});

test('secureOnly skips the header on an insecure request', () => {
  const result = run({ secureOnly: true }, { secure: false });
  assert.strictEqual(result.headers, 0);
  assert.strictEqual(result.value, undefined);
  assert.strictEqual(result.nextCalls, 1);
});

test('secureOnly sets the header on a secure express request', () => {
  const value = header({ secureOnly: true }, { secure: true });
  assert.strictEqual(value, 'max-age=2592000');
});

test('secureOnly falls back to the raw socket when req.secure is absent', () => {
  const value = header({ secureOnly: true }, { socket: { encrypted: true } });
  assert.strictEqual(value, 'max-age=2592000');
});

test('secureOnly honours the legacy req.connection alias', () => {
  const value = header({ secureOnly: true }, { connection: { encrypted: true } });
  assert.strictEqual(value, 'max-age=2592000');
});

test('secureOnly skips the header on an unencrypted socket', () => {
  for (const req of [{ socket: {} }, { socket: null }, {}, null]) {
    const result = run({ secureOnly: true }, req);
    assert.strictEqual(result.headers, 0, `expected ${JSON.stringify(req)} to be skipped`);
    assert.strictEqual(result.nextCalls, 1);
  }
});

test('req.secure wins over the socket when both are present', () => {
  const req = { secure: false, socket: { encrypted: true } };
  const result = run({ secureOnly: true }, req);
  assert.strictEqual(result.headers, 0);
});

test('without secureOnly the header is set on an insecure request', () => {
  const value = header({}, { secure: false });
  assert.strictEqual(value, 'max-age=2592000');
});
