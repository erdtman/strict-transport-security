/**
 * Node.js middleware to add a Strict-Transport-Security header according to
 * RFC 6797 (http://tools.ietf.org/html/rfc6797).
 *
 * @option max-age, a non-negative integer number of seconds, or an object
 *         containing any of <code>seconds</code>, <code>minutes</code>,
 *         <code>hours</code>, <code>days</code>. Defaults to 30 days.
 * @option includeSubDomains, truthy to add the includeSubDomains directive
 * @option preload, truthy to add the preload directive
 * @option secureOnly, truthy to send the header only over a secure
 *         connection, as required by RFC 6797 section 7.2
 *
 * Unknown options and unknown time units are rejected, so a typo fails when
 * the middleware is created instead of silently emitting a policy that is
 * weaker or shorter-lived than intended.
 *
 * A policy compiles to exactly one header, so fitting a framework is a matter
 * of knowing how it sets one and -- for secureOnly -- how it reports the
 * scheme the request arrived over. getSTSHeader compiles the options to that
 * header, and every factory below is a few lines on top of it: getSTS for
 * connect and express, getFastifySTS, getKoaSTS, getHonoSTS and getHapiSTS for
 * those frameworks, and getHeadersSTS for anything whose response carries a
 * Fetch Headers.
 */
'use strict';

const UNITS = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60
};

const OPTIONS = ['max-age', 'includeSubDomains', 'preload', 'secureOnly'];

const DEFAULT_MAX_AGE = 30 * UNITS.days;

/** The one header these options compile to. */
const HEADER = 'Strict-Transport-Security';

/**
 * The same name lowercased, for hapi, where headers are a plain object and so
 * a stale one has to be cleared by key: whoever set it chose its casing.
 */
const LOWERCASED = HEADER.toLowerCase();

function typeName (value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  return `a ${typeof value}`;
}

function quoteList (keys) {
  return keys.map((key) => `'${key}'`).join(', ');
}

function assertDeltaSeconds (value, label) {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number, got ${typeName(value)}`);
  }
  // RFC 6797 section 6.1.1 defines delta-seconds as 1*DIGIT. Anything outside
  // the safe integer range either stringifies in exponential notation, which
  // no browser will parse, or has already lost precision.
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer no greater than ${Number.MAX_SAFE_INTEGER}, got ${value}`);
  }
  return value;
}

function toMaxAge (value) {
  if (value === undefined) {
    return DEFAULT_MAX_AGE;
  }

  if (typeof value === 'number') {
    return assertDeltaSeconds(value, "options['max-age']");
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`options['max-age'] must be a number or an object of time units, got ${typeName(value)}`);
  }

  const unknown = Object.keys(value).filter((unit) => UNITS[unit] === undefined);
  if (unknown.length > 0) {
    throw new TypeError(`options['max-age'] has unknown time ${unknown.length === 1 ? 'unit' : 'units'} ${quoteList(unknown)}, expected one of ${Object.keys(UNITS).join(', ')}`);
  }

  const units = Object.keys(UNITS).filter((unit) => value[unit] !== undefined);
  if (units.length === 0) {
    throw new TypeError(`options['max-age'] has no recognized time units, expected one of ${Object.keys(UNITS).join(', ')}`);
  }

  const total = units.reduce((seconds, unit) => {
    return seconds + assertDeltaSeconds(value[unit], `options['max-age'].${unit}`) * UNITS[unit];
  }, 0);

  // Each unit can be a safe integer while the total is not.
  return assertDeltaSeconds(total, "options['max-age'] in seconds");
}

function toOptions (options) {
  if (options === undefined || options === null) {
    return {};
  }

  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`options must be an object, got ${typeName(options)}`);
  }

  const unknown = Object.keys(options).filter((key) => !OPTIONS.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(`unknown ${unknown.length === 1 ? 'option' : 'options'} ${quoteList(unknown)}, expected one of ${OPTIONS.join(', ')}`);
  }

  return options;
}

/**
 * Whether a scheme is https, spelled either of the two ways frameworks spell
 * it: 'https' for express and fastify, 'https:' for a WHATWG URL.
 */
function isSecureProtocol (protocol) {
  return protocol === 'https' || protocol === 'https:';
}

/**
 * Whether an absolute URL is an https one. The URL parser lowercases the
 * scheme, so a case-insensitive match is only for a hand-written string.
 */
function isSecureUrl (url) {
  return typeof url === 'string' && /^https:/i.test(url);
}

/**
 * Whether a node request arrived over TLS.
 *
 * Used for connect and express directly, and as the fallback under the other
 * frameworks, which all keep the node request within reach.
 */
function isSecureRequest (req) {
  if (!req) {
    return false;
  }
  // Express sets req.secure from the connection and, behind a trusted proxy,
  // the X-Forwarded-Proto header. Fall back to the raw socket otherwise.
  if (typeof req.secure === 'boolean') {
    return req.secure;
  }
  const socket = req.socket || req.connection;
  return Boolean(socket && socket.encrypted);
}

/**
 * Whether a fastify request arrived over TLS.
 *
 * request.protocol is fastify's own, and honours trustProxy, so it is the
 * answer when it is there.
 */
function isSecureFastifyRequest (request) {
  if (typeof request.protocol === 'string') {
    return isSecureProtocol(request.protocol);
  }
  return isSecureRequest(request.raw);
}

/**
 * Whether a koa request arrived over TLS.
 *
 * ctx.secure is a boolean on every real koa context, and honours app.proxy.
 * The rest is for the koa-likes that only implement part of the context.
 */
function isSecureKoaContext (ctx) {
  if (typeof ctx.secure === 'boolean') {
    return ctx.secure;
  }
  return isSecureProtocol(ctx.protocol) || isSecureRequest(ctx.req);
}

/**
 * Whether a hapi request arrived over TLS.
 *
 * request.url is a WHATWG URL, so its scheme is the one hapi itself resolved,
 * including the proxy handling its own settings ask for.
 */
function isSecureHapiRequest (request) {
  const url = request.url;
  if (url && typeof url.protocol === 'string') {
    return isSecureProtocol(url.protocol);
  }
  const raw = request.raw;
  return isSecureRequest(raw && raw.req);
}

/**
 * The URL a Fetch-style request arrived on, from a Request, a URL or a string.
 *
 * @returns the URL, or undefined if there is none to read
 */
function toRequestUrl (request) {
  if (typeof request === 'string') {
    return request;
  }
  if (request instanceof URL) {
    return request.href;
  }
  if (request && typeof request.url === 'string') {
    return request.url;
  }
  return undefined;
}

/**
 * Compile the options to the one header they are sent as.
 *
 * This is what every factory below is built from. Reach for it directly to
 * support a framework this module has no factory for: set the returned header
 * however that framework sets one, and honour secureOnly however that
 * framework reports the scheme.
 *
 * @param options see the module documentation above
 * @returns a frozen { name, value, secureOnly } -- the header to send, and
 *   whether it may only be sent over a secure connection
 * @throws TypeError on an unknown option, an unknown time unit, or a max-age
 *   that is neither a number nor an object of time units
 * @throws RangeError on a max-age that is not a non-negative safe integer
 */
module.exports.getSTSHeader = function (options) {
  const parsed = toOptions(options);

  let value = `max-age=${toMaxAge(parsed['max-age'])}`;

  if (parsed.includeSubDomains) {
    value += '; includeSubDomains';
  }

  if (parsed.preload) {
    value += '; preload';
  }

  return Object.freeze({ name: HEADER, value, secureOnly: Boolean(parsed.secureOnly) });
};

/**
 * A local alias, so that replacing the export cannot change what the factories
 * below compile.
 */
const compile = module.exports.getSTSHeader;

/**
 * Build middleware that sets a Strict-Transport-Security header.
 *
 * For connect, express, restify, polka, NestJS on express, and anything else
 * taking a (req, res, next) middleware.
 *
 * @param options see the module documentation above
 * @returns a connect/express middleware function
 * @throws TypeError or RangeError on invalid options, see getSTSHeader
 */
module.exports.getSTS = function (options) {
  const { name, value, secureOnly } = compile(options);

  return (req, res, next) => {
    if (secureOnly && !isSecureRequest(req)) {
      return next();
    }
    res.setHeader(name, value);
    next();
  };
};

/**
 * Build a fastify onRequest hook that sets a Strict-Transport-Security header.
 *
 * Add it to a whole instance with fastify.addHook('onRequest', hook), or to
 * one route with { onRequest: hook } in its options. A route-level hook runs
 * last, so it overrides an instance-wide policy.
 *
 * @param options see the module documentation above
 * @returns a fastify onRequest hook
 * @throws TypeError or RangeError on invalid options, see getSTSHeader
 */
module.exports.getFastifySTS = function (options) {
  const { name, value, secureOnly } = compile(options);

  return (request, reply, done) => {
    if (!secureOnly || isSecureFastifyRequest(request)) {
      reply.header(name, value);
    }
    done();
  };
};

/**
 * Build koa middleware that sets a Strict-Transport-Security header.
 *
 * @param options see the module documentation above
 * @returns a koa middleware function
 * @throws TypeError or RangeError on invalid options, see getSTSHeader
 */
module.exports.getKoaSTS = function (options) {
  const { name, value, secureOnly } = compile(options);

  return (ctx, next) => {
    if (!secureOnly || isSecureKoaContext(ctx)) {
      ctx.set(name, value);
    }
    // Returned, not awaited: koa needs the downstream promise.
    return next();
  };
};

/**
 * Build hono middleware that sets a Strict-Transport-Security header.
 *
 * Under secureOnly the scheme comes from the request URL, which is http behind
 * a TLS-terminating proxy: hono has no equivalent of express's trust proxy.
 *
 * @param options see the module documentation above
 * @returns a hono middleware function
 * @throws TypeError or RangeError on invalid options, see getSTSHeader
 */
module.exports.getHonoSTS = function (options) {
  const { name, value, secureOnly } = compile(options);

  return (c, next) => {
    // Set before next(), not after. Hono unwinds middleware outermost-last,
    // so setting the header afterwards would let an app-wide policy overwrite
    // a route-local one, the opposite of how every other framework here
    // behaves. Set beforehand it lands in hono's prepared headers, and it
    // survives a handler that returns a Response of its own.
    if (!secureOnly || isSecureUrl(c.req.url)) {
      c.header(name, value);
    }
    return next();
  };
};

/**
 * Build a hapi onPreResponse extension that sets a Strict-Transport-Security
 * header.
 *
 * Register it with server.ext('onPreResponse', ext), or on one route with
 * { ext: { onPreResponse: { method: ext } } }.
 *
 * onPreResponse rather than an earlier extension point because it is the only
 * one that also sees error responses, which are served by hapi itself and
 * would otherwise go out with no policy at all.
 *
 * @param options see the module documentation above
 * @returns a hapi extension method
 * @throws TypeError or RangeError on invalid options, see getSTSHeader
 */
module.exports.getHapiSTS = function (options) {
  const { name, value, secureOnly } = compile(options);

  return (request, h) => {
    if (!secureOnly || isSecureHapiRequest(request)) {
      // An error response is a Boom object, which keeps its headers one level
      // further in. Both are plain objects, so a header already there is
      // deleted by key rather than through a removeHeader() hapi does not
      // have: hapi lowercases the names it sets itself, and two spellings of
      // one name would go out as two headers.
      const response = request.response;
      const headers = response.isBoom ? response.output.headers : response.headers;

      Object.keys(headers).forEach((stale) => {
        if (stale.toLowerCase() === LOWERCASED) {
          delete headers[stale];
        }
      });
      headers[name] = value;
    }

    return h.continue;
  };
};

/**
 * Build a function that sets a Strict-Transport-Security header on a Fetch
 * Headers object.
 *
 * For the frameworks that have no node response object at all: Next.js
 * middleware, h3 v2 and Nitro, Cloudflare Workers, Deno, Bun and Elysia.
 *
 * The returned function takes the headers to set, and the request they answer.
 * The request is only read under secureOnly, where it supplies the scheme, and
 * may be a Fetch Request, a URL or a URL string. That scheme is http behind a
 * TLS-terminating proxy, which no part of the Fetch API resolves for us.
 *
 * @param options see the module documentation above
 * @returns a function (headers, request) that sets the header on those headers
 * @throws TypeError or RangeError on invalid options, see getSTSHeader
 */
module.exports.getHeadersSTS = function (options) {
  const { name, value, secureOnly } = compile(options);

  return (headers, request) => {
    if (secureOnly) {
      const url = toRequestUrl(request);
      // Nothing to judge the connection by. Sending the header anyway would
      // break the one promise secureOnly makes, and skipping it silently would
      // leave a policy that never ships, so say so instead.
      if (url === undefined) {
        throw new TypeError('secureOnly needs the request to read the scheme from, as in applySTS(headers, request)');
      }
      if (!isSecureUrl(url)) {
        return;
      }
    }
    headers.set(name, value);
  };
};
