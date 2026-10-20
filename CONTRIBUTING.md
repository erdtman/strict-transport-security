# Contributing

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
| `test/frameworks.test.js` | Every factory against the real Express, Fastify, Koa, Hono and Hapi, including a framework-generated 404, a forwarded scheme, and the one header RFC 6797 section 7.1 allows when two are mounted. Skipped unless they are installed. |
| `test/esm.test.mjs` | The `import` surface, which CommonJS tests cannot reach. |
| `test/docs.test.js` | Every value and error the README documents, the examples, and this table. |
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

Every push runs the suite on each Node.js version `engines` allows, on the
newest npm, against the real frameworks, and under the coverage thresholds. See
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

The release process is in [RELEASING.md](RELEASING.md).
