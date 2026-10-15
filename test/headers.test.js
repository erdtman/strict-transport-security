'use strict';

// getHeadersSTS, for the runtimes with no node response object at all: Next.js
// middleware, h3 and Nitro, Cloudflare Workers, Deno, Bun and Elysia. The
// tests use a real Headers, Request and Response, so the adapter is checked
// against the platform rather than against a guess at it.

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

test('the header is set on a Headers object', () => {
  const headers = new Headers();

  STS.getHeadersSTS({ 'max-age': 1 })(headers);

  assert.deepStrictEqual([...headers], [['strict-transport-security', 'max-age=1']]);
});

test('the default policy lasts 30 days, as it does on express', () => {
  const headers = new Headers();

  STS.getHeadersSTS()(headers);

  assert.strictEqual(headers.get('strict-transport-security'), 'max-age=2592000');
});

test('the applier sets the header the compiled policy asks for', () => {
  const headers = new Headers();
  const options = { 'max-age': { days: 365 }, includeSubDomains: true, preload: true };

  STS.getHeadersSTS(options)(headers);

  assert.strictEqual(headers.get('strict-transport-security'), STS.getSTSHeader(options).value);
});

test('the header is set on a Response, which is how these runtimes send one', () => {
  const response = new Response('ok');

  STS.getHeadersSTS({ 'max-age': 1 })(response.headers);

  assert.strictEqual(response.headers.get('Strict-Transport-Security'), 'max-age=1');
});

test('nothing is returned: the headers handed in are mutated', () => {
  assert.strictEqual(STS.getHeadersSTS()(new Headers()), undefined);
});

test('a policy already on the headers is replaced, not appended to', () => {
  const headers = new Headers({ 'strict-transport-security': 'max-age=1' });

  STS.getHeadersSTS({ 'max-age': 2 })(headers);

  assert.deepStrictEqual([...headers], [['strict-transport-security', 'max-age=2']]);
});

test('headers belonging to someone else are left alone', () => {
  const headers = new Headers({ 'x-frame-options': 'DENY' });

  STS.getHeadersSTS({ 'max-age': 1 })(headers);

  assert.strictEqual(headers.get('x-frame-options'), 'DENY');
});

test('the policy is compiled once, when the applier is built', () => {
  const options = { 'max-age': 1 };
  const applySTS = STS.getHeadersSTS(options);
  const headers = new Headers();

  options['max-age'] = 999;
  options.preload = true;
  applySTS(headers);

  assert.strictEqual(headers.get('strict-transport-security'), 'max-age=1');
});

test('the applier holds no per-request state, so it is reusable', () => {
  const applySTS = STS.getHeadersSTS({ 'max-age': 1 });
  const first = new Headers();
  const second = new Headers();

  applySTS(first);
  applySTS(second);

  assert.deepStrictEqual([...second], [...first]);
});

test('invalid options are rejected when the applier is built', () => {
  assert.throws(() => STS.getHeadersSTS({ maxAge: 600 }), TypeError);
});

test('an invalid max-age is rejected when the applier is built', () => {
  assert.throws(() => STS.getHeadersSTS({ 'max-age': -1 }), RangeError);
});

test('secureOnly sends the header for an https Request', () => {
  const headers = new Headers();

  STS.getHeadersSTS({ secureOnly: true })(headers, new Request('https://example.test/'));

  assert.strictEqual(headers.get('strict-transport-security'), 'max-age=2592000');
});

test('secureOnly skips the header for an http Request', () => {
  // The URL is http behind a TLS-terminating proxy, which nothing in the Fetch
  // API resolves for us. The README says so.
  const headers = new Headers();

  STS.getHeadersSTS({ secureOnly: true })(headers, new Request('http://example.test/'));

  assert.deepStrictEqual([...headers], []);
});

test('secureOnly accepts a URL in place of a request', () => {
  const headers = new Headers();

  STS.getHeadersSTS({ secureOnly: true })(headers, new URL('https://example.test/'));

  assert.strictEqual(headers.get('strict-transport-security'), 'max-age=2592000');
});

test('secureOnly accepts a URL string in place of a request', () => {
  const headers = new Headers();

  STS.getHeadersSTS({ secureOnly: true })(headers, 'https://example.test/');

  assert.strictEqual(headers.get('strict-transport-security'), 'max-age=2592000');
});

test('secureOnly matches the scheme of a hand written URL case insensitively', () => {
  // A URL parsed by the platform always lowercases its scheme; a string a
  // caller typed need not.
  const headers = new Headers();

  STS.getHeadersSTS({ secureOnly: true })(headers, 'HTTPS://example.test/');

  assert.strictEqual(headers.get('strict-transport-security'), 'max-age=2592000');
});

test('secureOnly skips the header for a URL that is neither http nor https', () => {
  const headers = new Headers();

  STS.getHeadersSTS({ secureOnly: true })(headers, 'file:///tmp/page.html');

  assert.deepStrictEqual([...headers], []);
});

test('secureOnly with no request at all throws rather than guess', () => {
  // Sending the header anyway would break the one promise secureOnly makes,
  // and skipping it silently would leave a policy that never ships.
  assert.throws(() => STS.getHeadersSTS({ secureOnly: true })(new Headers()), TypeError);
});

test('secureOnly throws on a request with no URL to read', () => {
  assert.throws(() => STS.getHeadersSTS({ secureOnly: true })(new Headers(), {}), TypeError);
});

test('without secureOnly the request may be left out entirely', () => {
  const headers = new Headers();

  STS.getHeadersSTS({ 'max-age': 1 })(headers);

  assert.strictEqual(headers.get('strict-transport-security'), 'max-age=1');
});
