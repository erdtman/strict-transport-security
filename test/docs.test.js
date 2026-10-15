'use strict';

// The README is the only place most users read, and nothing executes it. These
// tests make every claim in it fail loudly when the behaviour moves.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const STS = require('../');

const README = fs.readFileSync(`${__dirname}/../README.md`, 'utf8');
const PKG = require('../package.json');

function escape (text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function header (options) {
  let value;
  STS.getSTS(options)(null, { setHeader: (name, sent) => { value = sent; } }, () => {});
  return value;
}

// Each entry is a line pair from the options section of the README: a call,
// and the header the README says it produces.
const documented = [
  { call: "sts.getSTS({ 'max-age': 86400 })", options: { 'max-age': 86400 }, value: 'max-age=86400' },
  {
    call: "sts.getSTS({ 'max-age': { hours: 12, minutes: 30 } })",
    options: { 'max-age': { hours: 12, minutes: 30 } },
    value: 'max-age=45000'
  },
  {
    call: "sts.getSTS({ 'max-age': { days: 365 }, includeSubDomains: true, preload: true })",
    options: { 'max-age': { days: 365 }, includeSubDomains: true, preload: true },
    value: 'max-age=31536000; includeSubDomains; preload'
  }
];

for (const { call, options, value } of documented) {
  test(`the README documents ${call} as ${value}`, () => {
    const pattern = new RegExp(`^${escape(call)};\\n// Strict-Transport-Security: ${escape(value)}$`, 'm');
    assert.match(README, pattern, 'the README no longer shows this call and value');
    assert.strictEqual(header(options), value);
  });
}

// The invalid-options block, as `call(); // ErrorName: message`.
const rejected = [
  { call: "sts.getSTS({ 'max-age': {} })", options: { 'max-age': {} }, name: 'TypeError', message: 'no recognized time units' },
  { call: "sts.getSTS({ 'max-age': '600' })", options: { 'max-age': '600' }, name: 'TypeError', message: 'must be a number or an object of time units' },
  { call: "sts.getSTS({ 'max-age': -1 })", options: { 'max-age': -1 }, name: 'RangeError', message: 'must be a non-negative integer' },
  { call: "sts.getSTS({ 'max-age': 1.5 })", options: { 'max-age': 1.5 }, name: 'RangeError', message: 'must be a non-negative integer' },
  {
    call: "sts.getSTS({ 'max-age': 1e21 })",
    options: { 'max-age': 1e21 },
    name: 'RangeError',
    message: 'must be a non-negative integer no greater than 9007199254740991'
  },
  { call: 'sts.getSTS({ maxAge: 600 })', options: { maxAge: 600 }, name: 'TypeError', message: "unknown option 'maxAge'" },
  {
    call: 'sts.getSTS({ includeSubdomains: true })',
    options: { includeSubdomains: true },
    name: 'TypeError',
    message: "unknown option 'includeSubdomains'"
  },
  {
    call: "sts.getSTS({ 'max-age': { week: 2 } })",
    options: { 'max-age': { week: 2 } },
    name: 'TypeError',
    message: "unknown time unit 'week'"
  }
];

for (const { call, options, name, message } of rejected) {
  test(`the README documents ${call} as ${name}: ${message}`, () => {
    const pattern = new RegExp(`^${escape(call)};\\s*// ${name}: ${escape(message)}$`, 'm');
    assert.match(README, pattern, 'the README no longer documents this rejection');
    assert.throws(() => STS.getSTS(options), (error) => {
      assert.strictEqual(error.name, name);
      assert.ok(
        error.message.includes(message),
        `expected ${JSON.stringify(error.message)} to contain ${JSON.stringify(message)}`
      );
      return true;
    });
  });
}

test('max-age: 0 is documented as accepted and is accepted', () => {
  assert.match(README, /`max-age: 0` is accepted/);
  assert.strictEqual(header({ 'max-age': 0 }), 'max-age=0');
});

test('the usage block and the example file are the same code', () => {
  const [usage] = [...README.matchAll(/```js\n([\s\S]*?)```/g)].map((match) => match[1]);
  const example = fs.readFileSync(`${__dirname}/../examples/express.js`, 'utf8');
  assert.strictEqual(
    usage.replace("require('strict-transport-security')", "require('../')"),
    example,
    'README usage block and examples/express.js have drifted apart'
  );
});

// `node --check` needs no dependencies, so a syntax error or a stale API in an
// example cannot sit there unnoticed, framework installed or not.
for (const file of fs.readdirSync(`${__dirname}/../examples`).sort()) {
  test(`examples/${file} parses`, () => {
    execFileSync(process.execPath, ['--check', `${__dirname}/../examples/${file}`]);
  });
}

test('the README documents a factory for every framework, and no others', () => {
  const [, section] = README.match(/\n## Frameworks\n([\s\S]*?)\n### /);
  const factories = [...section.matchAll(/^\| [^|]+ \| `(\w+)` \|/gm)].map((match) => match[1]);

  assert.deepStrictEqual(factories.sort(), Object.keys(STS).sort());
});

test('the README states the supported Node.js version from package.json', () => {
  const [, minimum] = PKG.engines.node.match(/^>=(\d+)/);
  assert.match(README, new RegExp(`Requires Node\\.js ${minimum} or later`));
});

test('the README documents every option, and no others', () => {
  const [, section] = README.match(/\n## Options\n([\s\S]*?)\n## /);
  const rows = [...section.matchAll(/^\| `([^`]+)` \| /gm)].map((match) => match[1]);
  assert.deepStrictEqual(rows, ['max-age', 'includeSubDomains', 'preload', 'secureOnly']);
  for (const option of rows) {
    assert.doesNotThrow(() => STS.getSTS({ [option]: option === 'max-age' ? 1 : true }), `${option} is documented but rejected`);
  }
});
