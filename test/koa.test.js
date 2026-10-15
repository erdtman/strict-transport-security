'use strict';

// The koa middleware: how it sets the header, that it returns the downstream
// promise koa awaits, and where it reads the scheme from under secureOnly.
// test/frameworks.test.js runs the same middleware against a real koa app,
// but only when koa is installed, so everything that has to hold on every run
// is asserted here.

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

test('the middleware sets the header through ctx.set', async () => {
  const calls = [];

  await STS.getKoaSTS({ 'max-age': 1 })({ set: (name, value) => calls.push([name, value]) }, async () => {});

  assert.deepStrictEqual(calls, [['Strict-Transport-Security', 'max-age=1']]);
});

test('the default policy lasts 30 days, as it does on express', async () => {
  const headers = new Map();

  await STS.getKoaSTS()({ set: (name, value) => headers.set(name, value) }, async () => {});

  assert.deepStrictEqual([...headers], [['Strict-Transport-Security', 'max-age=2592000']]);
});

test('the middleware sets the header the compiled policy asks for', async () => {
  const headers = new Map();
  const options = { 'max-age': { days: 365 }, includeSubDomains: true, preload: true };

  await STS.getKoaSTS(options)({ set: (name, value) => headers.set(name, value) }, async () => {});

  assert.strictEqual(headers.get('Strict-Transport-Security'), STS.getSTSHeader(options).value);
});

test('the downstream promise is returned, which koa awaits', async () => {
  // A dropped return would let koa respond before the rest of the stack ran.
  let finished = false;

  const returned = STS.getKoaSTS()({ set: () => {} }, async () => { finished = true; });

  assert.ok(returned instanceof Promise);
  await returned;
  assert.ok(finished);
});

test('next() is called once, with no arguments', async () => {
  const next = [];

  await STS.getKoaSTS()({ set: () => {} }, async (...args) => next.push(args));

  assert.deepStrictEqual(next, [[]]);
});

test('the header is already set when next() runs', async () => {
  const headers = new Map();
  let headerDuringNext;

  await STS.getKoaSTS({ 'max-age': 1 })(
    { set: (name, value) => headers.set(name, value) },
    async () => { headerDuringNext = headers.get('Strict-Transport-Security'); }
  );

  assert.strictEqual(headerDuringNext, 'max-age=1');
});

test('the inner middleware overrides the outer one', async () => {
  // Koa nests, and koa has no router of its own, so a route local policy is
  // the inner middleware whichever way it is dispatched.
  const headers = new Map();
  const ctx = { set: (name, value) => headers.set(name, value) };
  const local = STS.getKoaSTS({ 'max-age': 2 });

  await STS.getKoaSTS({ 'max-age': 1 })(ctx, () => local(ctx, async () => {}));

  assert.deepStrictEqual([...headers], [['Strict-Transport-Security', 'max-age=2']]);
});

test('the policy is compiled once, when the middleware is built', async () => {
  const options = { 'max-age': 1 };
  const middleware = STS.getKoaSTS(options);
  const headers = new Map();

  options['max-age'] = 999;
  options.preload = true;
  await middleware({ set: (name, value) => headers.set(name, value) }, async () => {});

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=1');
});

test('the middleware holds no per-request state, so it is reusable', async () => {
  const middleware = STS.getKoaSTS({ 'max-age': 1 });
  const first = new Map();
  const second = new Map();

  await middleware({ set: (name, value) => first.set(name, value) }, async () => {});
  await middleware({ set: (name, value) => second.set(name, value) }, async () => {});

  assert.deepStrictEqual([...second], [...first]);
});

test('invalid options are rejected when the middleware is built', () => {
  assert.throws(() => STS.getKoaSTS({ includeSubdomains: true }), TypeError);
});

test('an invalid max-age is rejected when the middleware is built', () => {
  assert.throws(() => STS.getKoaSTS({ 'max-age': 1.5 }), RangeError);
});

test('secureOnly sends the header when ctx.secure is true', async () => {
  const headers = new Map();

  await STS.getKoaSTS({ secureOnly: true })(
    { secure: true, set: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly skips the header when ctx.secure is false', async () => {
  // ctx.secure is a boolean on every real koa context, and honours app.proxy,
  // so behind a trusted proxy it is the forwarded scheme.
  const headers = new Map();

  await STS.getKoaSTS({ secureOnly: true })(
    { secure: false, set: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.deepStrictEqual([...headers], []);
});

test('secureOnly falls back to ctx.protocol when ctx.secure is absent', async () => {
  const headers = new Map();

  await STS.getKoaSTS({ secureOnly: true })(
    { protocol: 'https', set: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly falls back to the node request behind ctx.req', async () => {
  const headers = new Map();

  await STS.getKoaSTS({ secureOnly: true })(
    { protocol: 'http', req: { socket: { encrypted: true } }, set: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly skips the header on a context it can learn nothing from', async () => {
  const headers = new Map();

  await STS.getKoaSTS({ secureOnly: true })({ set: (name, value) => headers.set(name, value) }, async () => {});

  assert.deepStrictEqual([...headers], []);
});

test('next() is still called when secureOnly skips the header', async () => {
  const next = [];

  await STS.getKoaSTS({ secureOnly: true })({ secure: false, set: () => {} }, async (...args) => next.push(args));

  assert.deepStrictEqual(next, [[]]);
});

test('without secureOnly the scheme is never consulted', async () => {
  const headers = new Map();

  await STS.getKoaSTS({ 'max-age': 1 })(
    { secure: false, set: (name, value) => headers.set(name, value) },
    async () => {}
  );

  assert.strictEqual(headers.get('Strict-Transport-Security'), 'max-age=1');
});
