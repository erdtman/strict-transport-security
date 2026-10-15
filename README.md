[![CI](https://github.com/erdtman/strict-transport-security/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/erdtman/strict-transport-security/actions/workflows/ci.yml)

# strict-transport-security

Adds a Strict-Transport-Security header according to [RFC6797](http://tools.ietf.org/html/rfc6797),
on Express, Connect, Fastify, Koa, Hono, Hapi, or anything that can set a header.

Zero dependencies. Requires Node.js 20 or later.

## Install
```
$ npm install strict-transport-security --save
```

## Usage
```js
const sts = require('strict-transport-security');
const express = require('express');
const app = express();

const globalSTS = sts.getSTS({ 'max-age': { days: 30 } });
const localSTS = sts.getSTS({ 'max-age': { days: 10 }, includeSubDomains: true });

// This will apply this policy to all requests
app.use(globalSTS);

app.get('/', (req, res) => {
  res.send('Using global strict transport security policy!');
});

// This will apply the local policy just to this path, overriding the global policy
app.get('/local', localSTS, (req, res) => {
  res.send('Using path local strict transport security policy!');
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
```

## Frameworks

A policy compiles to exactly one header, so fitting a framework is only a matter
of knowing how it sets one -- and, for [`secureOnly`](#conformance), how it
reports the scheme a request arrived over. Every factory below takes the same
[options](#options) and validates them once, when it is called, so a bad
configuration fails at startup rather than on every request.

| Framework | Factory | Mounted as |
| --- | --- | --- |
| Express, Connect, restify, NestJS on Express | `getSTS` | middleware, `(req, res, next)` |
| Fastify | `getFastifySTS` | an `onRequest` hook |
| Koa | `getKoaSTS` | middleware, `(ctx, next)` |
| Hono | `getHonoSTS` | middleware, `(c, next)` |
| Hapi | `getHapiSTS` | an `onPreResponse` extension |
| Next.js middleware, h3/Nitro, Workers, Deno, Bun, Elysia | `getHeadersSTS` | applied to a Fetch `Headers` |
| anything else | `getSTSHeader` | a `{ name, value, secureOnly }` triple you set yourself |

Runnable versions of each of these are in [`examples/`](examples).

### Fastify

```js
const sts = require('strict-transport-security');
const fastify = require('fastify')();

fastify.addHook('onRequest', sts.getFastifySTS({ 'max-age': { days: 30 } }));

// A route level hook runs after the instance wide one, so it wins.
fastify.get('/local', { onRequest: sts.getFastifySTS({ 'max-age': { days: 10 } }) }, async () => 'ok');
```

### Koa

```js
const sts = require('strict-transport-security');
const Koa = require('koa');
const app = new Koa();

const localSTS = sts.getKoaSTS({ 'max-age': { days: 10 } });

app.use(sts.getKoaSTS({ 'max-age': { days: 30 } }));

// Koa has no router of its own, so a route local policy is dispatched by path.
// Whichever way it is reached, the more specific middleware is the inner one.
app.use((ctx, next) => (ctx.path === '/local' ? localSTS(ctx, next) : next()));
```

### Hono

```js
const sts = require('strict-transport-security');
const { Hono } = require('hono');
const app = new Hono();

app.use('*', sts.getHonoSTS({ 'max-age': { days: 30 } }));
app.get('/local', sts.getHonoSTS({ 'max-age': { days: 10 } }), (c) => c.text('ok'));
```

The header is set before `next()`, not after, because Hono's response phase
unwinds outermost-last: setting it afterwards would let the app-wide policy
overwrite the route-local one.

### Hapi

```js
const sts = require('strict-transport-security');
const Hapi = require('@hapi/hapi');
const server = Hapi.server({ port: 3000 });

server.ext('onPreResponse', sts.getHapiSTS({ 'max-age': { days: 30 } }));

server.route({
  method: 'GET',
  path: '/local',
  options: { ext: { onPreResponse: { method: sts.getHapiSTS({ 'max-age': { days: 10 } }) } } },
  handler: () => 'ok'
});
```

`onPreResponse` is used rather than an earlier extension point because it is the
one that also covers the responses hapi generates itself, including Boom errors.

### Fetch `Headers`

Anywhere responses carry a standard `Headers` -- Next.js middleware, h3 and
Nitro, Cloudflare Workers, Deno, Bun, Elysia:

```js
import sts from 'strict-transport-security';
import { NextResponse } from 'next/server';

const applySTS = sts.getHeadersSTS({ 'max-age': { days: 30 }, includeSubDomains: true });

export function middleware (request) {
  const response = NextResponse.next();
  applySTS(response.headers, request);
  return response;
}
```

The second argument is the request the headers answer. It is read only under
`secureOnly`, where it supplies the scheme, and may be a Fetch `Request`, a
`URL` or a URL string; `secureOnly` with no request at all throws rather than
guess. Without `secureOnly` it can be left out.

### Anything else

`getSTSHeader` returns the frozen header the factories above are built on, so a
framework with none of these shapes is still a few lines:

```js
const sts = require('strict-transport-security');

const { name, value, secureOnly } = sts.getSTSHeader({ 'max-age': { days: 30 } });
// { name: 'Strict-Transport-Security', value: 'max-age=2592000', secureOnly: false }
```

`secureOnly` is not part of the header: it is the option, telling your own
adapter whether this header may be sent over a non-secure connection.

### Responses the framework generates

A 404 or a 500 served by the framework itself is a response like any other, and
a policy that only covers your handlers is a policy with holes in it. All six
factories above cover those too, which `test/frameworks.test.js` pins against
each real framework.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `max-age` | number, or object of time units | 30 days | Policy lifetime. A number is a count of seconds; an object may combine `seconds`, `minutes`, `hours` and `days`. The total must be a non-negative integer no greater than `Number.MAX_SAFE_INTEGER`. |
| `includeSubDomains` | boolean | `false` | Adds the `includeSubDomains` directive. |
| `preload` | boolean | `false` | Adds the `preload` directive. |
| `secureOnly` | boolean | `false` | Sends the header only over a secure connection, as RFC 6797 requires. See [Conformance](#conformance). |

```js
sts.getSTS({ 'max-age': 86400 });
// Strict-Transport-Security: max-age=86400

sts.getSTS({ 'max-age': { hours: 12, minutes: 30 } });
// Strict-Transport-Security: max-age=45000

sts.getSTS({ 'max-age': { days: 365 }, includeSubDomains: true, preload: true });
// Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Note that submitting a domain to the [HSTS preload list](https://hstspreload.org/) requires
a `max-age` of at least one year together with `includeSubDomains`; this module adds the
`preload` directive you ask for without checking those conditions.

### Invalid options

Every factory validates its options when it is called, so a bad configuration
fails at startup rather than silently emitting a policy you did not intend:

```js
sts.getSTS({ 'max-age': {} });           // TypeError: no recognized time units
sts.getSTS({ 'max-age': '600' });        // TypeError: must be a number or an object of time units
sts.getSTS({ 'max-age': -1 });           // RangeError: must be a non-negative integer
sts.getSTS({ 'max-age': 1.5 });          // RangeError: must be a non-negative integer
sts.getSTS({ 'max-age': 1e21 });         // RangeError: must be a non-negative integer no greater than 9007199254740991
sts.getSTS({ maxAge: 600 });             // TypeError: unknown option 'maxAge'
sts.getSTS({ includeSubdomains: true }); // TypeError: unknown option 'includeSubdomains'
sts.getSTS({ 'max-age': { week: 2 } });  // TypeError: unknown time unit 'week'
```

Unknown options and unknown time units are rejected rather than ignored: a typo such as
`includeSubdomains` or `maxAge` would otherwise leave you with a quietly weaker policy
than the one you wrote. Earlier versions accepted them silently.

An upper bound of `Number.MAX_SAFE_INTEGER` comes from the header grammar. RFC 6797
[section 6.1.1](https://tools.ietf.org/html/rfc6797#section-6.1.1) defines `max-age` as
`1*DIGIT`, and larger numbers either stringify in exponential notation, which no browser
parses, or have already lost precision.

`max-age: 0` is accepted -- RFC 6797 defines it as the signal telling a browser to delete a
stored policy.

## Conformance

RFC 6797 [section 7.2](https://tools.ietf.org/html/rfc6797#section-7.2) says a host must not
send the `Strict-Transport-Security` header over a non-secure transport. By default this
middleware sets the header on every response, which is convenient when TLS is terminated by a
proxy in front of the app and harmless in practice because browsers ignore the header when it
arrives over plain HTTP.

To get the conformant behaviour, set `secureOnly`:

```js
app.use(sts.getSTS({ 'max-age': { days: 30 }, secureOnly: true }));
```

Each factory asks its own framework what scheme the request arrived over, so
`secureOnly` behaves the way the rest of that application does:

| Factory | Secure when |
| --- | --- |
| `getSTS` | `req.secure`, which behind a proxy needs [`app.set('trust proxy', ...)`](https://expressjs.com/en/guide/behind-proxies.html); otherwise an encrypted socket |
| `getFastifySTS` | `request.protocol` is `https`, which honours `trustProxy`; otherwise an encrypted socket on `request.raw` |
| `getKoaSTS` | `ctx.secure`, which honours `app.proxy`; otherwise `ctx.protocol`, or an encrypted socket on `ctx.req` |
| `getHonoSTS` | the request URL's scheme is `https:` |
| `getHapiSTS` | `request.url.protocol` is `https:`; otherwise an encrypted socket on `request.raw.req` |
| `getHeadersSTS` | the scheme of the request passed as the second argument is `https:` |

Hono and the Fetch runtimes have no trusted-proxy setting, so behind a
TLS-terminating proxy their request URL stays `http:` and `secureOnly`
suppresses the header. Either leave `secureOnly` off there -- browsers ignore
the header over plain HTTP anyway -- or pass `getHeadersSTS` the URL you have
resolved yourself.

## Development

The library and its test suite have no dependencies at all. The real frameworks
are only needed for `test:frameworks`, which installs them on demand with
`--no-save`.

```
$ npm test                # run the test suite
$ npm run test:watch      # re-run it on every change
$ npm run test:frameworks # install the real frameworks and test against them
$ npm run coverage        # test suite with a coverage report
$ npm run coverage:check  # fail below 100% lines, branches and functions
```

Tests use the Node.js built-in test runner and `node:assert`. The coverage scripts use the
built-in coverage reporter and require Node.js 22 or later.

| File | What it covers |
| --- | --- |
| `test/validation.test.js` | What the factories reject, by error type. |
| `test/header.test.js` | The header value each set of options produces, and what `getSTSHeader` compiles to. |
| `test/middleware.test.js` | The response and `next()` contract of `getSTS`, and `secureOnly`. |
| `test/fastify.test.js` | The fastify hook: `reply.header`, `done()`, and where it reads the scheme. |
| `test/koa.test.js` | The koa middleware: `ctx.set`, the returned promise, and where it reads the scheme. |
| `test/hono.test.js` | The hono middleware: `c.header`, setting before `next()`, and where it reads the scheme. |
| `test/hapi.test.js` | The hapi extension: normal and Boom responses, `h.continue`, and where it reads the scheme. |
| `test/headers.test.js` | `getHeadersSTS` against a real `Headers`, `Request` and `Response`. |
| `test/http.test.js` | The header on the wire, through a real `node:http` server. |
| `test/frameworks.test.js` | Every factory against the real Express, Fastify, Koa, Hono and Hapi, including a framework-generated 404 and a forwarded scheme. Skipped unless they are installed. |
| `test/esm.test.mjs` | The `import` surface, which CommonJS tests cannot reach. |
| `test/docs.test.js` | Every value and error this README documents, plus the examples. |
| `test/pack.test.js` | The published tarball: its contents load and work. |

Tests use a real `http.ServerResponse` rather than a stub, so `getHeader` and
`getHeaderNames` report what a server would actually send, and no test helper stands
between the reader and what is being asserted. The framework factories are tested twice:
against doubles shaped like each framework's own response object, which is what keeps the
default suite dependency-free, and against the real frameworks, which is the only thing
that can tell us a framework still works the way the double assumes.

Coverage counts `lib` only and is required to stay at 100% of lines, branches and
functions. It is a floor, not a goal: a saturated percentage says nothing about whether the
header is still valid, so the behavioural guards -- the exact header values, the wire-level
tests and the documentation tests -- are what the suite actually leans on.

## Releasing

Releases go through npm's [staged publishing](https://docs.npmjs.com/staged-publishing),
so no release reaches the registry without a human approving it.

1. Bump the version in `package.json` and merge it.
2. Tag and create a GitHub Release. That triggers
   `.github/workflows/publish.yml`, which checks the tag against
   `package.json`, runs the tests, and submits the tarball with
   `npm stage publish`.
3. Approve it with 2FA, either from the **Staged Packages** tab on npmjs.com
   or with `npm stage approve <stage-id>`. Until then the version is staged
   and not installable.

The workflow authenticates by OIDC as a trusted publisher, so there is no npm
token in CI. Its npm permissions are limited to staging, meaning a direct
`npm publish` from the workflow is rejected.
[Provenance](https://docs.npmjs.com/generating-provenance-statements) is
generated automatically for trusted publishes from a public repository, which
links the published tarball to the commit and workflow that built it.

Before reviewing a staged release you can inspect it with
`npm stage view <stage-id>` or `npm stage download <stage-id>`.

## License

[MIT](LICENSE)
