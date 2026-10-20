const sts = require('../');
const { Hono } = require('hono');
// Hono runs on any web standard runtime; on Node it is served through this.
const { serve } = require('@hono/node-server');
const app = new Hono();

// HSTS is a per-host policy: a browser keeps one entry per host name, so one
// middleware on '*' is the whole of it. See RFC 6797 section 5.3.
app.use('*', sts.getHonoSTS({ 'max-age': { days: 30 } }));

app.get('/', (c) => c.text('Using the strict transport security policy!'));

serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log('Example app listening on port 3000!');
});
