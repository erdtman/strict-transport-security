'use strict';

// The hono middleware: how it sets the header, that it sets it before
// awaiting next(), and where it reads the scheme from under secureOnly.
// test/frameworks.test.js runs the same middleware against a real hono app,
// but only when hono is installed, so everything that has to hold on every
// run is asserted here.

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

const INSECURE = { req: { url: 'http://example.test/' } };
const SECURE = { req: { url: 'https://example.test/' } };

test('the middleware sets the header through c.header', async () => {
  const calls = [];

  await STS.getHonoSTS({ 'max-age': 1 })(
    { ...INSECURE, header: (name, value) => calls.push([name, value]) },
    async () => {}
  );

  assert.deepStrictEqual(calls, [['Strict-Transport-Security', 'max-age=1']]);
});

test('the default policy lasts 30 days, as it does on express', async () => {
  const headers = new Map();

  await STS.getHonoSTS()({ ...INSECURE, header: (name, value) => headers.set(name, value) }, async () => {});

  assert.deepStrictEqual([...headers], [['Strict-Transport-Security', 'max-age=2592000']]);
});

test('the middleware sets the header the compiled policy asks for', async () => {
  const headers = new Map();
  const options = { 'max-age': { days: 365 }, includeSubDomains: true, preload: true };

  await STS.getHonoSTS(options)(
    { ...INSECURE, header: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), STS.getSTSHeader(options).value);
});

test('the downstream promise is returned', async () => {
  let finished = false;

  const returned = STS.getHonoSTS()({ ...INSECURE, header: () => {} }, async () => { finished = true; });

  assert.ok(returned instanceof Promise);
  await returned;
  assert.ok(finished);
});

test('next() is called once, with no arguments', async () => {
  const next = [];

  await STS.getHonoSTS()({ ...INSECURE, header: () => {} }, async (...args) => next.push(args));

  assert.deepStrictEqual(next, [[]]);
});

test('the header is set before next() is awaited, not after', async () => {
  // Hono unwinds outermost-last, so a header set after next() would be the
  // app-wide policy overwriting the route-local one. Asserting it is already
  // there when the handler runs is what pins the order.
  const headers = new Map();
  let headerDuringHandler;

  await STS.getHonoSTS({ 'max-age': 1 })(
    { ...INSECURE, header: (name, value) => headers.set(name, value) },
    async () => { headerDuringHandler = headers.get('Strict-Transport-Security'); }
  );

  assert.strictEqual(headerDuringHandler, 'max-age=1');
});

test('two middlewares leave one header, the inner one', async () => {
  // Stacking two is not advice: HSTS is a per-host policy, so an application
  // sends one. But RFC 6797 section 7.1 allows only one STS header field in a
  // response, so where two are mounted anyway the result has to be one header,
  // and predictably the later one.
  const headers = new Map();
  const c = { ...INSECURE, header: (name, value) => headers.set(name, value) };
  const local = STS.getHonoSTS({ 'max-age': 2 });

  await STS.getHonoSTS({ 'max-age': 1 })(c, () => local(c, async () => {}));

  assert.deepStrictEqual([...headers], [['Strict-Transport-Security', 'max-age=2']]);
});

test('the policy is compiled once, when the middleware is built', async () => {
  const options = { 'max-age': 1 };
  const middleware = STS.getHonoSTS(options);
  const headers = new Map();

  options['max-age'] = 999;
  options.preload = true;
  await middleware({ ...INSECURE, header: (name, value) => headers.set(name, value) }, async () => {});

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=1');
});

test('the middleware holds no per-request state, so it is reusable', async () => {
  const middleware = STS.getHonoSTS({ 'max-age': 1 });
  const first = new Map();
  const second = new Map();

  await middleware({ ...INSECURE, header: (name, value) => first.set(name, value) }, async () => {});
  await middleware({ ...INSECURE, header: (name, value) => second.set(name, value) }, async () => {});

  assert.deepStrictEqual([...second], [...first]);
});

test('secureOnly sends the header when the request URL is https', async () => {
  const headers = new Map();

  await STS.getHonoSTS({ secureOnly: true })(
    { ...SECURE, header: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly skips the header when the request URL is http', async () => {
  // Hono has no trust proxy setting, so behind a TLS-terminating proxy this
  // URL is http and secureOnly suppresses the header. The README says so.
  const headers = new Map();

  await STS.getHonoSTS({ secureOnly: true })(
    { ...INSECURE, header: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.deepStrictEqual([...headers], []);
});

test('secureOnly skips the header when the request carries no URL', async () => {
  const headers = new Map();

  await STS.getHonoSTS({ secureOnly: true })(
    { req: {}, header: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.deepStrictEqual([...headers], []);
});

test('next() is still called when secureOnly skips the header', async () => {
  const next = [];

  await STS.getHonoSTS({ secureOnly: true })(
    { ...INSECURE, header: () => {} },
    async (...args) => next.push(args)
  );

  assert.deepStrictEqual(next, [[]]);
});

test('without secureOnly the scheme is never consulted', async () => {
  const headers = new Map();

  await STS.getHonoSTS({ 'max-age': 1 })(
    { ...INSECURE, header: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=1');
});
