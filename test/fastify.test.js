'use strict';

// The fastify onRequest hook: how it sets the header, how it hands control on,
// and where it reads the scheme from under secureOnly. test/frameworks.test.js
// runs the same hook against a real fastify instance, but only when fastify is
// installed, so everything that has to hold on every run is asserted here.

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

test('the hook sets the header through reply.header', () => {
  const calls = [];

  STS.getFastifySTS({ 'max-age': 1 })({}, { header: (name, value) => calls.push([name, value]) }, () => {});

  assert.deepStrictEqual(calls, [['Strict-Transport-Security', 'max-age=1']]);
});

test('the default policy lasts 30 days, as it does on express', () => {
  const headers = new Map();

  STS.getFastifySTS()({}, { header: (name, value) => headers.set(name, value) }, () => {});

  assert.deepStrictEqual([...headers], [['Strict-Transport-Security', 'max-age=2592000']]);
});

test('the hook sets the header the compiled policy asks for', () => {
  const headers = new Map();
  const options = { 'max-age': { days: 365 }, includeSubDomains: true, preload: true };

  STS.getFastifySTS(options)({}, { header: (name, value) => headers.set(name, value) }, () => {});

  assert.strictEqual(headers.get('Strict-Transport-Security'), STS.getSTSHeader(options).value);
});

test('done() is called once, with no arguments', () => {
  // An argument would look like an error to fastify and abort the request.
  const done = [];

  STS.getFastifySTS()({}, { header: () => {} }, (...args) => done.push(args));

  assert.deepStrictEqual(done, [[]]);
});

test('done() is called rather than a promise returned, so it suits both hook styles', () => {
  const returned = STS.getFastifySTS()({}, { header: () => {} }, () => {});

  assert.strictEqual(returned, undefined);
});

test('two hooks leave one header, the one that ran last', () => {
  // Stacking two is not advice: HSTS is a per-host policy, so an application
  // sends one. But RFC 6797 section 7.1 allows only one STS header field in a
  // response, so where two are mounted anyway the result has to be one header,
  // and predictably the later one.
  const headers = new Map();
  const reply = { header: (name, value) => headers.set(name, value) };

  STS.getFastifySTS({ 'max-age': 1 })({}, reply, () => {});
  STS.getFastifySTS({ 'max-age': 2 })({}, reply, () => {});

  assert.deepStrictEqual([...headers], [['Strict-Transport-Security', 'max-age=2']]);
});

test('the policy is compiled once, when the hook is built', () => {
  const options = { 'max-age': 1 };
  const hook = STS.getFastifySTS(options);
  const headers = new Map();

  options['max-age'] = 999;
  options.preload = true;
  hook({}, { header: (name, value) => headers.set(name, value) }, () => {});

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=1');
});

test('the hook holds no per-request state, so it is reusable', () => {
  const hook = STS.getFastifySTS({ 'max-age': 1 });
  const first = new Map();
  const second = new Map();

  hook({}, { header: (name, value) => first.set(name, value) }, () => {});
  hook({}, { header: (name, value) => second.set(name, value) }, () => {});

  assert.deepStrictEqual([...second], [...first]);
});

test('invalid options are rejected when the hook is built', () => {
  assert.throws(() => STS.getFastifySTS({ maxAge: 600 }), TypeError);
});

test('an invalid max-age is rejected when the hook is built', () => {
  assert.throws(() => STS.getFastifySTS({ 'max-age': -1 }), RangeError);
});

test('secureOnly sends the header when fastify reports https', () => {
  const headers = new Map();

  STS.getFastifySTS({ secureOnly: true })(
    { protocol: 'https' },
    { header: (name, value) => headers.set(name, value) },
    () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly skips the header when fastify reports http', () => {
  // request.protocol is fastify's own and honours trustProxy, so behind a
  // proxy that sets X-Forwarded-Proto this is the resolved scheme.
  const headers = new Map();

  STS.getFastifySTS({ secureOnly: true })(
    { protocol: 'http' },
    { header: (name, value) => headers.set(name, value) },
    () => {}
  );

  assert.deepStrictEqual([...headers], []);
});

test('secureOnly falls back to the raw socket when there is no request.protocol', () => {
  const headers = new Map();

  STS.getFastifySTS({ secureOnly: true })(
    { raw: { socket: { encrypted: true } } },
    { header: (name, value) => headers.set(name, value) },
    () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly skips the header on an unencrypted raw socket', () => {
  const headers = new Map();

  STS.getFastifySTS({ secureOnly: true })(
    { raw: { socket: {} } },
    { header: (name, value) => headers.set(name, value) },
    () => {}
  );

  assert.deepStrictEqual([...headers], []);
});

test('secureOnly skips the header on a request it can learn nothing from', () => {
  const headers = new Map();

  STS.getFastifySTS({ secureOnly: true })({}, { header: (name, value) => headers.set(name, value) }, () => {});

  assert.deepStrictEqual([...headers], []);
});

test('done() is called once when secureOnly skips the header', () => {
  const done = [];

  STS.getFastifySTS({ secureOnly: true })({ protocol: 'http' }, { header: () => {} }, (...args) => done.push(args));

  assert.deepStrictEqual(done, [[]]);
});

test('without secureOnly the scheme is never consulted', () => {
  const headers = new Map();

  STS.getFastifySTS({ 'max-age': 1 })(
    { protocol: 'http' },
    { header: (name, value) => headers.set(name, value) },
    () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=1');
});
