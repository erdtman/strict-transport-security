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
 */
'use strict';

const UNITS = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60
};

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

function assertDeltaSeconds (value, label) {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number, got ${typeName(value)}`);
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, got ${value}`);
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

  const units = Object.keys(UNITS).filter((unit) => value[unit] !== undefined);
  if (units.length === 0) {
    throw new TypeError(`options['max-age'] has no recognized time units, expected one of ${Object.keys(UNITS).join(', ')}`);
  }

  return units.reduce((seconds, unit) => {
    return seconds + assertDeltaSeconds(value[unit], `options['max-age'].${unit}`) * UNITS[unit];
  }, 0);
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
  options = options || {};

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
