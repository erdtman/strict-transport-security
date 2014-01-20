var assert = require('assert');
var STS = require('../lib');

suite('Strict Transport Security (STS) middleware', function() {
  function getRes(result) {
    return {
      setHeader : function(name, value) {
        console.log("set: %s: %s", name, value);
        result.name = name;
        result.value = value;
      }
    };
  }
  var next = function() {
  };

  test('default', function() {
    var sts = STS.getSTS();
    var result = {};
    sts(null, getRes(result), next);

    assert(result.name === "Strict-Transport-Security");
    assert(result.value === "max-age=2592000");
  });

  test('set direct', function() {
    var sts = STS.getSTS({
      "max-age" : 12345
    });
    var result = {};
    sts(null, getRes(result), next);

    assert(result.name === "Strict-Transport-Security");
    assert(result.value === "max-age=12345");
  });

  test('all time parametes', function() {
    var sts = STS.getSTS({
      "max-age" : {
        seconds : 1,
        minutes : 1,
        hours : 1,
        days : 1
      }
    });

    var result = {};
    sts(null, getRes(result), next);

    assert(result.name === "Strict-Transport-Security");
    assert(result.value === "max-age=90061");
  });

  test('include subdomains', function() {
    var sts = STS.getSTS({
      "max-age" : 456789,
      includeSubDomains : true
    });
    var result = {};
    sts(null, getRes(result), next);

    assert(result.name === "Strict-Transport-Security");
    assert(result.value === "max-age=456789; includeSubDomains");
  });

});
