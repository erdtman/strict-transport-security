const sts = require('../');
const fastify = require('fastify')();

const globalSTS = sts.getFastifySTS({ 'max-age': { days: 30 } });
const localSTS = sts.getFastifySTS({ 'max-age': { days: 10 }, includeSubDomains: true });

// This will apply this policy to all requests
fastify.addHook('onRequest', globalSTS);

fastify.get('/', async () => 'Using global strict transport security policy!');

// A route level hook runs after the instance wide one, so it wins
fastify.get('/local', { onRequest: localSTS }, async () => 'Using path local strict transport security policy!');

fastify.listen({ port: 3000 }, () => {
  console.log('Example app listening on port 3000!');
});
