'use strict';

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

// RFC 6797 section 6.1: the directives are max-age (1*DIGIT, so no
// exponential notation), then the optional valueless directives.
const GRAMMAR = /^max-age=\d+(; includeSubDomains)?(; preload)?$/;

function run (options, req) {
  const result = { nextCalls: 0, headers: 0, order: [], nextArgs: null };
  const res = {
    setHeader: (...args) => {
      result.headers++;
      result.order.push('setHeader');
      result.setHeaderArgs = args;
      result.name = args[0];
      result.value = args[1];
    }
  };
  STS.getSTS(options)(req === undefined ? null : req, res, (...args) => {
    result.nextCalls++;
    result.order.push('next');
    result.nextArgs = args;
  });
  return result;
}

function skipped (options, req, message) {
  const result = run(options, req);
  assert.strictEqual(result.headers, 0, message);
  assert.strictEqual(result.value, undefined, message);
  assert.deepStrictEqual(result.order, ['next'], message);
  assert.deepStrictEqual(result.nextArgs, [], 'next() must be called with no arguments');
  return result;
}

function header (options, req) {
  const result = run(options, req);
  assert.strictEqual(result.name, 'Strict-Transport-Security');
  assert.strictEqual(result.headers, 1);
  assert.strictEqual(result.nextCalls, 1);
  assert.strictEqual(result.setHeaderArgs.length, 2, 'setHeader takes a name and a value');
  // Downstream middleware may flush the response, so the header has to be set
  // before next() runs, and next() must not look like an error callback.
  assert.deepStrictEqual(result.order, ['setHeader', 'next']);
  assert.deepStrictEqual(result.nextArgs, [], 'next() must be called with no arguments');
  assert.match(result.value, GRAMMAR);
  return result.value;
}

test('default', () => {
  assert.strictEqual(header(), 'max-age=2592000');
});

test('empty options object uses the default', () => {
  assert.strictEqual(header({}), 'max-age=2592000');
});

test('null options use the default', () => {
  assert.strictEqual(header(null), 'max-age=2592000');
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

test('the largest safe max-age is still all digits', () => {
  const value = header({ 'max-age': Number.MAX_SAFE_INTEGER });
  assert.strictEqual(value, 'max-age=9007199254740991');
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

test('getSTS exposes nothing but getSTS', () => {
  assert.deepStrictEqual(Object.keys(STS), ['getSTS']);
  assert.strictEqual(typeof STS.getSTS, 'function');
});

test('the middleware takes three arguments', () => {
  // connect and express treat a four-argument function as error middleware,
  // so the arity is part of the public contract.
  assert.strictEqual(STS.getSTS().length, 3);
});

test('getSTS does not mutate the options it is given', () => {
  const options = { 'max-age': { days: 1 }, includeSubDomains: true };
  const before = structuredClone(options);
  STS.getSTS(options);
  assert.deepStrictEqual(options, before);
});

test('later changes to the options object do not change the header', () => {
  const options = { 'max-age': 1 };
  const sts = STS.getSTS(options);
  options['max-age'] = 999;
  options.preload = true;
  const values = [];
  sts(null, { setHeader: (name, value) => values.push(value) }, () => {});
  assert.deepStrictEqual(values, ['max-age=1']);
});

test('rejects options that are not an object', () => {
  for (const value of ['nope', 10, true, [], Symbol('x'), () => 1]) {
    assert.throws(() => STS.getSTS(value), {
      name: 'TypeError',
      message: /^options must be an object, got /
    }, `expected ${String(value)} to be rejected`);
  }
});

test('rejects an unknown option rather than silently ignoring it', () => {
  for (const key of ['maxAge', 'includeSubdomains', 'secureonly', 'Preload', 'maxAgeSeconds']) {
    assert.throws(() => STS.getSTS({ [key]: 1 }), {
      name: 'TypeError',
      message: new RegExp(`^unknown option '${key}', expected one of max-age, includeSubDomains, preload, secureOnly$`)
    }, `expected ${key} to be rejected`);
  }
});

test('names every unknown option at once', () => {
  assert.throws(() => STS.getSTS({ 'max-age': 1, foo: 1, bar: 2 }), {
    name: 'TypeError',
    message: /^unknown options 'foo', 'bar', expected one of /
  });
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
  assert.throws(() => STS.getSTS({ 'max-age': {} }), {
    name: 'TypeError',
    message: /no recognized time units, expected one of seconds, minutes, hours, days/
  });
});

test('rejects an unknown time unit rather than silently ignoring it', () => {
  for (const unit of ['weeks', 'Days', 'ms']) {
    assert.throws(() => STS.getSTS({ 'max-age': { days: 1, [unit]: 2 } }), {
      name: 'TypeError',
      message: new RegExp(`^options\\['max-age'\\] has unknown time unit '${unit}', expected one of seconds, minutes, hours, days$`)
    }, `expected ${unit} to be rejected`);
  }
});

test('names every unknown time unit at once', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { weeks: 1, months: 2 } }), {
    name: 'TypeError',
    message: /^options\['max-age'\] has unknown time units 'weeks', 'months', expected one of /
  });
});

test('rejects a non-integer or negative max-age', () => {
  for (const value of [-1, 1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => STS.getSTS({ 'max-age': value }), {
      name: 'RangeError',
      message: /must be a non-negative integer/
    }, `expected ${value} to be rejected`);
  }
});

test('rejects a max-age that cannot be written as digits', () => {
  // Number.isInteger(1e21) is true, but `${1e21}` is "1e+21", which is not the
  // 1*DIGIT that RFC 6797 section 6.1.1 requires, so browsers drop the header.
  for (const value of [1e21, Number.MAX_SAFE_INTEGER + 1, 8.64e18]) {
    assert.throws(() => STS.getSTS({ 'max-age': value }), {
      name: 'RangeError',
      message: /must be a non-negative integer no greater than 9007199254740991/
    }, `expected ${value} to be rejected`);
  }
});

test('rejects time units that add up to an unsafe total', () => {
  // Each unit is a safe integer on its own; the product is not.
  assert.throws(() => STS.getSTS({ 'max-age': { days: 1e14 } }), {
    name: 'RangeError',
    message: /^options\['max-age'\] in seconds must be a non-negative integer no greater than 9007199254740991, got 8640000000000000000$/
  });
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
  skipped({ secureOnly: true }, { secure: false });
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
    skipped({ secureOnly: true }, req, `expected ${JSON.stringify(req)} to be skipped`);
  }
});

test('req.secure wins over the socket when both are present', () => {
  skipped({ secureOnly: true }, { secure: false, socket: { encrypted: true } });
});

test('without secureOnly the header is set on an insecure request', () => {
  const value = header({}, { secure: false });
  assert.strictEqual(value, 'max-age=2592000');
});
