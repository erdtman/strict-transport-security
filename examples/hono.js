const sts = require('../');
const { Hono } = require('hono');
// Hono runs on any web standard runtime; on Node it is served through this.
const { serve } = require('@hono/node-server');
const app = new Hono();

const globalSTS = sts.getHonoSTS({ 'max-age': { days: 30 } });
const localSTS = sts.getHonoSTS({ 'max-age': { days: 10 }, includeSubDomains: true });

// This will apply this policy to all requests
app.use('*', globalSTS);

app.get('/', (c) => c.text('Using global strict transport security policy!'));

// This will apply the local policy just to this path, overriding the global one
app.get('/local', localSTS, (c) => c.text('Using path local strict transport security policy!'));

serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log('Example app listening on port 3000!');
});
