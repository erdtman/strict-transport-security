[![CI](https://github.com/erdtman/strict-transport-security/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/erdtman/strict-transport-security/actions/workflows/ci.yml)

# strict-transport-security

Node.js middleware to add Strict-Transport-Security header according to [RFC6797](http://tools.ietf.org/html/rfc6797)

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

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `max-age` | number, or object of time units | 30 days | Policy lifetime. A number is a count of seconds; an object may combine `seconds`, `minutes`, `hours` and `days`. |
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

`getSTS` validates `max-age` when the middleware is created, so a bad configuration fails
at startup rather than silently emitting a policy you did not intend:

```js
sts.getSTS({ 'max-age': {} });        // TypeError: no recognized time units
sts.getSTS({ 'max-age': { week: 2 } }); // TypeError: no recognized time units
sts.getSTS({ 'max-age': '600' });     // TypeError: must be a number or an object of time units
sts.getSTS({ 'max-age': -1 });        // RangeError: must be a non-negative integer
sts.getSTS({ 'max-age': 1.5 });       // RangeError: must be a non-negative integer
```

`max-age: 0` is accepted — RFC 6797 defines it as the signal telling a browser to delete a
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

The connection is considered secure when Express reports `req.secure` — which, behind a proxy,
requires [`app.set('trust proxy', ...)`](https://expressjs.com/en/guide/behind-proxies.html) —
or when the underlying socket is encrypted.

## Development

There is nothing to install -- this package has no dependencies, runtime or development.

```
$ npm test          # run the test suite
$ npm run coverage  # test suite with a coverage report
```

Tests use the Node.js built-in test runner and `node:assert`. The coverage scripts use the
built-in coverage reporter and require Node.js 22 or later.

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
