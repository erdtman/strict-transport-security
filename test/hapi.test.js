'use strict';

// The hapi onPreResponse extension: where it puts the header on a normal and
// on an error response, that it returns h.continue, and where it reads the
// scheme from under secureOnly. test/frameworks.test.js runs the same
// extension against a real hapi server, but only when hapi is installed, so
// everything that has to hold on every run is asserted here.

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

// Stands in for hapi's own continue symbol.
const CONTINUE = Symbol('continue');

const SECURE = { url: new URL('https://example.test/') };

test('the header is set on the response headers object', () => {
  const headers = {};

  STS.getHapiSTS({ 'max-age': 1 })({ ...SECURE, response: { headers } }, { continue: CONTINUE });

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=1' });
});

test('the default policy lasts 30 days, as it does on express', () => {
  const headers = {};

  STS.getHapiSTS()({ ...SECURE, response: { headers } }, { continue: CONTINUE });

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=2592000' });
});

test('the extension sets the header the compiled policy asks for', () => {
  const headers = {};
  const options = { 'max-age': { days: 365 }, includeSubDomains: true, preload: true };

  STS.getHapiSTS(options)({ ...SECURE, response: { headers } }, { continue: CONTINUE });

  assert.strictEqual(headers['Strict-Transport-Security'], STS.getSTSHeader(options).value);
});

test('h.continue is returned, which is how a hapi extension hands control on', () => {
  const returned = STS.getHapiSTS()({ ...SECURE, response: { headers: {} } }, { continue: CONTINUE });

  assert.strictEqual(returned, CONTINUE);
});

test('the header is set on an error response too, where Boom keeps its headers', () => {
  // hapi serves 404s and 500s itself, so an extension that only handled normal
  // responses would let every error page out with no policy.
  const headers = {};

  STS.getHapiSTS({ 'max-age': 1 })(
    { ...SECURE, response: { isBoom: true, output: { headers } } },
    { continue: CONTINUE }
  );

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=1' });
});

test('a header another extension left is replaced, whatever case it used', () => {
  // hapi lowercases the names it is given, so an earlier policy is rarely
  // spelled the way this library spells it, and two spellings of one name
  // would go out as two headers.
  const headers = { 'strict-transport-security': 'max-age=1' };

  STS.getHapiSTS({ 'max-age': 2 })({ ...SECURE, response: { headers } }, { continue: CONTINUE });

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=2' });
});

test('headers belonging to someone else are left alone', () => {
  const headers = { 'x-frame-options': 'DENY', 'Cache-Control': 'no-store' };

  STS.getHapiSTS({ 'max-age': 1 })({ ...SECURE, response: { headers } }, { continue: CONTINUE });

  assert.deepStrictEqual(headers, {
    'x-frame-options': 'DENY',
    'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=1'
  });
});

test('two extensions leave one header, the one that ran last', () => {
  // Stacking two is not advice: HSTS is a per-host policy, so an application
  // sends one. But RFC 6797 section 7.1 allows only one STS header field in a
  // response, so where two are mounted anyway the result has to be one header,
  // and predictably the later one.
  const headers = {};
  const request = { ...SECURE, response: { headers } };

  STS.getHapiSTS({ 'max-age': 1 })(request, { continue: CONTINUE });
  STS.getHapiSTS({ 'max-age': 2 })(request, { continue: CONTINUE });

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=2' });
});

test('the policy is compiled once, when the extension is built', () => {
  const options = { 'max-age': 1 };
  const extension = STS.getHapiSTS(options);
  const headers = {};

  options['max-age'] = 999;
  options.preload = true;
  extension({ ...SECURE, response: { headers } }, { continue: CONTINUE });

  assert.strictEqual(headers['Strict-Transport-Security'], 'max-age=1');
});

test('the extension holds no per-request state, so it is reusable', () => {
  const extension = STS.getHapiSTS({ 'max-age': 1 });
  const first = {};
  const second = {};

  extension({ ...SECURE, response: { headers: first } }, { continue: CONTINUE });
  extension({ ...SECURE, response: { headers: second } }, { continue: CONTINUE });

  assert.deepStrictEqual(second, first);
});

test('invalid options are rejected when the extension is built', () => {
  assert.throws(() => STS.getHapiSTS({ secureonly: true }), TypeError);
});

test('an invalid max-age is rejected when the extension is built', () => {
  assert.throws(() => STS.getHapiSTS({ 'max-age': Number.MAX_SAFE_INTEGER + 1 }), RangeError);
});

test('secureOnly sends the header when the request URL is https', () => {
  const headers = {};

  STS.getHapiSTS({ secureOnly: true })({ ...SECURE, response: { headers } }, { continue: CONTINUE });

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=2592000' });
});

test('secureOnly skips the header when the request URL is http', () => {
  // request.url is the URL hapi itself resolved, so it reflects whatever proxy
  // handling the server is configured for.
  const headers = {};

  STS.getHapiSTS({ secureOnly: true })(
    { url: new URL('http://example.test/'), response: { headers } },
    { continue: CONTINUE }
  );

  assert.deepStrictEqual(headers, {});
});

test('secureOnly falls back to the node request behind request.raw', () => {
  const headers = {};

  STS.getHapiSTS({ secureOnly: true })(
    { raw: { req: { socket: { encrypted: true } } }, response: { headers } },
    { continue: CONTINUE }
  );

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=2592000' });
});

test('secureOnly skips the header on a request it can learn nothing from', () => {
  const headers = {};

  STS.getHapiSTS({ secureOnly: true })({ response: { headers } }, { continue: CONTINUE });

  assert.deepStrictEqual(headers, {});
});

test('h.continue is returned when secureOnly skips the header', () => {
  const returned = STS.getHapiSTS({ secureOnly: true })(
    { response: { headers: {} } },
    { continue: CONTINUE }
  );

  assert.strictEqual(returned, CONTINUE);
});

test('without secureOnly the scheme is never consulted', () => {
  const headers = {};

  STS.getHapiSTS({ 'max-age': 1 })(
    { url: new URL('http://example.test/'), response: { headers } },
    { continue: CONTINUE }
  );

  assert.deepStrictEqual(headers, { 'Strict-Transport-Security': 'max-age=1' });
});
