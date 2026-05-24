/**
 * Frontend audit regression tests.
 * Guards the accessibility and hard-constraint fixes from the UX audit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('audited frontend files do not assign innerHTML', () => {
  const files = [
    './public/components/oikos-install-prompt.js',
    './public/pages/notes.js',
    './public/pages/meals.js',
  ];

  for (const file of files) {
    assert.doesNotMatch(read(file), /\.innerHTML\s*=/, `${file} must not assign innerHTML`);
  }
});

test('date helpers produce local YYYY-MM-DD keys without toISOString slicing', async () => {
  const { toLocalDateKey } = await import('./public/utils/date.js');
  const date = new Date(2026, 4, 24, 2, 30, 0);
  assert.equal(toLocalDateKey(date), '2026-05-24');
});

test('meals and budget pages do not slice toISOString for date keys', () => {
  for (const file of ['./public/pages/meals.js', './public/pages/budget.js']) {
    assert.doesNotMatch(read(file), /toISOString\(\)\.slice\(0,\s*10\)/, `${file} must use local date keys`);
  }
});

test('shared sub-tabs wire tabs to panels with aria-controls and aria-labelledby support', () => {
  const source = read('./public/utils/sub-tabs.js');
  assert.match(source, /btn\.id\s*=/);
  assert.match(source, /aria-controls/);
  assert.match(source, /aria-labelledby/);
});

test('settings theme toggle exposes pressed state', () => {
  const source = read('./public/pages/settings.js');
  assert.match(source, /aria-pressed/);
  assert.match(source, /setAttribute\('aria-pressed'/);
});

test('router hides inactive overlays from keyboard focus', () => {
  const source = read('./public/router.js');
  assert.match(source, /\.inert\s*=/);
  assert.match(source, /returnFocus/);
});
