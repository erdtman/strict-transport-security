# strict-transport-security

Node.js middleware to add Strict-Transport-Security header according to http://tools.ietf.org/html/rfc6797

## Install

    $ npm install strict-transport-security

## Tests

    $ npm install --dev
    $ npm test

## Usage

### Connect

    var connect = require('connect');
    var sts = require('strict-transport-security');
    var server = connect.createServer(sts.getSTS({"max-age":3600}));
    server.listen(3030);
    
### Express

    var sts = require('strict-transport-security');
    var express = require('express');
    var app = express();
    
    var globalSTS = sts.getSTS({"max-age":{days:30}});
    var localSTS = sts.getSTS({"max-age":{days:10, includeSubDomains:true}});
    
    // Insert before 'app.router'
    app.use(globalSTS); // This will apply this policy to all requests
    app.use(app.router);
    
    app.get('/settings',
      localSTS, // This will apply the local policy just to this path
      function(req, res) {
        res.render('settings');
      });
