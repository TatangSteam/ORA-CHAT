import assert from 'node:assert/strict';
import { chunkDocumentText, extractDocumentText } from '../../apps/worker/src/document-content.ts';
import {
  answerNearestLocationQuestion,
  parseNearestLocationIntent
} from '../../apps/api/src/location-distance.ts';
import {
  chunkLexicalText,
  PrismaKnowledgeRepository
} from '../../apps/api/src/knowledge-repository.ts';

const original = 'A'.repeat(1000) + ' ' + 'B'.repeat(700);
const chunks = chunkDocumentText(original);
const lexicalChunks = chunkLexicalText(original);
for (const candidate of [chunks, lexicalChunks]) {
  assert.ok(candidate.some(({ content }) => content.includes('B'.repeat(700))));
}
console.log(
  JSON.stringify({
    check: 'chunk_coverage',
    documentChunkLengths: chunks.map(({ content }) => content.length),
    lexicalChunkLengths: lexicalChunks.map(({ content }) => content.length),
    missingCharacters: 0
  })
);

// Minimal complete one-page PDF with a standard Helvetica font and proper xref offsets.
function pdf(operator: string) {
  const stream = `BT /F1 12 Tf 72 720 Td ${operator} ET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`
  ];
  let value = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n`;
  value += offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('');
  value += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value);
}
assert.equal(await extractDocumentText(pdf('(RAHO) Tj'), 'application/pdf'), 'RAHO');
for (const operator of ['[(RAHO)] TJ', '<5241484f> Tj']) {
  const extracted = await extractDocumentText(pdf(operator), 'application/pdf');
  assert.equal(extracted, 'RAHO');
  console.log(JSON.stringify({ check: 'pdf_text_operator', operator, extracted }));
}

let geocodeCalls = 0;
const geocoder = {
  geocode: async () => {
    geocodeCalls++;
    return null;
  }
};
const first = await answerNearestLocationQuestion('Cabang terdekat?', geocoder);
assert.equal(first?.fallbackReason, 'location_clarification_required');
const next = await answerNearestLocationQuestion('Grogol, Jakarta Barat', geocoder, [
  'Cabang terdekat?'
]);
assert.equal(next, null);
assert.equal(geocodeCalls, 0);
assert.equal(parseNearestLocationIntent('Cabang terdekat mana?')?.originQuery, 'mana');
console.log(
  JSON.stringify({
    check: 'location_followup',
    initial: first?.fallbackReason,
    followup: next,
    geocodeCalls,
    ambiguousOrigin: parseNearestLocationIntent('Cabang terdekat mana?')?.originQuery
  })
);

let lexicalCalls = 0;
let traceWrites = 0;
const repository = new PrismaKnowledgeRepository(
  { knowledgeQuestionVariant: { findMany: async () => [] } } as never,
  Buffer.alloc(32),
  {} as never
) as any;
repository.activeRuntime = async () => ({
  integration: {
    retrievalEnabled: true,
    activeEmbeddingIndexVersion: { id: 'fixture-index', state: 'active', dimensions: 3 }
  },
  adapter: {
    embedQuery: async () => {
      throw new Error('PROVIDER_TIMEOUT');
    }
  }
});
repository.lexicalSearch = async () => {
  lexicalCalls++;
  return { status: 'ok', value: [] };
};
repository.persistTrace = async () => {
  traceWrites++;
};
await assert.rejects(
  () => repository.answer('fixture-tenant', 'Jam operasional RAHO?', 'fixture-request'),
  /PROVIDER_TIMEOUT/
);
assert.equal(lexicalCalls, 0);
assert.equal(traceWrites, 0);
console.log(
  JSON.stringify({
    check: 'embedding_outage',
    thrown: 'PROVIDER_TIMEOUT',
    lexicalCalls,
    traceWrites
  })
);
