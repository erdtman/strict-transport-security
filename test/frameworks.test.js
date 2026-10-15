'use strict';

// The adapters against the real frameworks, over real requests.
//
// The per-framework test files assert the same behaviour against doubles,
// which is what keeps the default suite dependency-free. Doubles can only be
// wrong in the same way twice, though: they cannot tell us that reply.header
// is still how fastify sets a header, that hapi keeps an error response's
// headers somewhere else, or that ctx.secure really reports the forwarded
// scheme. That is what this file is for.
//
// Each framework is skipped unless it is installed, so `npm test` passes with
// no dependencies at all. `npm run test:frameworks` installs them and runs
// this file; CI does the same on every push.

const test = require('node:test');
const assert = require('node:assert');
const STS = require('../');

// The app-wide policy, the one a route overrides it with, and an app-wide
// policy that may only be sent over TLS.
const GLOBAL = { 'max-age': { days: 30 } };
const LOCAL = { 'max-age': { days: 10 }, includeSubDomains: true };
const SECURE = { 'max-age': { days: 30 }, secureOnly: true };

const GLOBAL_VALUE = STS.getSTSHeader(GLOBAL).value;
const LOCAL_VALUE = STS.getSTSHeader(LOCAL).value;

/**
 * @param name a framework's package name
 * @returns the framework, or null when it is not installed
 */
function load (name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

/**
 * Wrap a listening node server in the interface the tests use, so that a real
 * server and hono's in-process dispatch look the same to them.
 */
function serving (server, close) {
  const origin = `http://127.0.0.1:${server.address().port}`;

  return { request: (path, init) => fetch(`${origin}${path}`, init), close };
}

async function listening (server) {
  await new Promise((resolve) => server.once('listening', resolve));
  return serving(server, () => new Promise((resolve) => server.close(resolve)));
}

const HARNESSES = [
  {
    label: 'express',
    module: 'express',
    factory: STS.getSTS,
    // Express, fastify and koa resolve X-Forwarded-Proto for themselves once
    // they are told to trust the proxy, so secureOnly can be proven to read
    // the resolved scheme rather than the socket. Hono and hapi have no such
    // setting, so there the forwarded scheme is nobody's to trust.
    forwarded: true,
    async boot (express, { global, local }) {
      const app = express();

      app.set('trust proxy', true);
      app.use(global);
      app.get('/', (req, res) => res.send('ok'));
      app.get('/local', local, (req, res) => res.send('ok'));

      return listening(app.listen(0, '127.0.0.1'));
    }
  },
  {
    label: 'fastify',
    module: 'fastify',
    factory: STS.getFastifySTS,
    forwarded: true,
    async boot (fastify, { global, local }) {
      const app = fastify({ trustProxy: true });

      app.addHook('onRequest', global);
      app.get('/', async () => 'ok');
      // A route level hook runs after the instance wide one, so it wins.
      app.get('/local', { onRequest: local }, async () => 'ok');

      await app.listen({ port: 0, host: '127.0.0.1' });

      return serving(app.server, () => app.close());
    }
  },
  {
    label: 'koa',
    module: 'koa',
    factory: STS.getKoaSTS,
    forwarded: true,
    async boot (Koa, { global, local }) {
      const app = new Koa();

      app.proxy = true;
      app.use(global);
      // Koa has no router of its own, so the route local policy is dispatched
      // by path. Nesting is the point either way: the inner middleware is the
      // more specific one.
      app.use((ctx, next) => (ctx.path === '/local' ? local(ctx, next) : next()));
      app.use((ctx) => {
        if (ctx.path !== '/missing') {
          ctx.body = 'ok';
        }
      });

      return listening(app.listen(0, '127.0.0.1'));
    }
  },
  {
    label: 'hono',
    module: 'hono',
    factory: STS.getHonoSTS,
    async boot ({ Hono }, { global, local }) {
      const app = new Hono();

      app.use('*', global);
      app.get('/', (c) => c.text('ok'));
      app.get('/local', local, (c) => c.text('ok'));

      // Hono turns a Request into a Response in process, so it needs no
      // server adapter, and no port.
      return { request: (path, init) => app.request(path, init), close: () => {} };
    }
  },
  {
    label: 'hapi',
    module: '@hapi/hapi',
    factory: STS.getHapiSTS,
    async boot (Hapi, { global, local }) {
      const server = Hapi.server({ port: 0, host: '127.0.0.1' });

      server.ext('onPreResponse', global);
      server.route([
        { method: 'GET', path: '/', handler: () => 'ok' },
        {
          method: 'GET',
          path: '/local',
          options: { ext: { onPreResponse: { method: local } } },
          handler: () => 'ok'
        }
      ]);

      await server.start();

      return {
        request: (path, init) => fetch(`${server.info.uri}${path}`, init),
        close: () => server.stop()
      };
    }
  }
];

/**
 * Boot one framework's app, and shut it down when the test ends.
 *
 * @param t the running test, for its after() hook
 * @param harness a HARNESSES entry, and the framework it loaded
 * @param options the app-wide policy to mount, and the route-local one
 * @returns the app, with request() and close()
 */
async function start (t, { harness, framework }, options = {}) {
  const app = await harness.boot(framework, {
    global: harness.factory(options.global || GLOBAL),
    local: harness.factory(LOCAL)
  });

  t.after(() => app.close());
  return app;
}

for (const harness of HARNESSES) {
  const framework = load(harness.module);
  const skip = framework ? false : `${harness.module} is not installed`;
  const booted = { harness, framework };

  test(`${harness.label} sends the app-wide policy`, { skip }, async (t) => {
    const app = await start(t, booted);

    const response = await app.request('/');

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('strict-transport-security'), GLOBAL_VALUE);
  });

  test(`${harness.label} lets a route-local policy override the app-wide one`, { skip }, async (t) => {
    const app = await start(t, booted);

    const response = await app.request('/local');

    assert.strictEqual(response.headers.get('strict-transport-security'), LOCAL_VALUE);
  });

  test(`${harness.label} sends the header exactly once`, { skip }, async (t) => {
    // fetch joins repeated headers with ", ", and a valid policy value can
    // never contain a comma, so this detects a duplicated header.
    const app = await start(t, booted);

    const value = (await app.request('/local')).headers.get('strict-transport-security');

    assert.ok(!value.includes(','), value);
  });

  test(`${harness.label} covers a response the framework generated itself`, { skip }, async (t) => {
    // A 404 is served by the framework, not by a handler. That is the case an
    // adapter is most likely to miss, and a redirect to https that only the
    // handlers protect is no protection at all.
    const app = await start(t, booted);

    const response = await app.request('/missing');

    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers.get('strict-transport-security'), GLOBAL_VALUE);
  });

  test(`${harness.label} sends no header over plain http under secureOnly`, { skip }, async (t) => {
    const app = await start(t, booted, { global: SECURE });

    const response = await app.request('/');

    assert.strictEqual(response.headers.get('strict-transport-security'), null);
  });

  test(`${harness.label} resolves the forwarded scheme under secureOnly`, {
    skip: skip || (harness.forwarded ? false : `${harness.label} has no trusted proxy setting`)
  }, async (t) => {
    // The app trusts the proxy, so an X-Forwarded-Proto of https is a secure
    // request even though the socket is not encrypted. This is what proves
    // the adapter reads the framework's own resolved scheme, rather than
    // falling back to the socket and getting the right answer by accident.
    const app = await start(t, booted, { global: SECURE });

    const response = await app.request('/', { headers: { 'X-Forwarded-Proto': 'https' } });

    assert.strictEqual(response.headers.get('strict-transport-security'), GLOBAL_VALUE);
  });
}
