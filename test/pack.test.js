'use strict';

// Nothing else checks that what npm publishes is usable: `main`, the `files`
// whitelist and the tarball contents are only exercised at publish time, when
// a mistake is permanent. This packs the package and runs the result.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PKG = require('../package.json');

// npm 10 and 11 report `pack --json` as an array of results; npm 12 reports an
// object keyed by package name. The publish workflow upgrades npm before it
// packs, so this has to read both.
function packed (output) {
  const reported = JSON.parse(output);
  const results = (Array.isArray(reported) ? reported : Object.values(reported)).flat();
  const [result] = results;
  assert.strictEqual(typeof result?.filename, 'string', `npm pack --json reported an unfamiliar shape: ${output}`);
  return result;
}

function pack (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sts-pack-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const output = execFileSync(npm, ['pack', '--json', '--pack-destination', directory], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const { filename, files } = packed(output);

  execFileSync('tar', ['-xzf', path.join(directory, filename), '-C', directory]);
  return { directory: path.join(directory, 'package'), files: files.map((file) => file.path).sort() };
}

test('the tarball holds the whitelisted files and nothing else', (t) => {
  const { files } = pack(t);
  assert.deepStrictEqual(files, ['LICENSE', 'README.md', 'lib/index.js', 'package.json']);
});

test('the packed package loads through its main entry point and works', (t) => {
  const { directory } = pack(t);

  // Require it the way a dependent would: by the path npm would install to,
  // resolved through package.json "main" rather than a known file name.
  // realpath because macOS resolves /var through a symlink to /private/var.
  const entry = require.resolve(directory);
  assert.strictEqual(entry, fs.realpathSync(path.join(directory, PKG.main)));

  const packed = require(entry);
  let value;
  packed.getSTS({ 'max-age': { days: 30 } })(null, { setHeader: (name, sent) => { value = sent; } }, () => {});
  assert.strictEqual(value, 'max-age=2592000');
});

test('the packed package has no dependencies to install', (t) => {
  const { directory } = pack(t);
  const packed = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  assert.deepStrictEqual(packed.dependencies, {});
  assert.strictEqual(packed.peerDependencies, undefined);
  assert.strictEqual(packed.optionalDependencies, undefined);
});
