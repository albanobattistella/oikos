// Generator für die TrueNAS-Catalog-Dateien von Oikos.
// Pure Funktionen (unten) sind testbar; runGenerate() macht die fs-Arbeit.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const STATIC_FILES = [
  'questions.yaml',
  'item.yaml',
  'README.md',
  'templates/docker-compose.yaml',
  'templates/test_values/basic-values.yaml',
];

export function assertValidSemver(version) {
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    throw new Error(`ungültige semver-Version: ${JSON.stringify(version)}`);
  }
  return version;
}

export function bumpVersion(current, type) {
  const [major, minor, patch] = assertValidSemver(current).split('.').map(Number);
  switch (type) {
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'major': return `${major + 1}.0.0`;
    default: throw new Error(`unbekannter bump-Typ: ${JSON.stringify(type)}`);
  }
}

export function substitute(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  const leftover = out.match(/\{\{([^}]+)\}\}/);
  if (leftover) {
    throw new Error(`Platzhalter nicht ersetzt: ${leftover[1]}`);
  }
  return out;
}

export function runGenerate({ sourceDir, outDir, pkgVersion, bump }) {
  assertValidSemver(pkgVersion);

  if (!existsSync(join(outDir, 'templates', 'library'))) {
    throw new Error(
      `outDir sieht nicht nach einem TrueNAS-App-Verzeichnis aus (kein templates/library): ${outDir}`,
    );
  }

  const cvPath = join(sourceDir, 'catalog-version.json');
  const current = JSON.parse(readFileSync(cvPath, 'utf8')).version;
  const catalogVersion = bumpVersion(current, bump);

  const written = [];

  const appTmpl = readFileSync(join(sourceDir, 'app.yaml.tmpl'), 'utf8');
  writeFileSync(
    join(outDir, 'app.yaml'),
    substitute(appTmpl, { APP_VERSION: pkgVersion, CATALOG_VERSION: catalogVersion }),
  );
  written.push('app.yaml');

  const ixTmpl = readFileSync(join(sourceDir, 'ix_values.yaml.tmpl'), 'utf8');
  writeFileSync(join(outDir, 'ix_values.yaml'), substitute(ixTmpl, { IMAGE_TAG: pkgVersion }));
  written.push('ix_values.yaml');

  for (const rel of STATIC_FILES) {
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(sourceDir, rel), dest);
    written.push(rel);
  }

  writeFileSync(cvPath, JSON.stringify({ version: catalogVersion }, null, 2) + '\n');

  return { appVersion: pkgVersion, catalogVersion, imageTag: pkgVersion, written };
}
