const sts = require('../');
const Hapi = require('@hapi/hapi');
const server = Hapi.server({ port: 3000 });

// HSTS is a per-host policy: a browser keeps one entry per host name, so one
// extension is the whole of it. onPreResponse is the extension point that also
// covers the responses hapi generates itself, such as a 404.
// See RFC 6797 section 5.3.
server.ext('onPreResponse', sts.getHapiSTS({ 'max-age': { days: 30 } }));

server.route({
  method: 'GET',
  path: '/',
  handler: () => 'Using the strict transport security policy!'
});

server.start().then(() => {
  console.log(`Example app listening on ${server.info.uri}`);
});
