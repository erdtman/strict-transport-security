const sts = require('../');

// For the runtimes with no Node response object at all: Next.js middleware,
// h3 and Nitro, Cloudflare Workers, Deno, Bun and Elysia. The policy is
// applied to the Fetch Headers the response already carries.
const applySTS = sts.getHeadersSTS({ 'max-age': { days: 30 }, includeSubDomains: true });

// A Cloudflare Workers style fetch handler. The request is passed along
// because secureOnly reads the scheme from it; without secureOnly it is not
// needed at all.
module.exports.fetch = (request) => {
  const response = new Response('Using the strict transport security policy!');
  applySTS(response.headers, request);
  return response;
};
