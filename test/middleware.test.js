'use strict';

// How the middleware behaves as middleware: what it does to the response,
// when it calls next(), and when secureOnly makes it do nothing. The response
// is a real http.ServerResponse, so getHeaderNames() shows whether anything
// was sent without a stub to interpret.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const STS = require('../');

test('the module exposes nothing but getSTS', () => {
  assert.deepStrictEqual(Object.keys(STS), ['getSTS']);
  assert.strictEqual(typeof STS.getSTS, 'function');
});

test('the middleware takes three arguments', () => {
  // connect and express treat a four-argument function as error middleware,
  // so the arity is part of the public contract.
  assert.strictEqual(STS.getSTS().length, 3);
});

test('the header is already set when next() runs', () => {
  // Downstream middleware may flush the response, so anything set after
  // next() could miss the wire.
  const res = new http.ServerResponse(new http.IncomingMessage());
  let headerDuringNext;

  STS.getSTS({ 'max-age': 1 })(null, res, () => {
    headerDuringNext = res.getHeader('Strict-Transport-Security');
  });

  assert.strictEqual(headerDuringNext, 'max-age=1');
});

test('next() is called once, with no arguments', () => {
  // An argument would look like an error to express and skip the rest of the
  // stack.
  const res = new http.ServerResponse(new http.IncomingMessage());
  const nextCalls = [];

  STS.getSTS()(null, res, (...args) => nextCalls.push(args));

  assert.deepStrictEqual(nextCalls, [[]]);
});

test('next() is called once when secureOnly skips the header', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());
  const nextCalls = [];

  STS.getSTS({ secureOnly: true })(null, res, (...args) => nextCalls.push(args));

  assert.deepStrictEqual(nextCalls, [[]]);
  assert.deepStrictEqual(res.getHeaderNames(), []);
});

test('the compiled header is reused across requests', () => {
  const sts = STS.getSTS({ 'max-age': 1 });
  const first = new http.ServerResponse(new http.IncomingMessage());
  const second = new http.ServerResponse(new http.IncomingMessage());

  sts(null, first, () => {});
  sts(null, second, () => {});

  assert.strictEqual(first.getHeader('Strict-Transport-Security'), 'max-age=1');
  assert.strictEqual(second.getHeader('Strict-Transport-Security'), 'max-age=1');
});

test('getSTS does not mutate the options it is given', () => {
  const options = { 'max-age': { days: 1 }, includeSubDomains: true };
  const before = structuredClone(options);

  STS.getSTS(options);

  assert.deepStrictEqual(options, before);
});

test('changing the options object afterwards does not change the header', () => {
  const options = { 'max-age': 1 };
  const sts = STS.getSTS(options);
  const res = new http.ServerResponse(new http.IncomingMessage());

  options['max-age'] = 999;
  options.preload = true;
  sts(null, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=1');
});

test('without secureOnly the header is set on an insecure request', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({})({ secure: false }, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly sets the header when express reports a secure request', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({ secure: true }, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly falls back to the raw socket when req.secure is absent', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({ socket: { encrypted: true } }, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly honours the legacy req.connection alias', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({ connection: { encrypted: true } }, res, () => {});

  assert.strictEqual(res.getHeader('Strict-Transport-Security'), 'max-age=2592000');
});

test('secureOnly skips the header when express reports an insecure request', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({ secure: false }, res, () => {});

  assert.deepStrictEqual(res.getHeaderNames(), []);
});

test('secureOnly skips the header on an unencrypted socket', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({ socket: {} }, res, () => {});

  assert.deepStrictEqual(res.getHeaderNames(), []);
});

test('secureOnly skips the header when the socket is null', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({ socket: null }, res, () => {});

  assert.deepStrictEqual(res.getHeaderNames(), []);
});

test('secureOnly skips the header on a request with no socket at all', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({}, res, () => {});

  assert.deepStrictEqual(res.getHeaderNames(), []);
});

test('secureOnly skips the header when there is no request object', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })(null, res, () => {});

  assert.deepStrictEqual(res.getHeaderNames(), []);
});

test('req.secure wins over the socket when both are present', () => {
  const res = new http.ServerResponse(new http.IncomingMessage());

  STS.getSTS({ secureOnly: true })({ secure: false, socket: { encrypted: true } }, res, () => {});

  assert.deepStrictEqual(res.getHeaderNames(), []);
});
