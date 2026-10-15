// CommonJS tests cannot see how this package looks to an `import`. A refactor
// to `module.exports = { getSTS }` would keep every require() test passing and
// break named imports, so pin them here.

import test from 'node:test';
import assert from 'node:assert';
import defaultExport, {
  getSTSHeader,
  getSTS,
  getFastifySTS,
  getKoaSTS,
  getHonoSTS,
  getHapiSTS,
  getHeadersSTS
} from '../lib/index.js';

test('getSTS is available as a named import', () => {
  assert.strictEqual(typeof getSTS, 'function');
});

test('every framework factory is available as a named import', () => {
  for (const factory of [getSTSHeader, getFastifySTS, getKoaSTS, getHonoSTS, getHapiSTS, getHeadersSTS]) {
    assert.strictEqual(typeof factory, 'function');
  }
});

test('the default import is the module object', () => {
  assert.deepStrictEqual(Object.keys(defaultExport), ['getSTSHeader', 'getSTS', 'getFastifySTS', 'getKoaSTS', 'getHonoSTS', 'getHapiSTS', 'getHeadersSTS']);
  assert.strictEqual(defaultExport.getSTS, getSTS);
});

test('the named import works', () => {
  let value;
  getSTS({ 'max-age': { days: 30 } })(null, { setHeader: (name, header) => { value = header; } }, () => {});
  assert.strictEqual(value, 'max-age=2592000');
});
