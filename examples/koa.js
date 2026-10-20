const sts = require('../');
const Koa = require('koa');
const app = new Koa();

// HSTS is a per-host policy: a browser keeps one entry per host name, so one
// middleware, outermost, is the whole of it. See RFC 6797 section 5.3.
app.use(sts.getKoaSTS({ 'max-age': { days: 30 } }));

app.use((ctx) => {
  ctx.body = 'Using the strict transport security policy!';
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
