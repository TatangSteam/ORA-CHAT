import { createHash } from 'node:crypto';
import console from 'node:console';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

const normalize = (value) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('id-ID').replace(/\s+/gu, ' ');
const hash = (value) => createHash('sha256').update(value).digest('hex');
// Stable UUIDs keep repeated imports of the same source idempotent.
const id = (key) => {
  const bytes = createHash('sha256').update(`raho-default-faq:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export function parseCsv(text) {
  const rows = [];
  let row = [],
    value = '',
    quoted = false;
  text = text.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(value);
      value = '';
      if (char === '\n') {
        rows.push(row);
        row = [];
      }
    } else value += char;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field');
  if (value || row.length) rows.push([...row, value]);
  return rows;
}

export function buildKnowledgeSeed(text) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex(
    (row) => row.includes('Pertanyaan_Utama') && row.includes('Jawaban')
  );
  if (headerIndex < 0) throw new Error('FAQ header not found');
  const headers = rows[headerIndex];
  const categories = new Map();
  const items = [];
  const titles = new Set();
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => !cell.trim())) continue;
    if (row.length !== headers.length)
      throw new Error(`Invalid CSV column count at FAQ ${items.length + 1}`);
    const record = Object.fromEntries(headers.map((key, index) => [key, row[index].trim()]));
    const title = record.Pertanyaan_Utama;
    const answer = record.Jawaban;
    const categoryName = record.Kategori;
    if (!title || !answer || !categoryName)
      throw new Error('FAQ requires question, answer and category');
    if (title.length > 240) throw new Error(`FAQ title too long: ${title}`);
    if (titles.has(normalize(title))) throw new Error(`Duplicate FAQ: ${title}`);
    titles.add(normalize(title));
    const status = record.Status.toLowerCase() || 'published';
    if (!['published', 'draft', 'archived'].includes(status))
      throw new Error(`Unsupported FAQ status: ${status}`);
    const slug = normalize(categoryName)
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/gu, '');
    if (!categories.has(slug))
      categories.set(slug, {
        id: id(`category:${slug}`),
        name: categoryName,
        parentId: null,
        slug
      });
    const itemId = id(`item:${normalize(title)}`);
    const versionId = id(`version:${normalize(title)}:1`);
    const questions = [title, ...record.Variasi_Pertanyaan.split(/[;\n]+|(?<=\?)\s+/u)]
      .map((question) => question.trim())
      .filter(Boolean);
    const variants = new Map();
    for (const question of questions) {
      if (question.length > 500) throw new Error(`Question variant too long: ${title}`);
      const normalizedQuestion = normalize(question);
      if (!variants.has(normalizedQuestion))
        variants.set(normalizedQuestion, {
          id: id(`variant:${versionId}:${normalizedQuestion}`),
          question,
          normalizedQuestion
        });
    }
    items.push({
      id: itemId,
      title,
      categoryId: categories.get(slug).id,
      status,
      revision: 1,
      currentVersionId: versionId,
      publishedVersionId: status === 'published' ? versionId : null,
      versions: [
        {
          id: versionId,
          answer,
          status,
          version: 1,
          approvedAt: null,
          archivedAt: null,
          contentHash: hash(answer),
          publishedAt: status === 'published' ? '2026-11-17T00:00:00.000Z' : null,
          questionVariants: [...variants.values()]
        }
      ]
    });
  }
  if (!items.length) throw new Error('FAQ is empty');
  return {
    schemaVersion: 1,
    sourceTenantSlug: 'default',
    categories: [...categories.values()],
    items
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = new URL('../packages/db/knowledge/default-faq.csv', import.meta.url);
  const output = new URL('../packages/db/src/knowledge-seed-data.json', import.meta.url);
  const seed = buildKnowledgeSeed(await readFile(source, 'utf8'));
  await writeFile(output, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(
    JSON.stringify({
      categories: seed.categories.length,
      items: seed.items.length,
      questionVariants: seed.items.reduce(
        (total, item) => total + item.versions[0].questionVariants.length,
        0
      )
    })
  );
}
