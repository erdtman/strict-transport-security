'use strict';

// getSTS validates when the middleware is created, so a bad configuration
// throws at startup rather than emitting a policy nobody asked for. These
// tests assert the error type only: the wording is checked, loosely, in
// test/docs.test.js, where keeping the README honest is the point.

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

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
  // 1e14 is a safe integer; 1e14 days in seconds is not.
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

// The cases above cover what is rejected, through getSTS. Every other factory
// validates through the same compile step, so what is left to pin is that each
// entry point does it when it is built -- which is the README's claim, and the
// reason a malformed policy cannot reach a response. Stated once, against
// every export, so a factory added later is covered without being added here.

for (const name of Object.keys(STS)) {
  test(`${name} rejects an unknown option when it is built`, () => {
    assert.throws(() => STS[name]({ maxAge: 600 }), TypeError);
  });

  test(`${name} rejects an out of range max-age when it is built`, () => {
    assert.throws(() => STS[name]({ 'max-age': -1 }), RangeError);
  });
}
