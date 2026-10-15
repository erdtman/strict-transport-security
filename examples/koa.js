const sts = require('../');
const Koa = require('koa');
const app = new Koa();

const globalSTS = sts.getKoaSTS({ 'max-age': { days: 30 } });
const localSTS = sts.getKoaSTS({ 'max-age': { days: 10 }, includeSubDomains: true });

// This will apply this policy to all requests
app.use(globalSTS);

// Koa has no router of its own, so the local policy is dispatched by path.
// Whichever way it is reached, the more specific middleware is the inner one.
app.use((ctx, next) => (ctx.path === '/local' ? localSTS(ctx, next) : next()));

app.use((ctx) => {
  ctx.body = ctx.path === '/local'
    ? 'Using path local strict transport security policy!'
    : 'Using global strict transport security policy!';
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
