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

function isSecure (req) {
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

module.exports.getSTS = function (options) {
  options = toOptions(options);

  let compiled = `max-age=${toMaxAge(options['max-age'])}`;

  if (options.includeSubDomains) {
    compiled += '; includeSubDomains';
  }

  if (options.preload) {
    compiled += '; preload';
  }

  const secureOnly = Boolean(options.secureOnly);

  return (req, res, next) => {
    if (secureOnly && !isSecure(req)) {
      return next();
    }
    res.setHeader('Strict-Transport-Security', compiled);
    next();
  };
};
