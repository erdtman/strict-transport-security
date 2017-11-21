# strict-transport-security

Node.js middleware to add Strict-Transport-Security header according to http://tools.ietf.org/html/rfc6797

## Install

    $ npm install strict-transport-security

## Tests

    $ npm install --dev
    $ npm test

## Usage

### Connect
```js
    const connect = require('connect');
    const sts = require('strict-transport-security');
    const server = connect.createServer(sts.getSTS({"max-age":3600}));
    server.listen(3030);
```    
### Express
```js
    const sts = require('strict-transport-security');
    const express = require('express');
    const app = express();
    
    const globalSTS = sts.getSTS({"max-age":{days:30}});
    const localSTS = sts.getSTS({"max-age":{days:10, includeSubDomains:true}});
    
    // Insert before 'app.router'
    app.use(globalSTS); // This will apply this policy to all requests
    app.use(app.router);
    
    app.get('/settings',
      localSTS, // This will apply the local policy just to this path
      function(req, res) {
        res.render('settings');
      });
```
