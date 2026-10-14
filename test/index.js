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

function skipped (options, req) {
  const result = run(options, req);
  assert.strictEqual(result.headers, 0);
  assert.strictEqual(result.value, undefined);
  assert.deepStrictEqual(result.order, ['next']);
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

test('rejects a string as options', () => {
  assert.throws(() => STS.getSTS('nope'), TypeError);
});

test('rejects a number as options', () => {
  assert.throws(() => STS.getSTS(10), TypeError);
});

test('rejects a boolean as options', () => {
  assert.throws(() => STS.getSTS(true), TypeError);
});

test('rejects an array as options', () => {
  assert.throws(() => STS.getSTS([]), TypeError);
});

test('rejects a symbol as options', () => {
  assert.throws(() => STS.getSTS(Symbol('x')), TypeError);
});

test('rejects a function as options', () => {
  assert.throws(() => STS.getSTS(() => 1), TypeError);
});

test('rejects maxAge, the camelCase spelling of max-age', () => {
  assert.throws(() => STS.getSTS({ maxAge: 600 }), TypeError);
});

test('rejects includeSubdomains, the lowercase d spelling', () => {
  assert.throws(() => STS.getSTS({ includeSubdomains: true }), TypeError);
});

test('rejects secureonly, the lowercase o spelling', () => {
  assert.throws(() => STS.getSTS({ secureonly: true }), TypeError);
});

test('rejects a capitalized option name', () => {
  assert.throws(() => STS.getSTS({ Preload: true }), TypeError);
});

test('rejects an options object with several unknown keys', () => {
  assert.throws(() => STS.getSTS({ 'max-age': 1, foo: 1, bar: 2 }), TypeError);
});

test('rejects a string max-age, even a numeric one', () => {
  assert.throws(() => STS.getSTS({ 'max-age': '600' }), TypeError);
});

test('rejects a boolean max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': true }), TypeError);
});

test('rejects a symbol max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': Symbol('x') }), TypeError);
});

test('rejects a bigint max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': 10n }), TypeError);
});

test('rejects a function max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': () => 1 }), TypeError);
});

test('rejects a null max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': null }), TypeError);
});

test('rejects an array rather than treating it as an object of units', () => {
  assert.throws(() => STS.getSTS({ 'max-age': [1, 2] }), TypeError);
});

test('rejects an object with no recognized time units', () => {
  assert.throws(() => STS.getSTS({ 'max-age': {} }), TypeError);
});

test('rejects weeks, a unit this module does not support', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { days: 1, weeks: 2 } }), TypeError);
});

test('rejects a capitalized time unit', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { days: 1, Days: 2 } }), TypeError);
});

test('rejects a unit finer than seconds', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { days: 1, ms: 2 } }), TypeError);
});

test('rejects a max-age with several unknown time units', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { weeks: 1, months: 2 } }), TypeError);
});

test('rejects a negative max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': -1 }), RangeError);
});

test('rejects a fractional max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': 1.5 }), RangeError);
});

test('rejects NaN as a max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': NaN }), RangeError);
});

test('rejects Infinity as a max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': Infinity }), RangeError);
});

test('rejects -Infinity as a max-age', () => {
  assert.throws(() => STS.getSTS({ 'max-age': -Infinity }), RangeError);
});

test('rejects a max-age that would be written in exponential notation', () => {
  // Number.isInteger(1e21) is true, but `${1e21}` is "1e+21", which is not the
  // 1*DIGIT that RFC 6797 section 6.1.1 requires, so browsers drop the header.
  assert.throws(() => STS.getSTS({ 'max-age': 1e21 }), RangeError);
});

test('rejects the first max-age past the safe integer range', () => {
  assert.throws(() => STS.getSTS({ 'max-age': Number.MAX_SAFE_INTEGER + 1 }), RangeError);
});

test('rejects a max-age that has already lost precision', () => {
  // All digits, but no longer the number that was written.
  assert.throws(() => STS.getSTS({ 'max-age': 8.64e18 }), RangeError);
});

test('rejects time units that add up to an unsafe total', () => {
  // Each unit is a safe integer on its own; the product is not.
  assert.throws(() => STS.getSTS({ 'max-age': { days: 1e14 } }), RangeError);
});

test('rejects a negative time unit', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { minutes: -1 } }), RangeError);
});

test('rejects a fractional time unit', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { minutes: 1.5 } }), RangeError);
});

test('rejects NaN as a time unit', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { minutes: NaN } }), RangeError);
});

test('rejects Infinity as a time unit', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { minutes: Infinity } }), RangeError);
});

test('rejects a time unit that is not a number', () => {
  assert.throws(() => STS.getSTS({ 'max-age': { days: '1' } }), TypeError);
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
  skipped({ secureOnly: true }, { socket: {} });
});

test('secureOnly skips the header when the socket is null', () => {
  skipped({ secureOnly: true }, { socket: null });
});

test('secureOnly skips the header on a request with no socket at all', () => {
  skipped({ secureOnly: true }, {});
});

test('secureOnly skips the header when there is no request object', () => {
  skipped({ secureOnly: true }, null);
});

test('req.secure wins over the socket when both are present', () => {
  skipped({ secureOnly: true }, { secure: false, socket: { encrypted: true } });
});

test('without secureOnly the header is set on an insecure request', () => {
  const value = header({}, { secure: false });
  assert.strictEqual(value, 'max-age=2592000');
});
