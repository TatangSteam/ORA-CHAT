import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { buildKnowledgeSeed, parseCsv } from './build-knowledge-seed.mjs';

test('CSV preserves multiline answers, commas, escaped quotes and BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"hello, world","line 1\r\n""line 2"""\r\n'), [
    ['a', 'b'],
    ['hello, world', 'line 1\n"line 2"']
  ]);
  assert.throws(() => parseCsv('"unfinished'), /unterminated/);
});

test('default seed matches the complete CSV and produces stable, unique identities', async () => {
  const csv = await readFile(
    new URL('../packages/db/knowledge/default-faq.csv', import.meta.url),
    'utf8'
  );
  const seed = buildKnowledgeSeed(csv);
  const checkedIn = JSON.parse(
    await readFile(new URL('../packages/db/src/knowledge-seed-data.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(seed, checkedIn);
  assert.equal(seed.items.length, 38);
  assert.equal(seed.categories.length, 29);
  const rows = parseCsv(csv);
  const header = rows.findIndex((row) => row.includes('Pertanyaan_Utama'));
  const sourceRows = rows.slice(header + 1).filter((row) => row.some((cell) => cell.trim()));
  const ids = seed.categories.map((category) => category.id);
  seed.items.forEach((item, index) => {
    const version = item.versions[0];
    assert.equal(item.title, sourceRows[index][2].trim());
    assert.equal(version.answer, sourceRows[index][4].trim());
    assert.equal(item.publishedVersionId, version.id);
    assert.equal(version.status, 'published');
    assert.ok(version.questionVariants.some((variant) => variant.question === item.title));
    ids.push(item.id, version.id, ...version.questionVariants.map((variant) => variant.id));
  });
  assert.equal(new Set(ids).size, ids.length);
});

test('rejects incomplete FAQ rather than silently seeding partial information', () => {
  assert.throws(
    () =>
      buildKnowledgeSeed(
        'Kategori,Pertanyaan_Utama,Jawaban,Status,Variasi_Pertanyaan\nUmum,Hello,,,Hi'
      ),
    /requires/
  );
});
