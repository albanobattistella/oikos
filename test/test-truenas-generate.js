import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertValidSemver, bumpVersion, substitute } from '../tools/truenas/generate.mjs';
import { runGenerate } from '../tools/truenas/generate.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Baut ein minimales sourceDir + outDir im tmp und liefert die Pfade.
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'truenas-gen-'));
  const sourceDir = join(root, 'src');
  const outDir = join(root, 'out');
  mkdirSync(join(sourceDir, 'templates', 'test_values'), { recursive: true });
  // outDir simuliert das Fork-App-Verzeichnis inkl. (leerer) Library
  mkdirSync(join(outDir, 'templates', 'library', 'base_v2_3_6'), { recursive: true });

  writeFileSync(join(sourceDir, 'catalog-version.json'), JSON.stringify({ version: '1.0.0' }) + '\n');
  writeFileSync(join(sourceDir, 'app.yaml.tmpl'), 'app_version: {{APP_VERSION}}\nversion: {{CATALOG_VERSION}}\n');
  writeFileSync(join(sourceDir, 'ix_values.yaml.tmpl'), 'tag: {{IMAGE_TAG}}\n');
  writeFileSync(join(sourceDir, 'questions.yaml'), 'groups: []\n');
  writeFileSync(join(sourceDir, 'item.yaml'), 'categories: [productivity]\n');
  writeFileSync(join(sourceDir, 'README.md'), '# Oikos\n');
  writeFileSync(join(sourceDir, 'templates', 'docker-compose.yaml'), '{{ tpl.render() }}\n');
  writeFileSync(join(sourceDir, 'templates', 'test_values', 'basic-values.yaml'), 'oikos: {}\n');
  return { root, sourceDir, outDir };
}

test('assertValidSemver akzeptiert gültiges semver', () => {
  assert.equal(assertValidSemver('0.60.11'), '0.60.11');
  assert.equal(assertValidSemver('1.0.0'), '1.0.0');
});

test('assertValidSemver wirft bei ungültiger Version', () => {
  assert.throws(() => assertValidSemver('1.2'), /ungültige semver/i);
  assert.throws(() => assertValidSemver('v1.2.3'), /ungültige semver/i);
  assert.throws(() => assertValidSemver(''), /ungültige semver/i);
});

test('bumpVersion: patch erhöht die letzte Stelle', () => {
  assert.equal(bumpVersion('1.0.0', 'patch'), '1.0.1');
  assert.equal(bumpVersion('1.2.9', 'patch'), '1.2.10');
});

test('bumpVersion: minor erhöht die mittlere Stelle und nullt patch', () => {
  assert.equal(bumpVersion('1.0.5', 'minor'), '1.1.0');
});

test('bumpVersion: major erhöht die erste Stelle und nullt rest', () => {
  assert.equal(bumpVersion('1.4.5', 'major'), '2.0.0');
});

test('bumpVersion wirft bei unbekanntem Typ', () => {
  assert.throws(() => bumpVersion('1.0.0', 'huge'), /unbekannter bump/i);
});

test('substitute ersetzt alle bekannten Platzhalter', () => {
  const out = substitute('a={{X}} b={{Y}} c={{X}}', { X: '1', Y: '2' });
  assert.equal(out, 'a=1 b=2 c=1');
});

test('substitute wirft, wenn ein {{...}}-Platzhalter übrig bleibt', () => {
  assert.throws(() => substitute('a={{X}} b={{Z}}', { X: '1' }), /nicht ersetzt.*Z/i);
});

test('runGenerate rendert Versionsfelder und kopiert statische Dateien', () => {
  const { sourceDir, outDir } = makeFixture();
  const result = runGenerate({ sourceDir, outDir, pkgVersion: '0.61.0', bump: 'patch' });

  assert.equal(result.appVersion, '0.61.0');
  assert.equal(result.imageTag, '0.61.0');
  assert.equal(result.catalogVersion, '1.0.1');

  const appYaml = readFileSync(join(outDir, 'app.yaml'), 'utf8');
  assert.match(appYaml, /app_version: 0\.61\.0/);
  assert.match(appYaml, /version: 1\.0\.1/);

  const ixValues = readFileSync(join(outDir, 'ix_values.yaml'), 'utf8');
  assert.match(ixValues, /tag: 0\.61\.0/);

  assert.equal(
    readFileSync(join(outDir, 'questions.yaml'), 'utf8'),
    readFileSync(join(sourceDir, 'questions.yaml'), 'utf8'),
  );
  assert.ok(existsSync(join(outDir, 'templates', 'docker-compose.yaml')));
  assert.ok(existsSync(join(outDir, 'templates', 'test_values', 'basic-values.yaml')));

  const cv = JSON.parse(readFileSync(join(sourceDir, 'catalog-version.json'), 'utf8'));
  assert.equal(cv.version, '1.0.1');
});

test('runGenerate respektiert minor-bump', () => {
  const { sourceDir, outDir } = makeFixture();
  const result = runGenerate({ sourceDir, outDir, pkgVersion: '0.61.0', bump: 'minor' });
  assert.equal(result.catalogVersion, '1.1.0');
});

test('runGenerate wirft, wenn outDir kein templates/library enthält', () => {
  const { sourceDir, outDir } = makeFixture();
  const badOut = outDir + '-empty';
  mkdirSync(badOut, { recursive: true });
  assert.throws(
    () => runGenerate({ sourceDir, outDir: badOut, pkgVersion: '0.61.0', bump: 'patch' }),
    /templates\/library/,
  );
});

test('runGenerate wirft bei ungültiger pkgVersion', () => {
  const { sourceDir, outDir } = makeFixture();
  assert.throws(
    () => runGenerate({ sourceDir, outDir, pkgVersion: 'nightly', bump: 'patch' }),
    /ungültige semver/i,
  );
});
