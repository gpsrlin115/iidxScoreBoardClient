import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLocales, compareLocales, flatten } from '../scripts/check-i18n-keys.mjs';

const locales = (ko, ja = ko, en = ko) => ({ ko, ja, en });

test('every shipped locale has exactly the keys and placeholders of ko', () => {
  assert.deepEqual(checkLocales(), []);
});

test('flatten walks nested objects into dotted leaf keys', () => {
  assert.deepEqual([...flatten({ a: { b: 'x', c: { d: 'y' } }, e: 'z' }).keys()], ['a.b', 'a.c.d', 'e']);
});

test('a key missing from ja or en is reported against that language', () => {
  const problems = compareLocales(locales({ f: { a: 'A', b: 'B' } }, { f: { a: 'A' } }, { f: { b: 'B' } }));
  assert.deepEqual(problems, [
    { language: 'ja', kind: 'missing', key: 'f.b' },
    { language: 'en', kind: 'missing', key: 'f.a' },
  ]);
});

test('a key that only ja or en has is reported as extra', () => {
  const problems = compareLocales(locales({ f: { a: 'A' } }, { f: { a: 'A', z: 'Z' } }));
  assert.deepEqual(problems, [{ language: 'ja', kind: 'extra', key: 'f.z' }]);
});

test('a placeholder that differs from ko is reported, whatever the order', () => {
  const ok = compareLocales(locales({ f: { a: '{{x}} {{y}}' } }, { f: { a: '{{y}} {{x}}' } }));
  assert.deepEqual(ok, []);
  const bad = compareLocales(locales({ f: { a: '{{x}}' } }, { f: { a: '{{y}}' } }));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].kind, 'placeholder');
});

test('an empty translation counts as a problem', () => {
  const problems = compareLocales(locales({ f: { a: 'A' } }, { f: { a: ' ' } }));
  assert.deepEqual(problems, [{ language: 'ja', kind: 'empty', key: 'f.a' }]);
});

test('plural forms are compared by base key because each language has its own set', () => {
  const problems = compareLocales(locales(
    { f: { item_other: '{{count}} items' } },
    { f: { item_other: '{{count}}個' } },
    { f: { item_one: '{{count}} item', item_other: '{{count}} items' } },
  ));
  assert.deepEqual(problems, []);
});
