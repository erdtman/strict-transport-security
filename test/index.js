/* jshint esversion: 6 */
/* jslint node: true */
'use strict';

const test = require('ava');
const STS = require('../');

function getRes (result) {
  return {
    setHeader: (name, value) => {
      result.name = name;
      result.value = value;
    }
  };
}

function next () {}

test('default', t => {
  const sts = STS.getSTS();
  const result = {};
  sts(null, getRes(result), next);

  t.is(result.name, 'Strict-Transport-Security');
  t.is(result.value, 'max-age=2592000');
});

test('set direct', t => {
  const sts = STS.getSTS({
    'max-age': 12345
  });
  const result = {};
  sts(null, getRes(result), next);

  t.is(result.name, 'Strict-Transport-Security');
  t.is(result.value, 'max-age=12345');
});

test('all time parametes', t => {
  const sts = STS.getSTS({
    'max-age': {
      'seconds': 1,
      'minutes': 1,
      'hours': 1,
      'days': 1
    }
  });

  const result = {};
  sts(null, getRes(result), next);

  t.is(result.name, 'Strict-Transport-Security');
  t.is(result.value, 'max-age=90061');
});

test('include subdomains', t => {
  const sts = STS.getSTS({
    'max-age': 456789,
    'includeSubDomains': true
  });
  const result = {};
  sts(null, getRes(result), next);

  t.is(result.name, 'Strict-Transport-Security');
  t.is(result.value, 'max-age=456789; includeSubDomains');
});

test('preload', t => {
  const sts = STS.getSTS({
    'max-age': 456789,
    'preload': true
  });
  const result = {};
  sts(null, getRes(result), next);

  t.is(result.name, 'Strict-Transport-Security');
  t.is(result.value, 'max-age=456789; preload');
});

test('include subdomains and preload', t => {
  const sts = STS.getSTS({
    'max-age': 456789,
    'includeSubDomains': true,
    'preload': true
  });
  const result = {};
  sts(null, getRes(result), next);

  t.is(result.name, 'Strict-Transport-Security');
  t.is(result.value, 'max-age=456789; includeSubDomains; preload');
});