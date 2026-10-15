const sts = require('../');
const Hapi = require('@hapi/hapi');
const server = Hapi.server({ port: 3000 });

const globalSTS = sts.getHapiSTS({ 'max-age': { days: 30 } });
const localSTS = sts.getHapiSTS({ 'max-age': { days: 10 }, includeSubDomains: true });

// This will apply this policy to all requests. onPreResponse is the extension
// point that also covers the responses hapi generates itself, such as a 404.
server.ext('onPreResponse', globalSTS);

server.route([
  {
    method: 'GET',
    path: '/',
    handler: () => 'Using global strict transport security policy!'
  },
  {
    method: 'GET',
    path: '/local',
    // A route level extension runs after the server wide one, so it wins
    options: { ext: { onPreResponse: { method: localSTS } } },
    handler: () => 'Using path local strict transport security policy!'
  }
]);

server.start().then(() => {
  console.log(`Example app listening on ${server.info.uri}`);
});
