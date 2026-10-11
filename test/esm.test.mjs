// CommonJS tests cannot see how this package looks to an `import`. A refactor
// to `module.exports = { getSTS }` would keep every require() test passing and
// break named imports, so pin them here.

import test from 'node:test';
import assert from 'node:assert';
import defaultExport, { getSTS } from '../lib/index.js';

test('getSTS is available as a named import', () => {
  assert.strictEqual(typeof getSTS, 'function');
});

test('the default import is the module object', () => {
  assert.deepStrictEqual(Object.keys(defaultExport), ['getSTS']);
  assert.strictEqual(defaultExport.getSTS, getSTS);
});

test('the named import works', () => {
  let value;
  getSTS({ 'max-age': { days: 30 } })(null, { setHeader: (name, header) => { value = header; } }, () => {});
  assert.strictEqual(value, 'max-age=2592000');
});
