const sts = require('../');
const fastify = require('fastify')();

// HSTS is a per-host policy: a browser keeps one entry per host name, so one
// hook on the instance is the whole of it. It covers the 404s and errors
// fastify serves itself, too. See RFC 6797 section 5.3.
fastify.addHook('onRequest', sts.getFastifySTS({ 'max-age': { days: 30 } }));

fastify.get('/', async () => 'Using the strict transport security policy!');

fastify.listen({ port: 3000 }, () => {
  console.log('Example app listening on port 3000!');
});
