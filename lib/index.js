/**
 * Node.js Middleware to add Strict-Transport-Security header according to
 * http://tools.ietf.org/html/rfc6797
 *
 * @option max-age, number or object containing <code>seconds</code>,
 *         <code>minutes</code>, <code>hours</code>, <code>days</code>
 * @option includeSubDomains, boolean to indicate if to include sub-domains in
 *         the Strict-Transport-Security header
 *
 */
module.exports.getSTS = function (options) {
  options = options || {};

  let maxAge = 0;
  if (typeof options['max-age'] === 'number') {
    maxAge = options['max-age'];
  } else if (typeof options['max-age'] === 'object') {
    if (typeof options['max-age'].seconds === 'number') {
      maxAge += options['max-age'].seconds;
    }
    if (typeof options['max-age'].minutes === 'number') {
      maxAge += options['max-age'].minutes * 60;
    }
    if (typeof options['max-age'].hours === 'number') {
      maxAge += options['max-age'].hours * 60 * 60;
    }
    if (typeof options['max-age'].days === 'number') {
      maxAge += options['max-age'].days * 24 * 60 * 60;
    }
  } else {
    maxAge = 60 * 60 * 24 * 30; // 30 days default
  }

  let compiled = 'max-age=' + maxAge;

  if (options['includeSubDomains']) {
    compiled += '; includeSubDomains';
  }

  if (options['preload']) {
    compiled += '; preload';
  }

  return (req, res, next) => {
    res.setHeader('Strict-Transport-Security', compiled);
    next();
  };
};
