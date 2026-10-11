'use strict';

// The unit tests run the middleware against a stub response, which accepts
// anything. These run it through a real server, so the assertions are about
// what a browser would actually receive.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const STS = require('../');

async function serve (t, middleware) {
  const server = http.createServer((req, res) => {
    middleware(req, res, () => res.end('ok'));
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  await response.text();
  return response;
}

test('the header reaches the wire through a real http server', async (t) => {
  const sts = STS.getSTS({ 'max-age': { days: 1 }, includeSubDomains: true });
  const response = await serve(t, sts);
  assert.strictEqual(
    response.headers.get('strict-transport-security'),
    'max-age=86400; includeSubDomains'
  );
});

test('the header is sent exactly once', async (t) => {
  // fetch joins repeated headers with ", ", so a second setHeader call would
  // show up as "max-age=1, max-age=1" here.
  const response = await serve(t, STS.getSTS({ 'max-age': 1 }));
  assert.strictEqual(response.headers.get('strict-transport-security'), 'max-age=1');
});

test('secureOnly sends no header over plain http', async (t) => {
  const sts = STS.getSTS({ secureOnly: true });
  const response = await serve(t, sts);
  assert.strictEqual(response.headers.get('strict-transport-security'), null);
});

test('without secureOnly the header is sent over plain http', async (t) => {
  const sts = STS.getSTS({ 'max-age': 1 });
  const response = await serve(t, sts);
  assert.strictEqual(response.headers.get('strict-transport-security'), 'max-age=1');
});

test('the response is not held up, next() runs and the body still arrives', async (t) => {
  const sts = STS.getSTS({ 'max-age': 1 });
  const server = http.createServer((req, res) => {
    sts(req, res, () => res.end('body from downstream middleware'));
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.strictEqual(await response.text(), 'body from downstream middleware');
  assert.strictEqual(response.status, 200);
});

test('a real ServerResponse accepts the header value for every option shape', async (t) => {
  // setHeader validates the value, so this catches characters that the stub
  // response in test/index.js would happily accept.
  const options = [
    undefined,
    { 'max-age': 0 },
    { 'max-age': Number.MAX_SAFE_INTEGER },
    { 'max-age': { seconds: 1, minutes: 2, hours: 3, days: 4 }, includeSubDomains: true, preload: true }
  ];
  for (const option of options) {
    const response = await serve(t, STS.getSTS(option));
    const value = response.headers.get('strict-transport-security');
    assert.match(value, /^max-age=\d+(; includeSubDomains)?(; preload)?$/, `for ${JSON.stringify(option)}`);
  }
});
