const sts = require('../');
const express = require('express');
const app = express();

// HSTS is a per-host policy: a browser keeps one entry per host name, so one
// policy on every response is the whole of it. See RFC 6797 section 5.3.
app.use(sts.getSTS({ 'max-age': { days: 30 } }));

app.get('/', (req, res) => {
  res.send('Using the strict transport security policy!');
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
